import Phaser from 'phaser';
import { floatText, worldText } from '../util.js';

// Context overflow: once the Hydra's context window is full, matrix rain pours over the whole
// arena and the player takes context rot until a refactor compacts it.
const GLYPHS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'];
const COLS = 40; // one column every 8px across the 320px arena
const NEAR = 8; // bright glyphs right behind each falling head
const FAR = 14; // dim tail above them
const RAMP_MS = 3000; // drizzle to downpour
const GRACE_MS = 3000; // warning time before the first context rot
const ROT_MS = 3000; // then 1 damage per tick while full
const DEPTH = 45; // over the whole fight (speech bubbles are 30), under float text (50)
const ARENA_H = 192;

const glyphs = (n) => Array.from({ length: n }, () => Phaser.Utils.Array.GetRandom(GLYPHS));

export default class ContextOverflow {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.level = 0; // rain density, 0..1
    this.cols = null; // built on first overflow
  }

  start() {
    if (this.active) return;
    const s = this.scene;
    this.active = true;
    this.startedAt = s.time.now;
    this.nextRot = s.time.now + GRACE_MS;
    this.cols ??= this.build();
    floatText(s, 160, 70, 'CONTEXT WINDOW FULL', '#e5534b');
    s.cameras.main.shake(250, 0.006);
    s.sfx('grow', 0.5);
  }

  stop(compacted = true) {
    if (!this.active) return;
    this.active = false;
    if (compacted) floatText(this.scene, 160, 70, 'context compacted', '#3fb950');
  }

  build() {
    const s = this.scene;
    this.wash = s.add.rectangle(0, 0, 320, ARENA_H, 0x02140a).setOrigin(0).setDepth(DEPTH - 1).setAlpha(0);
    return Array.from({ length: COLS }, (_, i) => {
      const x = 4 + i * 8;
      const opts = (color) => ({ color, ox: 0.5, oy: 1, depth: DEPTH });
      const c = {
        near: glyphs(NEAR),
        far: glyphs(FAR),
        head: worldText(s, x, 0, glyphs(1)[0], opts('#d2ffd9')),
        y: -Phaser.Math.Between(0, ARENA_H),
        speed: Phaser.Math.Between(50, 120),
        threshold: Math.random(), // the column joins once density passes this
      };
      c.nearText = worldText(s, x, 0, c.near.join('\n'), opts('#3fb950'));
      c.farText = worldText(s, x, 0, c.far.join('\n'), opts('#238636')).setAlpha(0.6);
      return c;
    });
  }

  update(time, delta) {
    if (!this.cols) return;
    // Density ramps up while full and drains in ~0.6s once compacted.
    this.level = this.active ? Math.min(1, (time - this.startedAt) / RAMP_MS) : Math.max(0, this.level - delta / 600);
    this.wash.setAlpha(this.level * 0.5);
    const flicker = time > (this.nextFlicker ?? 0);
    if (flicker) this.nextFlicker = time + 90;
    for (const c of this.cols) {
      const on = c.threshold < this.level;
      for (const t of [c.head, c.nearText, c.farText]) t.setVisible(on);
      if (!on) continue;
      c.y += (c.speed * delta) / 1000;
      const lh = c.head.height;
      if (c.y - lh * (1 + NEAR + FAR) > ARENA_H) c.y = -Phaser.Math.Between(0, 60); // wrap once the tail clears the floor
      c.head.y = c.y;
      c.nearText.y = c.y - lh;
      c.farText.y = c.y - lh * (1 + NEAR);
      if (flicker) {
        c.head.setText(glyphs(1)[0]);
        c.near[Phaser.Math.Between(0, NEAR - 1)] = glyphs(1)[0];
        c.nearText.setText(c.near.join('\n'));
      }
    }
    if (this.active && time >= this.nextRot) {
      this.nextRot = time + ROT_MS;
      const p = this.scene.player;
      if (p.hurt(1, p.x + p.facing, true)) floatText(this.scene, p.x, p.y - 20, 'context rot -1', '#e5534b');
    }
  }
}
