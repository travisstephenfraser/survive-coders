import Phaser from 'phaser';
import Laptop from './Laptop.js';
import { MAX_HP } from '../util.js';

const SPEED = 95;
const FIRE_MS = 170;
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
    this.coyoteUntil = 0;
    this.jumpBufferedUntil = 0;
    this.wasOnFloor = true;
    this.nextFire = 0;
    this.lastSnap = 0;
    this.history = [];
    this.safe = { x, y };
    this.keys = scene.input.keyboard.addKeys({
      left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D',
      jump: 'UP', jump2: 'W', jump3: 'Z',
      fire: 'SPACE', fire2: 'X', fire3: 'J',
    });
    this.laptop = new Laptop(scene, this);
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
    const k = this.keys;
    let dir = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const reversed = time < this.reversedUntil;
    if (this.scene.registry.get('reversed') !== reversed) this.scene.registry.set('reversed', reversed);
    if (reversed) dir = -dir;

    const onFloor = this.body.blocked.down;
    if (time > this.knockUntil) this.setVelocityX(dir * SPEED);
    if (dir) {
      this.facing = dir;
      this.setFlipX(dir < 0);
    }

    const JD = Phaser.Input.Keyboard.JustDown;
    const jumpHeld = k.jump.isDown || k.jump2.isDown || k.jump3.isDown;
    if (JD(k.jump) || JD(k.jump2) || JD(k.jump3)) this.jumpBufferedUntil = time + BUFFER_MS;
    if (onFloor) this.coyoteUntil = time + COYOTE_MS;
    if (time < this.jumpBufferedUntil && time < this.coyoteUntil) {
      this.setVelocityY(-JUMP);
      this.coyoteUntil = 0;
      this.jumpBufferedUntil = 0;
      this.pose(0.8, 1.25);
      this.scene.sfx?.('jump', 0.4);
    }
    const vy = this.body.velocity.y;
    if (!jumpHeld && vy < -120) this.setVelocityY(-120); // short hop on release
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

    if ((k.fire.isDown || k.fire2.isDown || k.fire3.isDown) && time > this.nextFire) {
      this.nextFire = time + FIRE_MS;
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

  get god() {
    return Boolean(this.scene.registry.get('god'));
  }

  hurt(dmg, fromX, force = false) {
    const t = this.scene.time.now;
    if (this.dead || this.scene.outcome || this.god || (!force && t < this.invulnUntil)) return false;
    this.hp -= dmg;
    this.invulnUntil = t + 1000;
    this.knockUntil = t + 220;
    this.setVelocity((this.x < fromX ? -1 : 1) * 120, -160);
    this.scene.cameras.main.shake(120, 0.006);
    this.scene.hitStop?.(100);
    this.scene.sfx?.('hurt', 0.5);
    if (this.hp <= 0) {
      this.dead = true;
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

  // Rewind to ~3s ago and heal at least one HP.
  rollback() {
    const snap = this.history[0];
    if (!snap) return;
    const ghost = this.scene.add.image(this.x, this.y, this.texture.key).setFlipX(this.flipX).setAlpha(0.6).setTint(0xd97757);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 500, onComplete: () => ghost.destroy() });
    this.setPosition(snap.x, snap.y);
    this.setVelocity(0, 0);
    this.hp = Math.max(this.hp + 1, snap.hp);
    this.history = [];
    this.invulnUntil = this.scene.time.now + 800;
  }
}
