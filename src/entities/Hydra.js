import Phaser from 'phaser';
import { Enemy, FlamingSkull } from './enemies.js';
import ContextOverflow, { DEPTH as RAIN_DEPTH } from './ContextOverflow.js';
import { worldText, floatText } from '../util.js';

const LIES = [
  "You're absolutely right!",
  'Tests pass ✓',
  'I never said that',
  'That bug was always there',
  'Works on my context',
  'Fixed it. (I did not)',
  'Great catch! Anyway...',
  'This is production-ready',
  'Your laptop is the bug',
  'Let me rewrite everything',
  'I just need more GPUs',
];

const TURN_MS = 8000;
const TELEGRAPH_MS = 600; // wind-up before every attack: shake, flash, and a role-specific warning
const MAX_GROWTH = 3;
const STAGGER = { flood: 0, gaslight: 1100, spawn: 2200 };
const BASE_HP = 14;
const MAX_MINIONS = 2;
const RESPAWN_MS = 1000;

// The body: a heap of H100s with their fans spinning, as [dx, dy, angle, flipX] from the floor
// under it, back to front. Each growth turn drops another card on top ("I just need more GPUs"),
// up to DROPS. The old body image stays as the invisible hitbox, so contact damage is unchanged.
const PILE = [
  [-14, -28, -28, false],
  [14, -30, 22, true],
  [0, -38, -78, false],
  [-18, -15, 12, false],
  [16, -16, -15, true],
  [-8, -8, 0, false],
  [18, -7, -4, true],
];
const DROPS = [
  [-10, -46, 35, false],
  [12, -47, -40, true],
  [-24, -38, -62, false],
  [24, -40, 68, true],
];
const GPU_SCALE = 0.8;

// One chat-bubble head. Not refactorable: refactor only resets its growth.
class Head extends Enemy {
  constructor(scene, hydra, role, ax, ay) {
    super(scene, ax, ay, `head_${role}`, BASE_HP, 10);
    this.hydra = hydra;
    this.role = role;
    this.ax = ax;
    this.ay = ay;
    this.g = 0;
    this.maxHp = BASE_HP;
    this.refactorable = false;
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.body.moves = false;
    this.body.setSize(14, 11).setOffset(1, 1);
    this.phase = Math.random() * Math.PI * 2;
    this.nextAttack = scene.time.now + 1500 + Math.random() * 1500;
    // Role icon so players can tell the heads apart: image flood, gaslight (<->), notifications.
    this.icon = scene.add.image(ax, ay, `icon_${role}`).setDepth(6);
    this.plan = null;
  }

  update(time) {
    if (this.dying) return;
    // Heads drift toward the player as they grow ("longer reach").
    const reach = this.g * 14;
    let x = this.ax - reach + Math.sin(time / 600 + this.phase) * 6;
    const y = this.ay + Math.cos(time / 450 + this.phase) * 5;
    this.setFlipX(true);
    if (time < this.hydra.dormantUntil || this.scene.player.dead) {
      // First attacks after the intro are staggered per head so they never land together.
      const earliest = this.hydra.dormantUntil + 600 + STAGGER[this.role];
      if (this.nextAttack < earliest) this.nextAttack = earliest + Math.random() * 400;
      this.setPosition(x, y);
      this.icon.setPosition(x + 9 * this.scale, y - 9 * this.scale);
      return;
    }
    const warn = this.nextAttack - time;
    if (warn < TELEGRAPH_MS) {
      // Targets are chosen when the warning starts and reused by the attack itself.
      this.plan ??= this.hydra.prepare(this);
      x += (Math.random() - 0.5) * 3;
      if (Math.floor(time / 70) % 2) this.setTintFill(0xffffff);
      else this.setTint(0xff7a6a);
    }
    this.setPosition(x, y);
    this.icon.setPosition(x + 9 * this.scale, y - 9 * this.scale);
    this.icon.setScale(warn < TELEGRAPH_MS ? 1.4 + 0.4 * Math.sin(time / 45) : 1);
    if (warn <= 0) {
      this.clearTint();
      const rage = this.hydra.alive.length === 1 ? 0.6 : 1; // last head attacks faster
      this.nextAttack = time + (3200 - this.g * 450 + Math.random() * 800) * rage;
      this.hydra.attack(this, this.plan);
      this.plan = null;
    }
  }

  grow() {
    if (this.g >= MAX_GROWTH) return;
    this.g++;
    this.maxHp = BASE_HP + this.g * 3;
    this.hp = Math.min(this.maxHp, this.hp + 3);
    this.scene.tweens.add({ targets: this, scale: 1 + this.g * 0.3, duration: 400, ease: 'Back.out' });
  }

  onRefactor() {
    this.g = 0;
    this.maxHp = BASE_HP;
    this.hp = Math.min(this.hp, BASE_HP);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 300 });
    this.scene.burst(this.x, this.y, 'px_green', 8);
  }

  onDie() {
    this.hydra.cancelPlan(this.plan);
    this.plan = null;
    this.icon.destroy();
    this.hydra.headDied(this);
  }
}

export default class Hydra {
  constructor(scene, x, groundY) {
    this.scene = scene;
    this.body = scene.physics.add.staticImage(x, groundY - 20, 'hydra_body').setVisible(false);
    this.floor = { x, y: groundY };
    // A dark core behind the cards so the heap reads as one mass, not cards over the window.
    this.core = scene.add.ellipse(x, groundY - 18, 52, 34, 0x140c12).setDepth(2.95);
    this.gpus = PILE.map((slot, i) => this.gpu(slot, i));
    this.neck = scene.add.graphics().setDepth(2);
    this.label = worldText(scene, x, groundY - 13, 'CONTEXT ROT', { color: '#0d0d0d', bg: '#f5f5f5', size: 5, depth: 3.9 }).setAngle(-5);
    this.neckBase = { x: x - 10, y: groundY - 30 };
    this.heads = [
      new Head(scene, this, 'flood', x - 30, 50),
      new Head(scene, this, 'gaslight', x - 52, 92),
      new Head(scene, this, 'spawn', x - 40, 132),
    ];
    this.turn = 1;
    this.dormantUntil = 0;
    this.bubble = null;
    this.minions = [];
    this.overflow = new ContextOverflow(scene);
    this.contact = scene.physics.add.overlap(scene.player, this.body, () => scene.player.hurt(1, this.body.x));

    this.turnTimer = scene.time.addEvent({ delay: TURN_MS, loop: true, callback: () => this.nextTurn() });
    this.lieTimer = scene.time.addEvent({ delay: 2200, loop: true, callback: () => this.lie() });
    this.publish();
  }

  gpu([dx, dy, angle, flip], i) {
    const card = this.scene.add.sprite(this.floor.x + dx, this.floor.y + dy, 'gpu0');
    card.setScale(GPU_SCALE).setAngle(angle).setFlipX(flip).setDepth(3 + i * 0.01);
    card.play({ key: 'gpu_fans', startFrame: i % 2 });
    card.anims.timeScale = 0.7 + Math.random() * 0.6; // fans out of sync
    return card;
  }

  addGpu() {
    const slot = DROPS[this.gpus.length - PILE.length];
    if (!slot) return;
    const card = this.gpu(slot, this.gpus.length);
    const y = card.y;
    this.gpus.push(card);
    card.y = -24;
    this.scene.tweens.add({
      targets: card,
      y,
      duration: 420,
      ease: 'Quad.in',
      onComplete: () => {
        this.scene.cameras.main.shake(90, 0.003);
        this.scene.dust(card.x, y + 6);
        this.scene.sfx('hit', 0.3);
      },
    });
  }

  get alive() {
    return this.heads.filter((h) => h.active && !h.dying);
  }

  publish() {
    const alive = this.alive;
    this.scene.registry.set('boss', {
      hp: alive.reduce((s, h) => s + Math.max(0, h.hp), 0),
      max: this.heads.reduce((s, h) => s + h.maxHp, 0),
      heads: alive.length,
      turn: this.turn,
      growth: alive.reduce((g, h) => Math.max(g, h.g), 0),
      maxGrowth: MAX_GROWTH,
      overflow: this.overflow.active,
      nextMs: this.turnTimer && !this.turnTimer.hasDispatched ? this.turnTimer.getRemaining() : 0,
    });
  }

  nextTurn() {
    if (!this.alive.length || this.scene.time.now < this.dormantUntil) return;
    this.turn++;
    for (const h of this.alive) h.grow();
    this.addGpu();
    this.scene.sfx('grow', 0.4);
    floatText(this.scene, 160, 30, `turn ${this.turn}: context +25%`, '#e5534b', 7);
    this.scene.cameras.main.shake(150, 0.004);
  }

  lie() {
    const alive = this.alive;
    if (!alive.length || this.scene.time.now < this.dormantUntil) return;
    this.bubble?.destroy();
    const h = Phaser.Utils.Array.GetRandom(alive);
    this.bubble = worldText(this.scene, h.x, this.bubbleY(h), Phaser.Utils.Array.GetRandom(LIES), {
      color: '#0d0d0d',
      bg: '#f5f5f5',
      size: 6,
      depth: this.overflow.active ? RAIN_DEPTH - 0.1 : 30, // lost in the noise while the context is full
    });
    this.bubble.owner = h;
    this.scene.time.delayedCall(1800, () => this.bubble?.owner === h && this.bubble.destroy());
  }

  // Above the head, unless that would collide with the HUD boss bar at the top.
  bubbleY(h) {
    const off = 12 + 6 * h.scale;
    return h.y - off < 34 ? h.y + off : h.y - off;
  }

  // Wind-up: pick targets and show them. The attack later uses exactly these targets.
  prepare(head) {
    const scene = this.scene;
    const plan = { objs: [] };
    if (head.role === 'flood') {
      const lanes = [];
      for (let x = 24; x <= 232; x += 16) lanes.push(x);
      const safe = Phaser.Math.Between(0, lanes.length - 3); // 3 adjacent lanes always stay clear
      const open = lanes.filter((_, i) => i < safe || i > safe + 2);
      plan.xs = Phaser.Utils.Array.Shuffle(open).slice(0, Math.min(open.length, 4 + head.g * 2));
      for (const x of plan.xs) {
        const floor = scene.add.rectangle(x, 158, 12, 3, 0x58a6ff).setDepth(9);
        const drop = scene.add.image(x, 30, 'imgtile').setDepth(9);
        scene.tweens.add({ targets: [floor, drop], alpha: 0.25, duration: 110, yoyo: true, repeat: -1 });
        plan.objs.push(floor, drop);
      }
      floatText(scene, Phaser.Math.Clamp(head.x, 60, 260), this.bubbleY(head), 'IMAGE FLOOD', '#58a6ff');
      scene.sfx('flood', 0.4);
    } else if (head.role === 'gaslight') {
      const orb = scene.add.image(head.x - 10, head.y + 2, 'orb').setScale(0.2).setDepth(9);
      scene.tweens.add({ targets: orb, scale: 1.2, duration: TELEGRAPH_MS });
      plan.orb = orb;
      plan.objs.push(orb);
    } else if (head.role === 'spawn') {
      floatText(scene, head.x, head.y - 14, 'new notification', '#d97757');
    }
    return plan;
  }

  cancelPlan(plan) {
    plan?.objs.forEach((o) => o.destroy());
  }

  attack(head, plan) {
    const scene = this.scene;
    const pl = scene.player;
    this.cancelPlan(plan);
    if (scene.outcome || !head.active) return;
    if (head.role === 'flood') {
      const xs = plan?.xs ?? [Phaser.Math.Between(24, 230)];
      xs.forEach((x, i) => {
        scene.time.delayedCall(i * 90, () => {
          if (scene.outcome) return; // victory or defeat cancels the rest of the flood
          scene.spawnHazard(x, -8, 'imgtile', 0, 30, true);
        });
      });
    } else if (head.role === 'gaslight') {
      const ox = plan?.orb?.x ?? head.x;
      const oy = plan?.orb?.y ?? head.y;
      const a = Phaser.Math.Angle.Between(ox, oy, pl.x, pl.y);
      const v = 75 + head.g * 15;
      const orb = scene.spawnHazard(ox, oy, 'orb', Math.cos(a) * v, Math.sin(a) * v, false, (p) => {
        p.reverseControls(3000);
        scene.sfx('gaslight', 0.5);
        floatText(scene, p.x, p.y - 20, 'controls? what controls?', '#bc8cff', 6);
      });
      // As this head grows it drifts onto the middle platform; a solid orb broke on it at launch.
      orb.ghost = true;
    } else if (head.role === 'spawn') this.spawnMinion(head);
  }

  // Notifications: skulls that hunt the player across the arena. Each one killed is replaced
  // about a second later for as long as the spawn head lives, and they all die with it.
  spawnMinion(head) {
    const scene = this.scene;
    this.minions = this.minions.filter((m) => m.active);
    if (this.minions.length >= MAX_MINIONS || !head.active || head.dying || scene.outcome) return;
    const m = new FlamingSkull(scene, head.x - 8, head.y);
    m.onDie = () =>
      scene.time.delayedCall(RESPAWN_MS, () => {
        if (!head.active || head.dying || scene.outcome) return;
        floatText(scene, head.x, head.y - 14, 'new notification', '#d97757');
        this.spawnMinion(head);
      });
    this.minions.push(m);
  }

  headDied(head) {
    floatText(this.scene, head.x, head.y - 10, 'head -1', '#e5534b', 7);
    if (head.role === 'spawn') {
      const left = this.minions.filter((m) => m.active && !m.dying);
      if (left.length) floatText(this.scene, head.x, head.y + 6, 'notifications cleared', '#3fb950');
      for (const m of left) m.die();
    }
    this.scene.hitStop(180);
    this.scene.sfx('headkill', 0.5);
    this.scene.cameras.main.shake(200, 0.01);
    this.scene.time.delayedCall(0, () => {
      this.publish();
      if (!this.alive.length) this.collapse();
      else if (this.alive.length === 1) {
        floatText(this.scene, 160, 40, 'LAST HEAD: ENRAGED', '#e5534b');
        this.scene.cameras.main.flash(250, 229, 83, 75);
      }
    });
  }

  collapse() {
    const scene = this.scene;
    if (!scene.endEncounter('win')) return; // the player already died: no late victory
    this.contact.active = false;
    for (const h of this.heads) {
      this.cancelPlan(h.plan);
      h.plan = null;
    }
    for (const h of [...scene.hazards.getChildren()]) h.destroy();
    this.overflow.stop(false);
    this.turnTimer.remove();
    this.lieTimer.remove();
    this.bubble?.destroy();
    for (const m of this.minions) if (m.active) m.die();
    worldText(scene, this.body.x, this.body.y - 34, 'context... compacted', { color: '#f5f5f5', size: 7, depth: 30 });
    for (let i = 0; i < 6; i++) {
      scene.time.delayedCall(i * 180, () =>
        scene.burst(this.body.x + Phaser.Math.Between(-24, 24), this.body.y + Phaser.Math.Between(-16, 16), i % 2 ? 'px_orange' : 'px_white', 16),
      );
    }
    // The heap comes apart: fans stop, cards tumble off (away from the wall) and fade.
    this.gpus.forEach((card, i) => {
      card.anims.stop();
      scene.tweens.add({
        targets: card,
        x: card.x + Phaser.Math.Between(-44, 12),
        y: this.floor.y - 5,
        angle: card.angle + Phaser.Math.Between(-200, 200),
        delay: 200 + i * 70,
        duration: 650,
        ease: 'Quad.in',
      });
      scene.tweens.add({ targets: card, alpha: 0, delay: 1400 + i * 40, duration: 500 });
    });
    scene.tweens.add({ targets: [this.core, this.label], alpha: 0, duration: 600, delay: 200 });
    scene.addStars(50, this.body.x, this.body.y - 24);
    scene.music?.stop();
    scene.sfx('win', 0.6);
    scene.time.delayedCall(2200, () => scene.win());
  }

  update() {
    const g = this.neck;
    g.clear();
    for (const h of this.alive) {
      const pts = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(this.neckBase.x, this.neckBase.y),
        new Phaser.Math.Vector2((this.neckBase.x + h.x) / 2 + 10, Math.max(this.neckBase.y, h.y) + 6),
        new Phaser.Math.Vector2(h.x + 4, h.y + 4),
      ).getPoints(14);
      g.fillStyle(0xa8553a);
      const r = 3 + h.g * 0.6;
      for (const p of pts) g.fillCircle(p.x, p.y, r);
      g.fillStyle(0xd97757);
      for (const p of pts) g.fillCircle(p.x - 1, p.y - 1, r * 0.45);
    }
    if (this.bubble?.active && this.bubble.owner?.active) {
      this.bubble.setPosition(Phaser.Math.Clamp(this.bubble.owner.x, 70, 250), this.bubbleY(this.bubble.owner));
    }
    // A full context window overflows until a refactor shrinks the heads back down.
    const full = this.alive.some((h) => h.g >= MAX_GROWTH);
    if (full && !this.scene.outcome) this.overflow.start();
    else if (!full) this.overflow.stop();
    this.overflow.update(this.scene.time.now, this.scene.game.loop.delta);
    this.publish();
  }
}
