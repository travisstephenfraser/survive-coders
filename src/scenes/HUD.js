import Phaser from 'phaser';
import { POWERS, voice } from '../voice.js';
import { MAX_HP, uiText } from '../util.js';

// Screen-space overlay. Everything sits on a 3px grid (one world pixel at 3x zoom) so the
// bars and frames read as the same pixel art as the game.
const P = 3;

// Segmented pixel bar with 3-tone shading, drawn in world-pixel units.
function segBar(g, x, y, cells, filled, colors, cellW = 7) {
  const [hi, mid, lo, empty] = colors;
  const w = cells * cellW + (cells - 1) + 4;
  const h = 8;
  g.fillStyle(0xd97757).fillRect(x, y, w * P, h * P);
  g.fillStyle(0x140f12).fillRect(x + P, y + P, (w - 2) * P, (h - 2) * P);
  for (let i = 0; i < cells; i++) {
    const cx = x + (2 + i * (cellW + 1)) * P;
    const cy = y + 2 * P;
    if (i < filled) {
      g.fillStyle(mid).fillRect(cx, cy, cellW * P, 4 * P);
      g.fillStyle(hi).fillRect(cx, cy, cellW * P, P);
      g.fillStyle(lo).fillRect(cx, cy + 3 * P, cellW * P, P);
    } else g.fillStyle(empty).fillRect(cx, cy, cellW * P, 4 * P);
  }
  return w * P;
}

function frame(g, x, y, w, h, border, fill) {
  g.fillStyle(border).fillRect(x, y, w, h);
  g.fillStyle(fill).fillRect(x + P, y + P, w - 2 * P, h - 2 * P);
}

export default class HUD extends Phaser.Scene {
  constructor() {
    super('HUD');
  }

  create() {
    this.g = this.add.graphics();

    // Health: heart icon + segmented bar (drawn in update).
    this.add.image(18, 15, 'heart').setOrigin(0).setScale(P);

    // GitHub-style "★ Star | 42" badge (frame drawn in update).
    this.add.image(744, 18, 'star').setOrigin(0).setScale(P);
    uiText(this, 776, 22, 'Star', { size: 16, color: '#e3b341' });
    this.stars = uiText(this, 900, 30, '0', { size: 24, color: '#f5f5f5', ox: 0.5, oy: 0.5 });

    this.level = uiText(this, 480, 14, '', { size: 16, color: '#d97757', ox: 0.5 });
    this.godBadge = uiText(this, 48, 52, 'GOD MODE', { size: 8, color: '#3fb950' });
    this.bossText = uiText(this, 480, 64, '', { size: 16, color: '#e5534b', ox: 0.5 });
    // Context growth is labeled separately from boss health (Astra review item 5).
    this.ctxLabel = uiText(this, 330, 94, 'CONTEXT', { size: 8, color: '#58a6ff', oy: 0.5 });
    this.ctxText = uiText(this, 470, 94, '', { size: 8, color: '#58a6ff', oy: 0.5 });
    this.reversed = uiText(this, 480, 116, '<-> CONTROLS REVERSED', { size: 16, color: '#bc8cff', ox: 0.5 }).setVisible(false);

    // Bottom terminal strip.
    this.powers = Object.entries(POWERS).map(([name, p], i) => ({
      name,
      p,
      x: 18 + i * 186,
      label: uiText(this, 18 + i * 186 + 87, 495, `${p.key} ${p.label}`, { size: 16, color: '#0d0d0d', ox: 0.5, oy: 0.5 }),
    }));
    this.mic = uiText(this, 942, 495, '', { size: 16, color: '#8b8b8b', ox: 1, oy: 0.5 });
    this.heard = uiText(this, 18, 522, '', { size: 16, color: '#f5f5f5', oy: 0.5 });
    uiText(this, 942, 522, '←→ move  ↑ jump  SPACE fire  P pause', { size: 16, color: '#8b8b8b', ox: 1, oy: 0.5 });
    for (const pw of this.powers) pw.label.setDepth(1);
    this.mic.setDepth(1);

    this.toastText = uiText(this, 480, 158, '', { size: 16, color: '#f5f5f5', ox: 0.5, oy: 0.5 }).setDepth(3);
    this.pausedText = uiText(this, 480, 250, 'PAUSED\n\nP: resume   N: mute', { size: 24, color: '#d97757', ox: 0.5, oy: 0.5 })
      .setDepth(3)
      .setVisible(false);

    // Pause / mute live here because the HUD keeps running while the play scene is paused.
    const kb = this.input.keyboard;
    const togglePause = () => {
      if (this.registry.get('cutscene')) return;
      const play = ['Level1', 'BossHQ'].map((k) => this.scene.get(k)).find((sc) => sc.sys.isActive() || sc.sys.isPaused());
      if (!play) return;
      if (play.sys.isPaused()) play.scene.resume();
      else play.scene.pause();
      this.pausedText.setVisible(play.sys.isPaused());
    };
    kb.on('keydown-P', togglePause);
    kb.on('keydown-ESC', togglePause);
    kb.on('keydown-N', () => (this.sound.mute = !this.sound.mute));
  }

  update(time) {
    const r = this.registry;
    const g = this.g;
    g.clear();

    // Static frames are redrawn each frame with the dynamic bars (cheap: a few dozen rects).
    frame(g, 732, 12, 216, 36, 0x444c56, 0x21262d);
    g.fillStyle(0x444c56).fillRect(852, 12, P, 36);
    g.fillStyle(0x0d1117).fillRect(855, 15, 90, 30);
    frame(g, 0, 474, 960, 66, 0xd97757, 0x0d0d0d);

    const hp = r.get('hp') ?? 0;
    segBar(g, 48, 15, MAX_HP, hp, [0xff8f80, 0xe5534b, 0xa33a33, 0x3a2a2a]);

    this.stars.setText(`${r.get('stars') ?? 0}`);
    this.godBadge.setVisible(Boolean(r.get('god')));
    this.level.setText(r.get('level') ?? '');
    this.reversed.setVisible(Boolean(r.get('reversed')) && Math.floor(time / 200) % 2 === 0);

    const boss = r.get('boss');
    this.bossText.setVisible(Boolean(boss));
    this.ctxLabel.setVisible(Boolean(boss && boss.heads));
    this.ctxText.setVisible(Boolean(boss && boss.heads));
    if (boss) {
      const cells = 12;
      const filled = Math.ceil(cells * Phaser.Math.Clamp(boss.hp / Math.max(1, boss.max), 0, 1));
      segBar(g, 480 - ((cells * 8 + 3) * P) / 2, 36, cells, filled, [0xffb199, 0xd97757, 0x8a4a36, 0x2a1a14]);
      this.bossText.setText(`CONTEXT ROT HYDRA  heads ${boss.heads}/3  turn ${boss.turn}`);
      if (boss.heads) {
        // Growth meter: one cell per growth step, then time to the next growth (the real timer).
        for (let i = 0; i < boss.maxGrowth; i++) {
          g.fillStyle(i < boss.growth ? 0x58a6ff : 0x1c2a3a).fillRect(390 + i * 24, 88, 21, 12);
        }
        const full = boss.growth >= boss.maxGrowth;
        this.ctxText.setText(full ? 'FULL  (refactor it!)' : `next growth ${Math.ceil(boss.nextMs / 1000)}s`);
      }
    }

    // Contextual tip.
    const toast = r.get('toast');
    const play = this.scene.get('Level1')?.sys.isActive() ? this.scene.get('Level1') : this.scene.get('BossHQ');
    const now = play?.time.now ?? 0;
    const showToast = toast && now < toast.until;
    this.toastText.setVisible(Boolean(showToast));
    if (showToast) {
      this.toastText.setText(toast.text);
      const w = this.toastText.width + 24;
      frame(g, 480 - w / 2, 140, w, 36, 0xd97757, 0x0d0d0d);
    }
    const pulse = showToast && toast.power && Math.floor(time / 180) % 2 === 0 ? toast.power : null;

    for (const pw of this.powers) {
      const left = voice.remaining(pw.name);
      const ready = left <= 0;
      const justRan = voice.lastEvent?.type === 'fired' && voice.lastEvent.name === pw.name && performance.now() - voice.lastEvent.at < 400;
      if (pw.name === pulse || justRan) frame(g, pw.x - P, 480, 174 + 2 * P, 30, justRan ? 0x3fb950 : 0xf5f5f5, justRan ? 0x3fb950 : 0xf5f5f5);
      frame(g, pw.x, 483, 174, 24, ready ? 0xf3a07a : 0x6b3b2b, ready ? 0xd97757 : 0x2a1a14);
      if (!ready) {
        const frac = 1 - left / pw.p.cooldown;
        g.fillStyle(0x6b3b2b).fillRect(pw.x + P, 483 + P, Math.floor(((174 - 2 * P) * frac) / P) * P, 24 - 2 * P);
      }
      pw.label.setTint(ready ? 0x0d0d0d : 0x8b8b8b);
    }

    // Left: what the mic heard. Right: what actually happened (ran / cooling down) for ~2s,
    // otherwise the mic state. Speech recognized is not the same as a power firing.
    const heard = voice.heard ? `heard "${voice.heard.slice(-26)}"` : voice.listening ? 'listening...' : 'hold M: "ship it"';
    this.heard.setText(`$ ${heard}`);
    const ev = voice.lastEvent;
    const fresh = ev && performance.now() - ev.at < 2000;
    if (fresh && ev.type === 'fired') {
      this.mic.setText(`✓ ran: ${POWERS[ev.name].label}`);
      this.mic.setTint(0x3fb950);
    } else if (fresh && ev.type === 'cooldown') {
      this.mic.setText(`${POWERS[ev.name].label}: cooling down ${Math.ceil(ev.left / 1000)}s`);
      this.mic.setTint(0xe3b341);
    } else {
      this.mic.setText(`${voice.listening ? '●' : '○'} ${voice.status}`);
      this.mic.setTint(voice.listening ? 0x3fb950 : 0x8b8b8b);
    }
  }
}
