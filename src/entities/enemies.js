import Phaser from 'phaser';
import { floatText, worldText } from '../util.js';
import { pop } from '../fx.js';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, key, hp, reward) {
    super(scene, x, y, key);
    scene.add.existing(this);
    scene.enemies.add(this); // group defaults applied here; configure the body after
    this.hp = hp;
    this.reward = reward;
    this.dir = -1;
    this.homeX = x;
    this.leash = 56; // patrol range around spawn, so nothing wanders onto the player spawn
    this.stunUntil = 0;
    this.refactorable = true;
    this.setDepth(4);
    // Red rim glow separates enemies from the busy neon background.
    if (this.preFX && scene.game.renderer.type === Phaser.WEBGL) this.preFX.addGlow(0xe5534b, 2, 0, false, 0.1, 8);
    pop(this);
  }

  // Called after this enemy damages the player on contact: bounce off and pause.
  recoil(fromX) {
    const away = this.x < fromX ? -1 : 1;
    this.stunUntil = this.scene.time.now + 700;
    if (this.body.moves) this.setVelocity(away * 90, this.body.blocked.down ? -90 : this.body.velocity.y);
  }

  get stunned() {
    return this.scene.time.now < this.stunUntil;
  }

  hurt(dmg) {
    if (this.dying) return;
    this.hp -= dmg;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (!this.active) return;
      if (this.baseTint !== undefined) this.setTint(this.baseTint);
      else this.clearTint();
    });
    if (this.hp <= 0) this.die();
    else this.scene.sfx?.('hit', 0.3);
  }

  die() {
    if (this.dying) return;
    this.dying = true;
    this.scene.hitStop?.(45);
    this.scene.sfx?.('kill', 0.35);
    if (this.reward) this.scene.addStars(this.reward, this.x, this.y - 10);
    this.scene.burst(this.x, this.y, 'px_orange');
    this.onDie?.();
    this.destroy();
  }

  // Walk back and forth, turning at walls and ledges.
  patrol(speed) {
    const b = this.body;
    if (!b.blocked.down) return;
    if (b.blocked.left) this.dir = 1;
    else if (b.blocked.right) this.dir = -1;
    else if (!this.groundAhead()) this.dir *= -1;
    else if (Math.abs(this.x + this.dir * 2 - this.homeX) > this.leash) this.dir = this.x < this.homeX ? 1 : -1;
    this.setVelocityX(this.dir * speed);
    if (!this.noFlip) this.setFlipX(this.dir < 0);
  }

  groundAhead(dir = this.dir) {
    const layer = this.scene.layer;
    return Boolean(layer.getTileAtWorldXY(this.x + dir * (this.body.halfWidth + 2), this.body.bottom + 2));
  }
}

const BAD_PROMPTS = ['make it better', 'fix', 'idk just do it', 'pls', 'no bugs this time', 'u know what i mean'];
const GLYPHS = '#$%&@!?;{}<>~^*=+/|';
const scramble = (n) => Array.from({ length: n }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('');

// Slime of scrambled text. Hops at you; splits into two letter-blobs on its first death.
export class BadPromptBlob extends Enemy {
  constructor(scene, x, y, small = false) {
    const pack = scene.textures.exists('pack_slime');
    super(scene, x, y, pack ? 'pack_slime' : small ? 'blob_small' : 'blob0', small ? 1 : 3, small ? 1 : 3);
    this.small = small;
    if (pack) {
      this.play('slime_hop');
      this.baseTint = 0xc9a0ff;
      this.setTint(this.baseTint);
      this.body.setSize(12, 9).setOffset(2, 7);
      if (small) this.setScale(0.6);
    } else if (small) this.body.setSize(8, 7).setOffset(0, 1);
    else {
      this.body.setSize(14, 9).setOffset(1, 5);
      this.play('blob');
    }
    // Body made of scrambled text.
    this.glyphs = worldText(scene, x, y, scramble(small ? 1 : 3), { tiny: true, color: '#f5f5f5', depth: 5 });
    this.nextScramble = 0;
    this.once('destroy', () => this.glyphs.destroy());
    this.nextHop = scene.time.now + Phaser.Math.Between(300, 900);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    this.glyphs.setPosition(this.x, this.body.bottom - (this.small ? 3 : 4));
    if (time > this.nextScramble) {
      this.nextScramble = time + 140;
      this.glyphs.setText(scramble(this.small ? 1 : 3));
    }
  }

  update(time) {
    if (this.dying || this.stunned) return;
    const p = this.scene.player;
    if (this.body.blocked.down) {
      this.setVelocityX(0);
      if (time > this.nextHop && Math.abs(p.x - this.x) < 170) {
        const dir = Math.sign(p.x - this.x) || 1;
        this.setVelocity(dir * (this.small ? 70 : 55), this.small ? -150 : -200);
        this.setFlipX(dir < 0);
        this.nextHop = time + Phaser.Math.Between(900, 1400);
      }
    }
  }

  onDie() {
    const { scene, x, y } = this;
    if (this.small) return;
    floatText(scene, x, y - 18, `"${Phaser.Utils.Array.GetRandom(BAD_PROMPTS)}"`, '#bc8cff', 6);
    if (this.refactored) return; // refactor clears the screen; no split
    scene.sfx?.('split', 0.4);
    // Spawn after the current physics step so we don't mutate the group mid-overlap.
    scene.time.delayedCall(0, () => {
      for (const d of [-1, 1]) {
        const s = new BadPromptBlob(scene, x + d * 4, y, true);
        s.setVelocity(d * 80, -160);
        s.nextHop = scene.time.now + 700;
      }
    });
  }
}

// Keycap-toothed goblin: patrols, charges when it sees you, spits keycaps.
export class KeyboardGoblin extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'goblin0', 4, 5);
    this.body.setSize(10, 15).setOffset(3, 1);
    this.play('goblin');
    this.nextSpit = 0;
  }

  update(time) {
    if (this.dying || this.stunned) return;
    const p = this.scene.player;
    const dx = p.x - this.x;
    const sees = Math.abs(dx) < 130 && Math.abs(p.y - this.y) < 28 && !p.dead;
    if (!sees) {
      this.patrol(28);
      return;
    }
    this.dir = Math.sign(dx) || 1;
    this.setFlipX(this.dir < 0);
    const tooFar = Math.abs(this.x + this.dir * 2 - this.homeX) > 110; // charge leash
    if (this.body.blocked.down) this.setVelocityX(this.groundAhead() && !tooFar ? this.dir * 70 : 0);
    if (time > this.nextSpit) {
      this.nextSpit = time + 1600;
      this.scene.spawnHazard(this.x + this.dir * 8, this.y - 3, 'keycap', this.dir * 130, 0);
    }
  }
}

// H100: a big, tanky data-center GPU. Slow patrol, fans spinning, heat shimmer rising; when
// you get close it vents arcing heat blobs. Also what the Hydra provisions for more compute.
export class H100 extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'gpu0', 6, 6);
    this.noFlip = true; // "H100" label must never read backwards
    this.body.setSize(36, 15).setOffset(2, 3);
    this.play('gpu_fans');
    this.nextVent = scene.time.now + Phaser.Math.Between(900, 1800);
    this.heatFx = scene.add
      .particles(0, 0, 'px_orange', {
        follow: this,
        followOffset: { x: 0, y: -9 },
        speedX: { min: -6, max: 6 },
        speedY: { min: -26, max: -10 },
        lifespan: 650,
        frequency: 160,
        alpha: { start: 0.7, end: 0 },
        scale: { start: 1, end: 0.4 },
      })
      .setDepth(3);
    this.once('destroy', () => this.heatFx.destroy());
  }

  update(time) {
    if (this.dying || this.stunned) return;
    this.patrol(18);
    const p = this.scene.player;
    const dx = p.x - this.x;
    if (time > this.nextVent && Math.abs(dx) < 140 && Math.abs(p.y - this.y) < 48 && !p.dead) {
      this.nextVent = time + 2800;
      const dir = Math.sign(dx) || 1;
      this.scene.spawnHazard(this.x + dir * 12, this.y - 8, 'heat', dir * 70, -170, true);
      this.scene.spawnHazard(this.x + dir * 12, this.y - 8, 'heat', dir * 40, -210, true);
      this.scene.sfx?.('flood', 0.2);
    }
  }

  onDie() {
    floatText(this.scene, this.x, this.y - 16, 'CUDA OOM', '#3fb950');
    this.scene.burst(this.x, this.y, 'px_green', 14);
  }
}

// Flaming skull (Ninja Adventure pack, CC0): the Hydra's spawn only.
export class FlamingSkull extends Enemy {
  constructor(scene, x, y) {
    const pack = scene.textures.exists('pack_skull');
    super(scene, x, y, pack ? 'pack_skull' : 'blob_small', 2, 2);
    if (pack) {
      this.play('skull_walk');
      this.body.setSize(12, 12).setOffset(2, 4);
    }
  }

  // The Hydra's notifications: they run straight at you along the floor, arena-wide.
  update() {
    if (this.dying || this.stunned || !this.body.blocked.down) return;
    const dx = this.scene.player.x - this.x;
    if (Math.abs(dx) > 4) this.dir = Math.sign(dx);
    this.setVelocityX(this.dir * 50);
    this.setFlipX(this.dir < 0);
  }
}

// ---- Salesforce Park ----

const PITCHES = [
  ['TAM: $40T'],
  ['Uber for dogs'],
  ['AI-native!'],
  ['hockey stick!', true],
  ["it's Notion for Notion"],
  ['pre-revenue, post-vibes'],
];
const FOLLOW_UPS = ['just circling back', 'bumping this', 'any thoughts?', 'per my last email'];

// Founder: closes in for a demo, pitch deck at range. Contact is a demo grab (mash to escape,
// or wait for it to crash) instead of damage; on death, follow-up emails home in on you.
export class Founder extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'founder0', 3, 4);
    this.body.setSize(10, 15).setOffset(3, 1);
    this.play('founder_walk');
    this.nextPitch = scene.time.now + Phaser.Math.Between(600, 1400);
    this.nextGrab = 0;
    this.demo = null; // the "quick demo?" bubble while the player is caught
  }

  update(time) {
    if (this.dying || this.demo || this.stunned) return;
    const p = this.scene.player;
    const dx = p.x - this.x;
    const sees = Math.abs(dx) < 150 && Math.abs(p.y - this.y) < 32 && !p.dead;
    if (!sees) {
      this.patrol(26);
      return;
    }
    this.dir = Math.sign(dx) || 1;
    this.setFlipX(this.dir < 0);
    const tooFar = Math.abs(this.x + this.dir * 2 - this.homeX) > 120; // chase leash
    if (this.body.blocked.down) this.setVelocityX(Math.abs(dx) > 10 && this.groundAhead() && !tooFar ? this.dir * 38 : 0);
    if (Math.abs(dx) > 44 && time > this.nextPitch) {
      this.nextPitch = time + 2300;
      this.pitch();
    }
  }

  pitch() {
    const [line, hockey] = Phaser.Utils.Array.GetRandom(PITCHES);
    const s = this.scene;
    floatText(s, this.x, this.y - 16, line, '#e3b341');
    const h = s.spawnHazard(this.x + this.dir * 8, this.y - 3, hockey ? 'slide_up' : 'slide', this.dir * 105, 0);
    h.setFlipX(this.dir < 0);
    if (hockey) s.time.delayedCall(380, () => h.active && h.setVelocityY(-130)); // flat, then up and to the right
  }

  onTouchPlayer(pl) {
    if (this.demo) return true; // holding you for the demo: no damage on top
    const now = this.scene.time.now;
    if (this.stunned || pl.trapped || now < this.nextGrab || now < pl.invulnUntil || !pl.targetable) return false;
    this.nextGrab = now + 4500;
    this.demo = worldText(this.scene, this.x, this.y - 30, 'quick demo? 30 sec!', { color: '#0d0d0d', bg: '#f5f5f5', depth: 46 });
    this.setVelocityX(0);
    this.stop();
    this.setTexture('founder_grab').setFlipX(pl.x < this.x);
    pl.trap(this);
    return true;
  }

  // The player got out: mashed free, or the demo crashed on its own.
  endDemo(escaped) {
    if (!this.demo) return;
    this.demo.destroy();
    this.demo = null;
    if (!this.active || this.dying) return;
    floatText(this.scene, this.x, this.y - 18, escaped ? "wait, it's AI-native!" : 'it worked 5 min ago', '#e5534b');
    // Step back to reboot the demo, so the freed player isn't hit on the spot.
    const away = this.x < this.scene.player.x ? -1 : 1;
    this.setVelocity(away * 90, -90);
    this.stunUntil = this.scene.time.now + 1100;
    this.play('founder_walk');
  }

  onDie() {
    const s = this.scene;
    if (this.demo) s.player.release();
    if (this.refactored) return; // refactor clears the inbox too
    const { x, y } = this;
    floatText(s, x, y - 18, "I'll circle back!", '#f5f5f5');
    s.time.delayedCall(300, () => {
      for (const d of [-1, 1]) new FollowUp(s, x + d * 6, y - 6, d);
    });
  }
}

// A founder's follow-up email: drifts through walls, homing slowly, then gives up.
export class FollowUp extends Enemy {
  constructor(scene, x, y, dir = 1) {
    super(scene, x, y, 'email', 1, 0);
    this.body.setAllowGravity(false);
    this.body.setSize(10, 7);
    this.ghost = true;
    this.noFlip = true;
    this.born = scene.time.now;
    this.setVelocity(dir * 30, -40);
    floatText(scene, x, y - (dir > 0 ? 16 : 8), Phaser.Utils.Array.GetRandom(FOLLOW_UPS), '#8b8b8b');
  }

  update(time) {
    if (this.dying) return;
    if (time - this.born > 4200) {
      this.dying = true;
      this.scene.tweens.add({ targets: this, alpha: 0, duration: 300, onComplete: () => this.destroy() });
      return;
    }
    const p = this.scene.player;
    const a = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const SPEED = 36;
    this.setVelocity(
      Phaser.Math.Linear(this.body.velocity.x, Math.cos(a) * SPEED, 0.04),
      Phaser.Math.Linear(this.body.velocity.y, Math.sin(a) * SPEED, 0.04),
    );
  }

  onTouchPlayer(pl) {
    pl.hurt(1, this.x);
    this.dying = true;
    this.scene.burst(this.x, this.y, 'px_white', 4);
    this.destroy();
    return true;
  }
}

const BRO_LINES = ['we should grab coffee', "I'd pivot to agents", 'have you tried Rust?', "I'm technically retired"];
const MONTH_MS = 220; // a vesting "month" while he can see you

// Vested bro: lobs $9 pour-overs. Untouchable until his 1-year cliff (12 months tick up over
// his head while he watches you); refactor triggers acceleration instead of clearing him.
export class VestedBro extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'bro0', 3, 5);
    this.body.setSize(10, 15).setOffset(3, 1);
    this.play('bro_walk');
    this.months = 0;
    this.nextMonth = 0;
    this.nextClink = 0;
    this.refactorable = false;
    this.nextThrow = scene.time.now + Phaser.Math.Between(900, 1600);
    this.counter = worldText(scene, x, y - 14, '0/12mo', { color: '#8b8b8b', depth: 46 }).setVisible(false);
    this.once('destroy', () => this.counter.destroy());
  }

  get vested() {
    return this.months >= 12;
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    this.counter.setPosition(this.x, this.y - 14);
  }

  update(time) {
    if (this.dying || this.stunned) return;
    const p = this.scene.player;
    const dx = p.x - this.x;
    const sees = Math.abs(dx) < 150 && Math.abs(p.y - this.y) < 40 && !p.dead;
    if (sees && !this.vested) {
      if (!this.counter.visible) {
        this.counter.setVisible(true);
        this.nextMonth = time + MONTH_MS;
      }
      if (time > this.nextMonth) {
        this.months++;
        this.nextMonth = time + MONTH_MS;
        this.counter.setText(`${this.months}/12mo`);
        if (this.vested) this.vest();
      }
    }
    if (!sees) {
      this.patrol(20);
      return;
    }
    this.dir = Math.sign(dx) || 1;
    this.setFlipX(this.dir < 0);
    if (this.body.blocked.down) this.setVelocityX(0);
    if (time > this.nextThrow) {
      this.nextThrow = time + 2400;
      const s = this.scene;
      s.spawnHazard(this.x + this.dir * 6, this.y - 8, 'coffee', this.dir * 85, -170, true, (pl) => floatText(s, pl.x, pl.y - 16, '$9 pour-over', '#a8905e'));
    }
  }

  vest(note = 'VESTED') {
    this.months = 12;
    this.counter.setVisible(false);
    this.refactorable = true;
    floatText(this.scene, this.x, this.y - 18, note, '#3fb950');
    this.scene.burst(this.x, this.y - 4, 'px_green', 8);
  }

  hurt(dmg) {
    if (this.vested) {
      super.hurt(dmg);
      return;
    }
    // Before the cliff, hits bounce off.
    const now = this.scene.time.now;
    this.scene.burst(this.x, this.y - 2, 'px_white', 2);
    if (now > this.nextClink) {
      this.nextClink = now + 600;
      floatText(this.scene, this.x, this.y - 18, 'unvested', '#8b8b8b');
    }
  }

  onRefactor() {
    if (!this.vested) this.vest('acceleration clause!');
  }

  onDie() {
    floatText(this.scene, this.x, this.y - 18, Phaser.Utils.Array.GetRandom(BRO_LINES), '#a8c8e8');
  }
}

// Zone 2 jogger: laps a long stretch of path at speed. Contact shoves you aside, no damage.
export class Jogger extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'jogger0', 1, 2);
    this.body.setSize(10, 15).setOffset(3, 1);
    this.play('jog');
    this.leash = 150;
    this.nextBump = 0;
  }

  update() {
    if (this.dying || this.stunned) return;
    this.patrol(105);
  }

  onTouchPlayer(pl) {
    const now = this.scene.time.now;
    if (now > this.nextBump && pl.targetable) {
      this.nextBump = now + 900;
      pl.bump(this.x);
      floatText(this.scene, this.x, this.y - 16, 'on your left!', '#f5f5f5');
    }
    return true;
  }

  onDie() {
    floatText(this.scene, this.x, this.y - 18, 'my Oura score!', '#f5f5f5');
  }
}

// ---- Salesforce Tower ----

const AGENT_PITCHES = ['per seat, per month', 'agentic AND agentful', 'can I get 15 min?'];
const AGENT_DEATHS = ['Trailhead badge unlocked: Being Sold To', "I'll send a calendar invite", 'let me loop in my manager'];
const CLOSERS = ['sign here!', 'just initial here', "it's a 3-year deal", 'ohana means multi-year', 'can I loop in legal?', "let's get this signed today"];

// CRM agent: holds a sales distance (backs off inside 56px, closes in past 110px) and throws a
// contract every 2s. A contract does no damage; it locks you in (no firing) until it lapses or
// "refactor" voids it. The Ohana finale's sales team is `closing` (joinSwarm): unhurtable, at you
// fast, lobbing contracts at your feet and shoving you along instead of hurting you.
export class CrmAgent extends Enemy {
  constructor(scene, x, y, closing = false) {
    super(scene, x, y, 'agent0', 3, closing ? 0 : 5);
    this.body.setSize(10, 15).setOffset(3, 1);
    this.play('agent_walk');
    this.nextPitch = scene.time.now + Phaser.Math.Between(900, 1800);
    this.nextLine = 0;
    this.closing = false;
    if (closing) this.joinSwarm();
  }

  // Onto the closing team. Each closer stops a gap short of you, and the gap shrinks the longer
  // it has been standing there, so a crowd that holds back at first ends up shoving you along.
  joinSwarm() {
    this.closing = true;
    this.refactorable = false;
    this.reward = 0;
    this.gap = Phaser.Math.Between(12, 60);
    this.speed = Phaser.Math.Between(50, 76);
    this.nextThrow = this.scene.time.now + Phaser.Math.Between(400, 1400);
    this.landedAt = null;
  }

  update(time) {
    if (this.dying || this.stunned) return;
    if (this.closing) {
      this.close(time);
      return;
    }
    const p = this.scene.player;
    const dx = p.x - this.x;
    const sees = Math.abs(dx) < 160 && Math.abs(p.y - this.y) < 40 && !p.dead;
    if (!sees) {
      this.patrol(24);
      return;
    }
    this.dir = Math.sign(dx) || 1;
    this.setFlipX(this.dir < 0);
    const dist = Math.abs(dx);
    const step = dist < 56 ? -this.dir : dist > 110 ? this.dir : 0;
    const tooFar = Math.abs(this.x + step * 2 - this.homeX) > 150; // chase leash
    if (this.body.blocked.down) this.setVelocityX(step && this.groundAhead(step) && !tooFar ? step * 40 : 0);
    if (time > this.nextPitch) {
      this.nextPitch = time + 2000;
      this.pitch();
    }
  }

  pitch() {
    const s = this.scene;
    floatText(s, this.x, this.y - 16, Phaser.Utils.Array.GetRandom(AGENT_PITCHES), '#8fd0ff');
    const h = s.spawnHazard(this.x + this.dir * 8, this.y - 3, 'contract', this.dir * 120, 0, false, (pl) => pl.lock(3000));
    h.harmless = true;
  }

  close(time) {
    if (!this.body.blocked.down) return; // still dropping in
    if (this.landedAt === null) {
      this.landedAt = time;
      this.scene.dust?.(this.x, this.body.bottom);
      this.scene.sfx?.('hit', 0.2);
      if (Math.random() < 0.3) this.say(Phaser.Utils.Array.GetRandom(CLOSERS));
    }
    const p = this.scene.player;
    const dx = p.x - this.x;
    this.dir = Math.sign(dx) || 1;
    const gap = Math.max(0, this.gap - (time - this.landedAt) * 0.008);
    this.setVelocityX(Math.abs(dx) > gap + 2 ? this.dir * this.speed : 0);
    this.setFlipX(this.dir < 0);
    if (time > this.nextThrow && !p.dead && !this.scene.leaving) {
      this.nextThrow = time + Phaser.Math.Between(1600, 2800);
      this.lob(p);
    }
  }

  // A contract lobbed to land at your feet: it locks you in if it hits, and lies where it lands
  // if it doesn't (the scene's fileContract). Now and then the scene has one go over your head
  // at a point on the window instead (aimAtGlass), which is what cracks it.
  lob(p) {
    const s = this.scene;
    const glass = s.aimAtGlass?.();
    const T = glass ? Phaser.Math.FloatBetween(0.7, 0.9) : Phaser.Math.FloatBetween(0.5, 0.75); // seconds in the air
    const g = s.physics.world.gravity.y;
    const x0 = this.x + this.dir * 4;
    const y0 = this.y - 8;
    const [tx, ty] = glass ?? [p.x + Phaser.Math.Between(-12, 12), p.body.bottom - 3];
    const h = s.spawnHazard(x0, y0, 'contract', (tx - x0) / T, (ty - y0 - 0.5 * g * T * T) / T, true, (pl) => pl.lock(3000));
    h.harmless = true;
    h.atGlass = Boolean(glass);
    h.setAngularVelocity(Phaser.Math.Between(-360, 360));
    h.onLand = () => s.fileContract?.(h.x, h.body.bottom);
  }

  // The closing team only ever talks pricing, and one of them at a time (a crowd of speech
  // bubbles would bury you).
  say(line) {
    const s = this.scene;
    const now = s.time.now;
    if (now < this.nextLine || now < (s.closerLineAt ?? 0)) return;
    this.nextLine = now + 900;
    s.closerLineAt = now + 500;
    floatText(s, this.x, this.y - 18, line, '#8fd0ff');
  }

  hurt(dmg) {
    if (!this.closing) {
      super.hurt(dmg);
      return;
    }
    this.scene.burst(this.x, this.y - 2, 'px_white', 2);
    this.say("we're flexible on pricing");
  }

  onRefactor() {
    if (this.closing) this.say("we're flexible on pricing");
  }

  onTouchPlayer(pl) {
    if (!this.closing) return false;
    if (pl.targetable && this.scene.time.now > this.nextLine) {
      pl.bump(this.x);
      this.say("let's circle back on pricing");
    }
    return true;
  }

  onDie() {
    floatText(this.scene, this.x, this.y - 18, Phaser.Utils.Array.GetRandom(AGENT_DEATHS), '#8fd0ff');
  }
}

const POPUP_LINES = [
  ["Hi! I'm your Agent.", 'How can I help?'],
  ['Hi again!', 'Still here to help!'],
  ["I noticed you're busy!", 'Want a demo?'],
];
// Where popups sit, as offsets from the camera's centre: above the player, in jump range. Two
// at most, so the fight stays readable.
const POPUP_SLOTS = [[-80, -16], [72, -24]];

// Chatbot: floats above and beside you and, every ~5s, opens a popup in a free slot on screen.
// "refactor" clears chatbots and popups alike.
export class ChatbotAgent extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'chatbot', 2, 4);
    this.body.setAllowGravity(false);
    this.body.setSize(14, 12).setOffset(1, 2);
    this.ghost = true;
    this.noFlip = true;
    this.greeting = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.nextPopup = scene.time.now + Phaser.Math.Between(1200, 2400);
  }

  update(time) {
    if (this.dying || this.stunned) return;
    const p = this.scene.player;
    const dx = p.x - this.x;
    const bob = Math.sin(time / 400 + this.phase);
    if (Math.abs(dx) > 200 || p.dead) {
      this.setVelocity(0, bob * 6);
      return;
    }
    const tx = p.x - Math.sign(dx || 1) * 36; // hovers on its own side of you
    const ty = p.y - 30 + bob * 4;
    this.setVelocity(Phaser.Math.Clamp((tx - this.x) * 2, -60, 60), Phaser.Math.Clamp((ty - this.y) * 2, -60, 60));
    this.setFlipX(dx < 0);
    if (time > this.nextPopup && this.scene.inView(this)) {
      this.nextPopup = time + 5000;
      Popup.open(this.scene, POPUP_LINES[this.greeting++ % POPUP_LINES.length]);
    }
  }

  onDie() {
    floatText(this.scene, this.x, this.y - 14, 'escalating to a human...', '#8fd0ff');
  }
}

// A chatbot's popup: pinned to a slot on screen until it's shot (1 HP, no reward, no contact
// damage). Closing one asks "Was this helpful?", once. It re-pins after the camera moves each
// frame (followupdate), so it never trails the view.
export class Popup extends Enemy {
  static open(scene, lines, small = false) {
    const taken = scene.enemies.getChildren().filter((e) => e instanceof Popup && !e.dying).map((e) => e.slot);
    const slot = POPUP_SLOTS.findIndex((_, i) => !taken.includes(i));
    return slot < 0 ? null : new Popup(scene, slot, lines, small);
  }

  constructor(scene, slot, [a, b], small) {
    super(scene, 0, 0, small ? 'popup_small' : 'popup', 1, 0);
    this.slot = slot;
    this.small = small;
    this.body.setAllowGravity(false);
    this.body.moves = false; // placed by pin(), not by physics
    this.ghost = true;
    this.noFlip = true;
    this.setDepth(45);
    const [w, h] = small ? [88, 24] : [112, 32];
    const text = (str, dx, dy, opts) => [worldText(scene, 0, 0, str, { ox: 0, depth: 46, ...opts }), dx, dy];
    const indent = small ? 4 : 15;
    this.texts = [
      text('Agent', -w / 2 + 3, -h / 2 + (small ? 3.5 : 4), { tiny: true }),
      text(a, -w / 2 + indent, -h / 2 + (small ? 11 : 14), { color: '#0d0d0d' }),
      text(b, -w / 2 + indent, -h / 2 + (small ? 19 : 23), { color: '#0d0d0d' }),
    ];
    const cam = scene.cameras.main;
    this.pin = () => {
      const [ox, oy] = POPUP_SLOTS[this.slot];
      this.setPosition(Math.round(cam.midPoint.x + ox), Math.round(cam.midPoint.y + oy));
      for (const [t, dx, dy] of this.texts) t.setPosition(this.x + dx, this.y + dy);
    };
    this.pin();
    this.body.updateFromGameObject();
    cam.on('followupdate', this.pin);
    this.once('destroy', () => {
      cam.off('followupdate', this.pin);
      for (const [t] of this.texts) t.destroy();
    });
    scene.sfx?.('hit', 0.3);
  }

  onTouchPlayer() {
    return true;
  }

  onDie() {
    if (this.small || this.refactored) return;
    // After this physics step, so the enemies group isn't changed mid-overlap (and destroy()
    // clears this.scene, so hold on to it).
    const { scene } = this;
    scene.time.delayedCall(0, () => Popup.open(scene, ['Was this helpful?', 'Y / N'], true));
  }
}

export const SPAWNERS = { B: BadPromptBlob, G: KeyboardGoblin, H: H100, F: Founder, V: VestedBro, J: Jogger, A: CrmAgent, C: ChatbotAgent };
