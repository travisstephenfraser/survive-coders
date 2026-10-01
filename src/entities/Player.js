import Phaser from 'phaser';
import Laptop from './Laptop.js';
import { MAX_HP, worldText } from '../util.js';
import { pop, shake } from '../fx.js';
import { TOUCH, touch } from '../touch.js';

const SPEED = 95;
// A prompt every 183 ms, the rate a 60 Hz screen gave when each shot waited for the first frame
// past 170 ms. Shots now carry their timing over (below), so the rate is the same at any
// refresh rate; it used to quicken to 171 ms at 240 Hz and slow to 200 ms at 30 Hz.
const FIRE_MS = 183;
const STREAM_MS = 40; // MAX: 25 characters a second
// Jump designed from height + time-to-apex (Pittman, "Building a Better Jump", GDC 2016):
// v0 = 2h/t, g = 2h/t². h = 70px (4.4 tiles), t = 0.38s. Then Celeste-style forgiveness:
// coyote time, jump buffer, half gravity at the apex while held, heavier fall, capped fall.
const JUMP_H = 70;
const JUMP_T = 0.38;
const JUMP = (2 * JUMP_H) / JUMP_T; // ≈ 368 px/s
const RISE_G = (2 * JUMP_H) / (JUMP_T * JUMP_T); // ≈ 970 px/s²
const WORLD_G = 600; // must match main.js arcade gravity; bodies add extra gravity on top
const COYOTE_MS = 100;
const BUFFER_MS = 120;
const APEX_VY = 40; // Celeste: half gravity while |vy| < 40 and jump is held
const FALL_G = RISE_G * 1.6; // SMB falls ~3.5x; 1.6x keeps it readable at 3x zoom
const MAX_FALL = 280;
const SNAP_MS = 100;
const SNAPS = 30; // ~3s of rollback history
const TRAP_MS = 2600; // a founder's demo runs this long before it crashes on its own
const TRAP_MASHES = 7; // or mash your way out sooner
const LOCK_GRACE_MS = 1000; // after a contract lock ends, no new lock for this long

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player_idle');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setSize(10, 14).setOffset(3, 2);
    this.setCollideWorldBounds(true);
    this.setDepth(5);
    this.facing = 1;
    this.invulnUntil = 0;
    this.knockUntil = 0;
    this.reversedUntil = 0;
    // Reversed controls show on the player, not in the HUD: the gaslight head's <-> as a chip.
    this.reversedChip = worldText(scene, x, y, '<->', { color: '#7a4fbf', bg: '#f5f5f5', size: 6, depth: 47 }).setVisible(false);
    // Caught in a founder's demo: the way out, shown on the player like the reversed chip.
    this.trapChip = worldText(scene, x, y, TOUCH ? 'MASH!' : 'MASH ↑', { color: '#0d0d0d', bg: '#e3b341', size: 6, depth: 47 }).setVisible(false);
    this.trapped = null;
    // Locked into a contract (a CRM agent's): no firing. The chip and its fine print ride along.
    this.lockChip = worldText(scene, x, y, 'LOCKED IN', { color: '#f5f5f5', bg: '#e5534b', size: 6, depth: 47 }).setVisible(false);
    this.lockFine = worldText(scene, x, y, '*auto-renews annually', { tiny: true, color: '#f5f5f5', bg: '#0d0d0d', depth: 47 }).setVisible(false);
    this.lockedUntil = 0;
    this.lockGraceUntil = 0;
    this.launchedUntil = 0;
    this.touchFireWas = false;
    this.fireLatched = false; // fire held since an intro: needs a fresh press (swallowEdges)
    this.coyoteUntil = 0;
    this.jumpBufferedUntil = 0;
    this.wasOnFloor = true;
    this.nextFire = 0;
    this.streamed = 0;
    this.lastSnap = 0;
    this.history = [];
    this.safe = { x, y };
    this.keys = scene.input.keyboard.addKeys({
      left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D',
      jump: 'UP', jump2: 'W', jump3: 'Z',
      fire: 'SPACE', fire2: 'X', fire3: 'J',
    });
    this.laptop = new Laptop(scene, this);
    pop(this);
    pop(this.laptop);
  }

  // Squash & stretch around the sprite center (sy > 1 = stretch).
  pose(sx, sy, ms = 110) {
    this.scene.tweens.killTweensOf(this);
    this.setScale(sx, sy);
    this.scene.tweens.add({ targets: this, scaleX: 1, scaleY: 1, duration: ms, ease: 'Quad.out' });
  }

  get hp() {
    return this.scene.registry.get('hp');
  }

  set hp(v) {
    this.scene.registry.set('hp', Phaser.Math.Clamp(v, 0, MAX_HP));
  }

  tick(time) {
    if (this.dead) return;
    if (this.scene.inputLocked) {
      this.holdStill(time);
      return;
    }
    const k = this.keys;
    if (this.trapped) {
      this.tickTrapped(time);
      return;
    }
    let dir = (k.right.isDown || k.d.isDown || touch.right ? 1 : 0) - (k.left.isDown || k.a.isDown || touch.left ? 1 : 0);
    const reversed = time < this.reversedUntil;
    if (reversed) dir = -dir;
    const left = this.reversedUntil - time; // the chip blinks through its last 0.6s
    this.reversedChip.setVisible(reversed && (left > 600 || Math.floor(time / 100) % 2 === 0)).setPosition(this.x, this.y - 16);

    const onFloor = this.body.blocked.down;
    if (time > this.knockUntil) this.setVelocityX(dir * SPEED);
    if (dir) {
      this.facing = dir;
      this.setFlipX(dir < 0);
    }

    const JD = Phaser.Input.Keyboard.JustDown;
    const jumpHeld = k.jump.isDown || k.jump2.isDown || k.jump3.isDown || touch.jump;
    const touchJump = touch.takeJump(); // always consumed, so a press can't linger a frame
    if (JD(k.jump) || JD(k.jump2) || JD(k.jump3) || touchJump) this.jumpBufferedUntil = time + BUFFER_MS;
    if (onFloor) this.coyoteUntil = time + COYOTE_MS;
    if (time < this.jumpBufferedUntil && time < this.coyoteUntil) {
      this.setVelocityY(-JUMP);
      this.coyoteUntil = 0;
      this.jumpBufferedUntil = 0;
      this.pose(0.8, 1.25);
      this.scene.sfx?.('jump', 0.4);
    }
    const vy = this.body.velocity.y;
    // Short hop on release (not while a fountain is launching you).
    if (!jumpHeld && vy < -120 && time > this.launchedUntil) this.setVelocityY(-120);
    const apex = !onFloor && jumpHeld && Math.abs(vy) < APEX_VY;
    const g = onFloor ? WORLD_G : apex ? RISE_G / 2 : vy > 0 ? FALL_G : RISE_G;
    this.body.setGravityY(g - WORLD_G);
    if (vy > MAX_FALL) this.setVelocityY(MAX_FALL); // cap the fall only (maxVelocity would also cap the jump)

    if (onFloor && !this.wasOnFloor) {
      this.pose(1.25, 0.8, 130);
      this.scene.dust?.(this.x, this.body.bottom);
    }
    this.wasOnFloor = onFloor;

    if (!onFloor) {
      this.stop();
      this.setTexture('player_jump');
    } else if (dir) this.play('run', true);
    else {
      this.stop();
      this.setTexture('player_idle');
    }

    const locked = time < this.lockedUntil;
    this.lockChip.setVisible(locked).setPosition(this.x, this.y - 22);
    this.lockFine.setVisible(locked).setPosition(this.x, this.y - 14);
    const fireHeld = k.fire.isDown || k.fire2.isDown || k.fire3.isDown || touch.fire;
    if (!fireHeld) this.fireLatched = false; // let go since an intro: fire works again
    const firing = !locked && !this.fireLatched && fireHeld;
    const tokens = () => this.scene.registry.get('maxTokens') > 0;
    if (firing && tokens()) {
      // MAX streams in fixed steps and catches up within a frame, so the rate is the same at
      // 60 and 120 FPS. A stale timer (not streaming last frame) restarts from now, no burst.
      if (time - this.nextFire > STREAM_MS) this.nextFire = time;
      while (time >= this.nextFire && tokens()) {
        this.nextFire += STREAM_MS;
        this.scene.fireStream(this.laptop.x, this.laptop.y, this.facing);
        if (++this.streamed % 4 === 0) {
          this.laptop.kick();
          this.scene.sfx?.('shoot', 0.15);
        }
      }
    } else if (firing && time > this.nextFire) {
      // Steady fire keeps the beat; the first shot after a pause in firing starts a new one.
      this.nextFire = (time - this.nextFire > FIRE_MS ? time : this.nextFire) + FIRE_MS;
      this.scene.firePrompt(this.laptop.x, this.laptop.y, this.facing);
      this.laptop.kick();
      this.scene.sfx?.('shoot', 0.25);
    }

    if (time > this.lastSnap + SNAP_MS) {
      this.lastSnap = time;
      this.history.push({ x: this.x, y: this.y, hp: this.hp });
      if (this.history.length > SNAPS) this.history.shift();
    }
    // Pit respawn point: only real ground tiles (never a moving platform over a gap).
    if (onFloor && time > this.knockUntil && this.scene.layer.getTileAtWorldXY(this.x, this.body.bottom + 2)) {
      this.safe = { x: this.x, y: this.y };
    }

    this.setAlpha(time < this.invulnUntil && Math.floor(time / 80) % 2 ? 0.35 : 1);
    this.laptop.follow(time);
  }

  // An intro owns the controls: presses made meanwhile are dropped, and fire held through its
  // end needs a fresh press (a SPACE that skipped an intro used to fire a prompt as well).
  // Velocity is left alone: the intros script the player's hop out of the car and the gondola.
  swallowEdges() {
    const k = this.keys;
    const JD = Phaser.Input.Keyboard.JustDown;
    for (const key of [k.jump, k.jump2, k.jump3]) JD(key);
    touch.takeJump();
    this.jumpBufferedUntil = 0;
    this.fireLatched = true;
  }

  // Controls held with the player in play (the Hydra's entrance): stand where you are.
  holdStill(time) {
    this.swallowEdges();
    this.setVelocityX(0);
    this.body.setGravityY(0);
    if (this.body.blocked.down) {
      this.stop();
      this.setTexture('player_idle');
    }
    this.laptop.follow(time);
  }

  // A founder's demo: frozen in place until the demo crashes or you mash your way out.
  trap(by) {
    this.trapped = { by, until: this.scene.time.now + TRAP_MS, n: 0 };
    this.touchFireWas = touch.fire; // a fire button already held doesn't count as a mash
    this.setVelocity(0, this.body.velocity.y);
    this.stop();
    this.setTexture('player_idle');
    this.trapChip.setVisible(true);
  }

  tickTrapped(time) {
    const k = this.keys;
    const t = this.trapped;
    const JD = Phaser.Input.Keyboard.JustDown;
    const touchFire = touch.fire && !this.touchFireWas;
    this.touchFireWas = touch.fire;
    const presses = [k.jump, k.jump2, k.jump3, k.fire, k.fire2, k.fire3].filter((key) => JD(key)).length + (touch.takeJump() ? 1 : 0) + (touchFire ? 1 : 0);
    if (presses) {
      t.n += presses;
      this.pose(1.15, 0.9, 80);
    }
    this.setVelocityX(0);
    this.trapChip.setPosition(this.x, this.y - 16).setVisible(Math.floor(time / 150) % 2 === 0);
    if (t.n >= TRAP_MASHES || time > t.until) this.release(t.n >= TRAP_MASHES);
    this.setAlpha(time < this.invulnUntil && Math.floor(time / 80) % 2 ? 0.35 : 1);
    this.laptop.follow(time);
  }

  release(escaped = false) {
    const t = this.trapped;
    if (!t) return;
    this.trapped = null;
    this.trapChip.setVisible(false);
    this.invulnUntil = Math.max(this.invulnUntil, this.scene.time.now + 700);
    t.by.endDemo?.(escaped);
  }

  get locked() {
    return this.scene.time.now < this.lockedUntil;
  }

  // Locked into a contract: no firing for `ms`. Powers still work, and "refactor" voids it.
  lock(ms) {
    const now = this.scene.time.now;
    if (this.dead || now < this.lockGraceUntil) return false;
    this.lockedUntil = now + ms;
    this.lockGraceUntil = this.lockedUntil + LOCK_GRACE_MS;
    this.scene.onLocked?.();
    return true;
  }

  // Void the contract. Returns whether there was one.
  unlock() {
    const was = this.locked;
    this.lockedUntil = 0;
    this.lockChip.setVisible(false);
    this.lockFine.setVisible(false);
    if (was) this.lockGraceUntil = this.scene.time.now + LOCK_GRACE_MS;
    return was;
  }

  // Shoved aside without damage (a jogger lapping you).
  bump(fromX) {
    if (!this.targetable) return;
    this.release();
    this.knockUntil = this.scene.time.now + 260;
    this.setVelocity((this.x < fromX ? -1 : 1) * 170, -130);
    this.pose(0.85, 1.15);
  }

  // Thrown upward by something other than a jump (a fountain jet).
  launch(vy) {
    if (this.dead || this.body.velocity.y < vy) return;
    this.release();
    this.setVelocityY(vy);
    this.launchedUntil = this.scene.time.now + 700;
    this.coyoteUntil = 0;
    this.pose(0.8, 1.3);
  }

  get god() {
    return Boolean(this.scene.registry.get('god'));
  }

  // Whether attacks can reach the player at all. God mode and i-frames only protect HP.
  get targetable() {
    return !this.dead && !this.scene.outcome && !this.scene.cutscene;
  }

  hurt(dmg, fromX, force = false) {
    const t = this.scene.time.now;
    if (!this.targetable || this.god || (!force && t < this.invulnUntil)) return false;
    this.release();
    this.hp -= dmg;
    this.invulnUntil = t + 1000;
    this.knockUntil = t + 220;
    this.setVelocity((this.x < fromX ? -1 : 1) * 120, -160);
    shake(this.scene.cameras.main, 120, 0.006);
    this.scene.hitStop?.(100);
    this.scene.sfx?.('hurt', 0.5);
    if (this.hp <= 0) {
      this.dead = true;
      this.reversedChip.setVisible(false);
      this.trapChip.setVisible(false);
      this.unlock();
      this.setTint(0xe5534b);
      this.scene.onPlayerDead();
    }
    return true;
  }

  fellInPit() {
    if ((this.god || this.hurt(1, this.x, true)) && !this.dead) {
      this.setPosition(this.safe.x - this.facing * 8, this.safe.y - 4);
      this.setVelocity(0, 0);
    }
  }

  reverseControls(ms) {
    this.reversedUntil = this.scene.time.now + ms;
  }

  // Rewind to ~3s ago and heal at least one HP. `bounds` ({ x0, x1 }, or none) keeps the rewind
  // inside walls the player is locked behind (the park's demo day): it goes to the oldest place
  // within them, or stays put, since three seconds ago can be outside the walls (they close
  // once you're in), and a rollback there left you shut out of the fight.
  rollback(bounds) {
    const snap = this.history[0];
    if (!snap) return;
    const place = bounds ? (this.history.find((s) => s.x >= bounds.x0 && s.x <= bounds.x1) ?? { x: this.x, y: this.y }) : snap;
    this.release();
    const ghost = this.scene.add.image(this.x, this.y, this.texture.key).setFlipX(this.flipX).setAlpha(0.6).setTint(0xd97757);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 500, onComplete: () => ghost.destroy() });
    this.setPosition(place.x, place.y);
    this.setVelocity(0, 0);
    this.hp = Math.max(this.hp + 1, snap.hp);
    this.history = [];
    this.invulnUntil = this.scene.time.now + 800;
  }
}
