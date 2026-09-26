import Phaser from 'phaser';
import { Enemy, Skullops } from './enemies.js';
import { worldText, floatText } from '../util.js';

const LIES = [
  "You're absolutely right!",
  'Tests pass ✅',
  'I never said that',
  'That bug was always there',
  'Works on my context',
  'Fixed it. (I did not)',
  'Great catch! Anyway...',
  'This is production-ready',
  'Your laptop is the bug',
  'Let me rewrite everything',
];

const TURN_MS = 8000;
const MAX_GROWTH = 3;
const BASE_HP = 14;

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
  }

  update(time) {
    if (this.dying) return;
    // Heads drift toward the player as they grow ("longer reach").
    const reach = this.g * 14;
    this.x = this.ax - reach + Math.sin(time / 600 + this.phase) * 6;
    this.y = this.ay + Math.cos(time / 450 + this.phase) * 5;
    this.setFlipX(true);
    if (time > this.nextAttack && !this.scene.player.dead) {
      this.nextAttack = time + 3200 - this.g * 450 + Math.random() * 800;
      this.hydra.attack(this);
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
    this.hydra.headDied(this);
  }
}

export default class Hydra {
  constructor(scene, x, groundY) {
    this.scene = scene;
    this.body = scene.physics.add.staticImage(x, groundY - 20, 'hydra_body');
    this.body.setDepth(3);
    this.neck = scene.add.graphics().setDepth(2);
    this.label = worldText(scene, x, groundY - 12, 'CONTEXT ROT', { color: '#0d0d0d', size: 5, depth: 4 });
    this.neckBase = { x: x - 10, y: groundY - 30 };
    this.heads = [
      new Head(scene, this, 'flood', x - 30, 50),
      new Head(scene, this, 'gaslight', x - 52, 92),
      new Head(scene, this, 'spawn', x - 40, 132),
    ];
    this.turn = 1;
    this.bubble = null;
    this.minions = [];
    scene.physics.add.overlap(scene.player, this.body, () => scene.player.hurt(1, this.body.x));

    this.turnTimer = scene.time.addEvent({ delay: TURN_MS, loop: true, callback: () => this.nextTurn() });
    this.lieTimer = scene.time.addEvent({ delay: 2200, loop: true, callback: () => this.lie() });
    this.publish();
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
    });
  }

  nextTurn() {
    if (!this.alive.length) return;
    this.turn++;
    for (const h of this.alive) h.grow();
    this.scene.sfx('grow', 0.4);
    floatText(this.scene, 160, 30, `turn ${this.turn}: context +25%`, '#e5534b', 7);
    this.scene.cameras.main.shake(150, 0.004);
  }

  lie() {
    const alive = this.alive;
    if (!alive.length) return;
    this.bubble?.destroy();
    const h = Phaser.Utils.Array.GetRandom(alive);
    this.bubble = worldText(this.scene, h.x, h.y - 16, Phaser.Utils.Array.GetRandom(LIES), {
      color: '#0d0d0d',
      bg: '#f5f5f5',
      size: 6,
      depth: 30,
    });
    this.bubble.owner = h;
    this.scene.time.delayedCall(1800, () => this.bubble?.owner === h && this.bubble.destroy());
  }

  attack(head) {
    const scene = this.scene;
    const pl = scene.player;
    if (head.role === 'flood') {
      floatText(scene, head.x, head.y - 14, 'IMAGE FLOOD', '#58a6ff', 6);
      scene.sfx('flood', 0.4);
      const n = 4 + head.g * 2;
      for (let i = 0; i < n; i++) {
        scene.time.delayedCall(i * 120, () => {
          scene.spawnHazard(Phaser.Math.Between(24, 230), -8, 'imgtile', 0, 30, true);
        });
      }
    } else if (head.role === 'gaslight') {
      const a = Phaser.Math.Angle.Between(head.x, head.y, pl.x, pl.y);
      const v = 75 + head.g * 15;
      scene.spawnHazard(head.x, head.y, 'orb', Math.cos(a) * v, Math.sin(a) * v, false, (p) => {
        p.reverseControls(3000);
        scene.sfx('gaslight', 0.5);
        floatText(scene, p.x, p.y - 20, 'controls? what controls?', '#bc8cff', 6);
      });
    } else if (head.role === 'spawn') {
      this.minions = this.minions.filter((m) => m.active);
      if (this.minions.length >= 3) return;
      const m = new Skullops(scene, head.x - 8, head.y);
      m.dir = -1;
      this.minions.push(m);
    }
  }

  headDied(head) {
    floatText(this.scene, head.x, head.y - 10, 'head -1', '#e5534b', 7);
    this.scene.sfx('headkill', 0.5);
    this.scene.cameras.main.shake(200, 0.01);
    this.scene.time.delayedCall(0, () => {
      this.publish();
      if (!this.alive.length) this.collapse();
    });
  }

  collapse() {
    const scene = this.scene;
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
    scene.tweens.add({ targets: [this.body, this.label], alpha: 0, duration: 1200, delay: 400 });
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
      this.bubble.setPosition(this.bubble.owner.x, this.bubble.owner.y - 16 * this.bubble.owner.scale);
    }
    this.publish();
  }
}
