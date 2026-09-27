import Phaser from 'phaser';
import { POWERS, voice } from '../voice.js';
import { MAX_HP, MAX_TOKENS, uiText } from '../util.js';
import { TOUCH, dimPad, showPad, touch } from '../touch.js';

// Screen-space overlay. Everything sits on a 3px grid (one world pixel at 3x zoom) so the
// bars and frames read as the same pixel art as the game.
const P = 3;
const STRIP_Y = 474; // top of the bottom terminal strip
// Touch only: the pause button (between the level name and the star badge) and, while
// paused, a sound toggle.
const PAUSE_BTN = { x: 684, y: 12, w: 36, h: 36 };
const SOUND_BTN = { x: 390, y: 318, w: 180, h: 42 };
const hit = (p, r, pad = 0) => p.x >= r.x - pad && p.x < r.x + r.w + pad && p.y >= r.y - pad && p.y < r.y + r.h + pad;

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
    // MAX token meter under the health bar (bar drawn in update); hidden until MAX is picked up.
    this.maxIcon = this.add.image(18, 63, 'max_chip').setOrigin(0).setScale(P);
    this.maxCount = uiText(this, 234, 76, '', { size: 16, color: '#f59a70', oy: 0.5 });
    this.bossText = uiText(this, 480, 64, 'CONTEXT ROT HYDRA', { size: 16, color: '#e5534b', ox: 0.5 });
    // Context growth is labeled separately from boss health (Astra review item 5).
    this.ctxLabel = uiText(this, 0, 94, 'CONTEXT', { size: 8, color: '#58a6ff', ox: 1, oy: 0.5 });
    this.ctxText = uiText(this, 0, 94, '', { size: 8, color: '#58a6ff', oy: 0.5 });

    // Bottom terminal strip. On touch the corners belong to the D-pad and FIRE/JUMP, so the
    // slots centre up as tap targets, plus a hold-to-talk slot when speech is available.
    const slotW = TOUCH ? 150 : 174;
    const talk = TOUCH && voice.supported;
    const span = 3 * slotW + 2 * 12 + (talk ? 12 + 102 : 0);
    const x0 = TOUCH ? Math.round((960 - span) / 2 / P) * P : 18;
    this.powers = Object.entries(POWERS).map(([name, p], i) => {
      const x = x0 + i * (slotW + 12);
      const text = TOUCH ? p.label : `${p.key} ${p.label}`;
      return { name, p, x, w: slotW, label: uiText(this, x + slotW / 2, 495, text, { size: 16, color: '#0d0d0d', ox: 0.5, oy: 0.5 }).setDepth(1) };
    });
    if (talk) {
      const x = x0 + 3 * (slotW + 12);
      this.talk = { x, w: 102, label: uiText(this, x + 51, 495, '● talk', { size: 16, color: '#8b8b8b', ox: 0.5, oy: 0.5 }).setDepth(1) };
    }
    if (TOUCH) {
      // One centred status line between the thumbs: what ran, what the mic heard, or a hint.
      this.heard = uiText(this, 480, 522, '', { size: 16, color: '#f5f5f5', ox: 0.5, oy: 0.5 });
    } else {
      this.mic = uiText(this, 942, 495, '', { size: 16, color: '#8b8b8b', ox: 1, oy: 0.5 }).setDepth(1);
      this.heard = uiText(this, 18, 522, '', { size: 16, color: '#f5f5f5', oy: 0.5 });
      uiText(this, 942, 522, '←→ move  ↑ jump  SPACE fire  P pause', { size: 16, color: '#8b8b8b', ox: 1, oy: 0.5 });
    }

    this.toastText = uiText(this, 480, 158, '', { size: 16, color: '#f5f5f5', ox: 0.5, oy: 0.5 }).setDepth(3);
    // Paused: the scene dims so the text reads over the busy city.
    this.dim = this.add.rectangle(0, 0, 960, 540, 0x0d0d0d, 0.6).setOrigin(0).setDepth(2).setVisible(false);
    this.pausedText = uiText(this, 480, 250, TOUCH ? 'PAUSED\n\ntap to resume' : 'PAUSED\n\nP: resume   N: mute', { size: 24, color: '#d97757', ox: 0.5, oy: 0.5 })
      .setCenterAlign()
      .setDepth(3)
      .setVisible(false);
    const { x: sx, y: sy, w: sw, h: sh } = SOUND_BTN;
    this.soundBox = this.add.rectangle(sx, sy, sw, sh, 0x0d0d0d).setOrigin(0).setStrokeStyle(3, 0xd97757).setDepth(4).setVisible(false);
    this.soundText = uiText(this, sx + sw / 2, sy + sh / 2, '', { size: 16, color: '#f5f5f5', ox: 0.5, oy: 0.5 }).setDepth(5).setVisible(false);

    // Pause / mute live here because the HUD keeps running while the play scene is paused.
    const kb = this.input.keyboard;
    const togglePause = () => this.setPaused(!this.playScene()?.sys.isPaused());
    kb.on('keydown-P', togglePause);
    kb.on('keydown-ESC', togglePause);
    kb.on('keydown-N', () => (this.sound.mute = !this.sound.mute));

    // Taps: power slots (any pointer, so a mouse can click them too), and on touch the
    // hold-to-talk slot, the pause button and the pause screen.
    this.talkPointer = null;
    this.input.on('pointerdown', (p) => this.tap(p));
    const untap = (p) => {
      if (p.id !== this.talkPointer) return;
      this.talkPointer = null;
      voice.release();
    };
    this.input.on('pointerup', untap);
    this.input.on('pointerupoutside', untap);

    // Auto-pause when the tab hides (a phone call, an app switch) or the phone turns
    // portrait, so the run is never lost behind the rotate overlay.
    const autoPause = () => this.setPaused(true);
    const portrait = matchMedia('(orientation: portrait)');
    const onTurn = () => portrait.matches && autoPause();
    this.game.events.on('hidden', autoPause);
    if (TOUCH) portrait.addEventListener('change', onTurn);
    this.events.once('shutdown', () => {
      this.game.events.off('hidden', autoPause);
      portrait.removeEventListener('change', onTurn);
      if (this.talkPointer !== null) voice.release();
      showPad(false);
    });
  }

  playScene() {
    return ['Level1', 'BossHQ'].map((k) => this.scene.get(k)).find((sc) => sc.sys.isActive() || sc.sys.isPaused());
  }

  setPaused(on) {
    const play = this.playScene();
    if (!play || this.registry.get('cutscene') || play.sys.isPaused() === on) return;
    if (on) play.scene.pause();
    else play.scene.resume();
    touch.dropJump(); // held thumbs carry over like held keys; a jump tapped meanwhile doesn't
    this.pausedText.setVisible(on);
    this.dim.setVisible(on);
    this.soundBox.setVisible(on && TOUCH);
    this.soundText.setVisible(on && TOUCH);
  }

  tap(p) {
    const play = this.playScene();
    if (!play || this.registry.get('cutscene')) return;
    if (play.sys.isPaused()) {
      if (!TOUCH) return;
      if (hit(p, SOUND_BTN, 12)) this.sound.mute = !this.sound.mute;
      else this.setPaused(false);
      return;
    }
    if (TOUCH && hit(p, PAUSE_BTN, 12)) {
      this.setPaused(true);
      return;
    }
    if (p.y < STRIP_Y - 6) return;
    const pw = this.powers.find((s) => p.x >= s.x - 6 && p.x < s.x + s.w + 6);
    if (pw) voice.trigger(pw.name, 'touch');
    else if (this.talk && p.x >= this.talk.x - 6 && p.x < this.talk.x + this.talk.w + 6) {
      this.talkPointer = p.id;
      voice.press();
    }
  }

  update(time) {
    const r = this.registry;
    const g = this.g;
    g.clear();

    // Static frames are redrawn each frame with the dynamic bars (cheap: a few dozen rects).
    frame(g, 732, 12, 216, 36, 0x444c56, 0x21262d);
    g.fillStyle(0x444c56).fillRect(852, 12, P, 36);
    g.fillStyle(0x0d1117).fillRect(855, 15, 90, 30);
    frame(g, 0, STRIP_Y, 960, 66, 0xd97757, 0x0d0d0d);

    const hp = r.get('hp') ?? 0;
    segBar(g, 48, 15, MAX_HP, hp, [0xff8f80, 0xe5534b, 0xa33a33, 0x3a2a2a]);

    this.stars.setText(`${r.get('stars') ?? 0}`);
    this.godBadge.setVisible(Boolean(r.get('god')));

    const tokens = r.get('maxTokens') ?? 0;
    this.maxIcon.setVisible(tokens > 0);
    this.maxCount.setVisible(tokens > 0).setText(`${tokens} token${tokens === 1 ? '' : 's'}`);
    if (tokens > 0) segBar(g, 93, 64, 8, Math.ceil((8 * tokens) / MAX_TOKENS), [0xffc3a6, 0xf59a70, 0xa8553a, 0x2a1a14], 4);
    this.level.setText(r.get('level') ?? '');

    const boss = r.get('boss');
    this.bossText.setVisible(Boolean(boss));
    this.ctxLabel.setVisible(Boolean(boss && boss.heads));
    this.ctxText.setVisible(Boolean(boss && boss.heads));
    if (boss) {
      const cells = 12;
      const filled = Math.ceil(cells * Phaser.Math.Clamp(boss.hp / Math.max(1, boss.max), 0, 1));
      segBar(g, 480 - ((cells * 8 + 3) * P) / 2, 36, cells, filled, [0xffb199, 0xd97757, 0x8a4a36, 0x2a1a14]);
      if (boss.heads) {
        // Growth meter centered under the boss bar, one cell per growth step: the label to its
        // left, the time to the next growth (the real timer) to its right.
        const w = boss.maxGrowth * 24 - 3;
        const x0 = Math.round(480 - w / 2);
        for (let i = 0; i < boss.maxGrowth; i++) {
          g.fillStyle(i < boss.growth ? 0x58a6ff : 0x1c2a3a).fillRect(x0 + i * 24, 88, 21, 12);
        }
        this.ctxLabel.setX(x0 - 12);
        this.ctxText.setX(x0 + w + 12);
        const full = boss.growth >= boss.maxGrowth;
        // The call to action during an overflow is the power bar's status line; this just states it.
        // Short enough to balance "CONTEXT" on the other side, and to clear the top head.
        this.ctxText.setText(boss.overflow ? 'OVERFLOW' : full ? 'FULL' : `next ${Math.ceil(boss.nextMs / 1000)}s`);
        this.ctxText.setTint(boss.overflow ? 0xe5534b : 0x58a6ff);
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
    // A full context pulses refactor for as long as it lasts; its call to action is the status line.
    const overflow = Boolean(boss?.overflow);
    const blink = Math.floor(time / 180) % 2 === 0;
    const pulse = blink ? (showToast && toast.power) || (overflow ? 'refactor' : null) : null;
    const refactorLeft = voice.remaining('refactor');
    const cta = !overflow ? null : refactorLeft > 0 ? `CONTEXT FULL → refactor ready in ${Math.ceil(refactorLeft / 1000)}s` : TOUCH ? 'CONTEXT FULL → tap "refactor"' : 'CONTEXT FULL → hold M: "refactor" (or 3)';

    for (const pw of this.powers) {
      const left = voice.remaining(pw.name);
      const ready = left <= 0;
      const justRan = voice.lastEvent?.type === 'fired' && voice.lastEvent.name === pw.name && performance.now() - voice.lastEvent.at < 400;
      if (pw.name === pulse || justRan) frame(g, pw.x - P, 480, pw.w + 2 * P, 30, justRan ? 0x3fb950 : 0xf5f5f5, justRan ? 0x3fb950 : 0xf5f5f5);
      frame(g, pw.x, 483, pw.w, 24, ready ? 0xf3a07a : 0x6b3b2b, ready ? 0xd97757 : 0x2a1a14);
      if (!ready) {
        const frac = 1 - left / pw.p.cooldown;
        g.fillStyle(0x6b3b2b).fillRect(pw.x + P, 483 + P, Math.floor(((pw.w - 2 * P) * frac) / P) * P, 24 - 2 * P);
      }
      pw.label.setTint(ready ? 0x0d0d0d : 0x8b8b8b);
    }
    if (this.talk) {
      const on = voice.listening;
      frame(g, this.talk.x, 483, this.talk.w, 24, on ? 0x3fb950 : 0x444c56, on ? 0x3fb950 : 0x21262d);
      this.talk.label.setTint(on ? 0x0d0d0d : 0xf5f5f5);
    }

    const ev = voice.lastEvent;
    const fresh = ev && performance.now() - ev.at < 2000;
    const paused = Boolean(this.playScene()?.sys.isPaused());
    if (TOUCH) {
      showPad(!r.get('cutscene'));
      dimPad(paused);
      if (!paused) {
        // Pause button: two bars in a badge frame, like the star badge.
        frame(g, PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h, 0x444c56, 0x21262d);
        g.fillStyle(0xf5f5f5).fillRect(PAUSE_BTN.x + 9, PAUSE_BTN.y + 9, 6, 18).fillRect(PAUSE_BTN.x + 21, PAUSE_BTN.y + 9, 6, 18);
      }
      this.soundText.setText(this.sound.mute ? 'sound: off' : 'sound: on');
      const idle = !voice.heard && !voice.listening && !fresh;
      let line = voice.heard ? `$ heard "${voice.heard.slice(-26)}"` : voice.listening ? '$ listening... let go to run it' : cta ? `$ ${cta}` : this.talk ? '$ tap a power, or hold talk and say it' : '$ tap a power to run it';
      if (fresh && ev.type === 'fired') line = `✓ ran: ${POWERS[ev.name].label}`;
      else if (fresh && ev.type === 'cooldown') line = `${POWERS[ev.name].label}: cooling down ${Math.ceil(ev.left / 1000)}s`;
      this.heard.setText(line).setTint(fresh && ev.type === 'fired' ? 0x3fb950 : fresh ? 0xe3b341 : idle && cta ? 0xe5534b : 0xf5f5f5);
      return;
    }

    // Left: what the mic heard. Right: what actually happened (ran / cooling down) for ~2s,
    // otherwise the mic state. Speech recognized is not the same as a power firing.
    const heard = voice.heard ? `heard "${voice.heard.slice(-26)}"` : voice.listening ? 'listening...' : (cta ?? 'hold M: "ship it"');
    this.heard.setText(`$ ${heard}`).setTint(!voice.heard && !voice.listening && cta ? 0xe5534b : 0xf5f5f5);
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
