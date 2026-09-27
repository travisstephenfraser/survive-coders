import Phaser from 'phaser';
import { floatText, worldText } from '../util.js';

// Context overflow: once the Hydra's context window is full, terminal text buries the arena
// and the player takes context rot until a refactor compacts it. The rain covers the office
// and platforms but stays under the fight, so every threat and warning reads on top of it;
// the player's pool of attention cuts through, and a few big faint glyphs drift over it all.
const GLYPHS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'];
const COLS = 40; // one column every 8px across the 320px arena
const NEAR = 8; // bright glyphs right behind each falling head
const FAR = 14; // dim tail above them
const RAMP_MS = 3000; // drizzle to downpour
const GRACE_MS = 3000; // warning time before the first context rot
const ROT_MS = 3000; // then 1 damage per tick while full
export const DEPTH = 1.5; // over the platforms (0), under the Hydra's necks (2) and the rest of the fight
const FG_DEPTH = 46; // the drifting big glyphs: over the fight, under float text (50)
const FG_COLS = 5;
const WASH = 0.6;
const POOL = 44; // attention radius around the player, world px
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
    // The call to action is in the HUD's power bar (it reads the boss state), off the arena.
  }

  stop(compacted = true) {
    if (!this.active) return;
    this.active = false;
    if (compacted) floatText(this.scene, 160, 70, 'context compacted', '#3fb950');
  }

  build() {
    const s = this.scene;
    this.layer = s.add.layer().setDepth(DEPTH);
    this.wash = s.add.rectangle(0, 0, 320, ARENA_H, 0x0d0d0d).setOrigin(0).setDepth(-1).setAlpha(0);
    this.layer.add(this.wash);
    // Attention: an inverted soft mask on the whole layer, following the player. WebGL only;
    // without it the fight still reads, since nothing that can hurt is under the rain.
    if (s.game.renderer.type === Phaser.WEBGL) {
      this.pool = s.make.image({ key: poolTexture(s), add: false });
      const mask = this.pool.createBitmapMask();
      mask.invertAlpha = true;
      this.layer.setMask(mask);
      s.events.once('shutdown', () => {
        mask.destroy();
        this.pool.destroy();
      });
    }
    this.fg = Array.from({ length: FG_COLS }, (_, i) => ({
      text: worldText(s, 0, 0, glyphs(5).join('\n'), { size: 12, color: '#c9c9c9', ox: 0.5, oy: 1, depth: FG_DEPTH }),
      x: 32 + i * 64 + Phaser.Math.Between(-16, 16),
      y: -Phaser.Math.Between(0, ARENA_H),
      speed: Phaser.Math.Between(18, 32),
    }));
    return Array.from({ length: COLS }, (_, i) => {
      const x = 4 + i * 8;
      const opts = (color) => ({ color, ox: 0.5, oy: 1 });
      const c = {
        near: glyphs(NEAR),
        far: glyphs(FAR),
        head: worldText(s, x, 0, glyphs(1)[0], opts('#ffffff')),
        y: -Phaser.Math.Between(0, ARENA_H),
        speed: Phaser.Math.Between(50, 120),
        threshold: Math.random(), // the column joins once density passes this
      };
      c.nearText = worldText(s, x, 0, c.near.join('\n'), opts('#c9c9c9'));
      c.farText = worldText(s, x, 0, c.far.join('\n'), opts('#6e6e6e')).setAlpha(0.6);
      this.layer.add([c.head, c.nearText, c.farText]);
      return c;
    });
  }

  update(time, delta) {
    if (!this.cols) return;
    // Density ramps up while full and drains in ~0.6s once compacted.
    this.level = this.active ? Math.min(1, (time - this.startedAt) / RAMP_MS) : Math.max(0, this.level - delta / 600);
    this.wash.setAlpha(this.level * WASH);
    const p = this.scene.player;
    this.pool?.setPosition(p.x, p.y - 2);
    const flicker = time > (this.nextFlicker ?? 0);
    if (flicker) this.nextFlicker = time + 90;
    for (const f of this.fg) {
      f.text.setVisible(this.level > 0).setAlpha(this.level * 0.22);
      if (!this.level) continue;
      f.y += (f.speed * delta) / 1000;
      if (f.y - f.text.height > ARENA_H) f.y = -Phaser.Math.Between(0, 40);
      f.text.setPosition(f.x, f.y);
    }
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
      if (p.hurt(1, p.x + p.facing, true)) floatText(this.scene, p.x, p.y - 20, 'context rot -1', '#e5534b');
    }
  }
}

// Soft white disc, opaque in the middle: the attention mask's source.
function poolTexture(scene) {
  const key = 'attention_pool';
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, POOL * 2, POOL * 2);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(POOL, POOL, POOL * 0.55, POOL, POOL, POOL);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, POOL * 2, POOL * 2);
    tex.refresh();
  }
  return key;
}
