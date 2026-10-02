import Phaser from 'phaser';
import { POWERS, powerKeys, voice } from '../voice.js';
import { MAX_HP, MAX_TOKENS, freshKey, onAction, uiText } from '../util.js';
import { UNBOUND, keymap } from '../keymap.js';
import { isMuted, toggleMute } from '../audio.js';
import { settings } from '../settings.js';
import { beginRun, retryLevel, run } from '../run.js';
import { formatTime } from '../../shared/leaderboard.js';
import { TOUCH, dimPad, showPad, touch } from '../touch.js';
import PlayScene from './PlayScene.js';

// Screen-space overlay. Everything sits on a 3px grid (one world pixel at 3x zoom) so the
// bars and frames read as the same pixel art as the game.
const P = 3;
const STRIP_Y = 474; // top of the bottom terminal strip
// Touch only: the pause button (between the level name and the star badge) and, while
// paused, a sound toggle.
const PAUSE_BTN = { x: 684, y: 12, w: 36, h: 36 };
const SOUND_BTN = { x: 390, y: 246, w: 180, h: 42 };
// Paused, on every device: restart the level, start a new run, or quit to the title, side by
// side (under the sound toggle on touch). Wide enough for the longest key name in front of the
// label. `action` is the button's key in the map (keymap.js) and what it does (HUD.pauseActs).
const BTN_Y = TOUCH ? 300 : 246;
const PAUSE_BTNS = [
  { x: 135, y: BTN_Y, w: 222, h: 42, action: 'restart', label: 'restart level' },
  { x: 369, y: BTN_Y, w: 222, h: 42, action: 'newrun', label: 'new run' },
  { x: 603, y: BTN_Y, w: 222, h: 42, action: 'title', label: 'quit to title' },
];
const BTN_PAD = 6; // half the gap between two, so one's margin never reaches into the next
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

// A control's label with its key in front, or the label alone where the two don't fit or the
// action has no key.
function keyed(text, key, label, maxW) {
  text.setText(`${key} ${label}`);
  if (key === UNBOUND || text.width > maxW) text.setText(label);
  return text;
}

export default class HUD extends Phaser.Scene {
  constructor() {
    super('HUD');
  }

  create() {
    // ESC always pauses, so the pause screen can name a key even with pause unbound.
    const pauseKey = keymap.codes('pause').length ? keymap.name('pause') : 'ESC';
    this.g = this.add.graphics();

    // Health: heart icon + segmented bar (drawn in update).
    this.add.image(18, 15, 'heart').setOrigin(0).setScale(P);

    // GitHub-style "★ Star | 42" badge (frame drawn in update).
    this.add.image(744, 18, 'star').setOrigin(0).setScale(P);
    uiText(this, 776, 22, 'Star', { size: 16, color: '#e3b341' });
    this.stars = uiText(this, 900, 30, '0', { size: 24, color: '#f5f5f5', ox: 0.5, oy: 0.5 });
    // The run clock under the badge, when Settings turns it on (red once the run can't rank).
    this.timer = uiText(this, 946, 56, '', { size: 16, color: '#8b8b8b', ox: 1 });

    this.level = uiText(this, 480, 14, '', { size: 16, color: '#d97757', ox: 0.5 });
    this.godBadge = uiText(this, 48, 52, 'GOD MODE', { size: 8, color: '#3fb950' });
    // MAX token meter under the health bar (bar drawn in update); hidden until MAX is picked up.
    this.maxIcon = this.add.image(18, 63, 'max_chip').setOrigin(0).setScale(P);
    this.maxCount = uiText(this, 234, 76, '', { size: 16, color: '#f59a70', oy: 0.5 });
    this.bossText = uiText(this, 480, 64, 'CONTEXT ROT HYDRA', { size: 16, color: '#e5534b', ox: 0.5 });
    // Context growth is labeled separately from boss health (Astra review item 5).
    this.ctxLabel = uiText(this, 0, 94, 'CONTEXT', { size: 8, color: '#58a6ff', ox: 1, oy: 0.5 });
    this.ctxText = uiText(this, 0, 94, '', { size: 8, color: '#58a6ff', oy: 0.5 });

    // The status lines that name keys, built once: the map and the mic's mode can't change
    // during a run. `say` is how voice is set up here: open, hold, or keys only (voice.js).
    const key = (action) => keymap.name(action);
    const keys = Object.keys(POWERS).map(key).join(' ');
    const say = (this.say = voice.hint);
    this.talkKey = key('talk');
    this.lines = {
      powers: { open: `powers: ${keys}, or just say one`, hold: `powers: ${keys}, or hold ${key('talk')} and say one`, keys: `powers: press ${keys}` }[say],
      full: {
        open: `CONTEXT FULL → say "refactor" (or ${key('refactor')})`,
        hold: `CONTEXT FULL → hold ${key('talk')}: "refactor" (or ${key('refactor')})`,
        keys: `CONTEXT FULL → press ${key('refactor')} for refactor`,
      }[say],
    };

    // Bottom terminal strip. On touch the corners belong to the D-pad and FIRE/JUMP, so the
    // slots centre up as tap targets, plus a hold-to-talk slot when speech is available.
    const slotW = TOUCH ? 150 : 174;
    const talk = TOUCH && voice.supported;
    const span = 3 * slotW + 2 * 12 + (talk ? 12 + 102 : 0);
    const x0 = TOUCH ? Math.round((960 - span) / 2 / P) * P : 18;
    this.powers = Object.entries(POWERS).map(([name, p], i) => {
      const x = x0 + i * (slotW + 12);
      const label = uiText(this, x + slotW / 2, 495, p.label, { size: 16, color: '#0d0d0d', ox: 0.5, oy: 0.5 }).setDepth(1);
      if (!TOUCH) keyed(label, key(name), p.label, slotW - 12);
      return { name, p, x, w: slotW, label };
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
      // The controls hint shares its row with the status line on the left: as much of it as
      // fits beside the widest line this map can put there (long key names are wide).
      const hints = [
        `${keymap.pair('left', 'right')} move  ${key('jump')} jump  ${key('fire')} fire  ${pauseKey} pause`,
        `${key('jump')} jump  ${key('fire')} fire  ${pauseKey} pause`,
        `${pauseKey} pause`,
      ];
      const hint = uiText(this, 942, 522, '', { size: 16, color: '#8b8b8b', ox: 1, oy: 0.5 });
      const room = 942 - 18 - 24 - Math.max(...Object.values(this.lines).map((line) => hint.setText(`$ ${line}`).width));
      hint.setText(hints.find((h) => hint.setText(h).width <= room) ?? '');
    }

    this.toastText = uiText(this, 480, 158, '', { size: 16, color: '#f5f5f5', ox: 0.5, oy: 0.5 }).setDepth(3);
    // Paused: the scene dims so the text reads over the busy city.
    this.dim = this.add.rectangle(0, 0, 960, 540, 0x0d0d0d, 0.6).setOrigin(0).setDepth(2).setVisible(false);
    this.pausedText = uiText(this, 480, 190, TOUCH ? 'PAUSED\n\ntap to resume' : `PAUSED\n\n${pauseKey}: resume   ${keymap.name('mute')}: mute`, { size: 24, color: '#d97757', ox: 0.5, oy: 0.5 })
      .setCenterAlign()
      .setDepth(3)
      .setVisible(false);
    // Paused: the controls and powers, for anyone the tips missed (a playtester spent three
    // minutes taking SPACE for "ship it"). Under the buttons, clear of the terminal strip.
    const powerLines = Object.entries(POWERS).map(([name, p]) => `${TOUCH ? '' : `${key(name)}  `}${p.label}: ${p.does}`);
    const help = TOUCH
      ? [`>_ fire   ↑ jump   powers: tap the bar${voice.supported ? ', or hold talk and say one' : ''}`, ...powerLines]
      : [
          `${keymap.pair('left', 'right')} move   ${keymap.names('jump')} jump   ${key('fire')} fire`,
          ...powerLines,
          ...{ open: ['or just say the power out loud'], hold: [`or hold ${key('talk')}, say the power, let go`], keys: [] }[say],
        ];
    this.helpText = uiText(this, 480, TOUCH ? 352 : 316, help.join('\n'), { size: 16, color: '#c9d1d9', ox: 0.5, lineSpacing: 4 })
      .setCenterAlign()
      .setDepth(3)
      .setVisible(false);
    const { x: sx, y: sy, w: sw, h: sh } = SOUND_BTN;
    this.soundBox = this.add.rectangle(sx, sy, sw, sh, 0x0d0d0d).setOrigin(0).setStrokeStyle(3, 0xd97757).setDepth(4).setVisible(false);
    this.soundText = uiText(this, sx + sw / 2, sy + sh / 2, '', { size: 16, color: '#f5f5f5', ox: 0.5, oy: 0.5 }).setDepth(5).setVisible(false);
    // The pause buttons, each naming its key on a keyboard.
    this.pauseButtons = PAUSE_BTNS.flatMap((b) => {
      const box = this.add.rectangle(b.x, b.y, b.w, b.h, 0x0d0d0d).setOrigin(0).setStrokeStyle(3, 0xd97757).setDepth(4).setVisible(false);
      const text = uiText(this, b.x + b.w / 2, b.y + b.h / 2, b.label, { size: 16, color: '#f5f5f5', ox: 0.5, oy: 0.5 }).setDepth(5).setVisible(false);
      if (!TOUCH) keyed(text, keymap.name(b.action), b.label, b.w - 24);
      return [box, text];
    });
    // What each button, and its key, does. Each only acts while paused.
    this.pauseActs = { restart: () => this.restartLevel(), newrun: () => this.newRun(), title: () => this.toTitle() };

    // Pause / mute live here because the HUD keeps running while the play scene is paused.
    // ESC always pauses, whatever the controls screen has set for pause (keymap.js).
    const togglePause = () => this.setPaused(!this.playScene()?.sys.isPaused());
    this.input.keyboard.on('keydown-ESC', freshKey(togglePause));
    onAction(this, 'pause', togglePause);
    onAction(this, 'mute', () => toggleMute(this.sound));
    for (const b of PAUSE_BTNS) onAction(this, b.action, () => this.pauseActs[b.action]());

    // Taps: power slots (any pointer, so a mouse can click them too), and on touch the
    // hold-to-talk slot, the pause button and the pause screen.
    this.talkPointer = null;
    this.armed = null; // the pause button a press began on
    this.input.on('pointerdown', (p) => this.tap(p));
    const untap = (p) => {
      if (p.id !== this.talkPointer) return;
      this.talkPointer = null;
      voice.release();
    };
    this.input.on('pointerup', untap);
    // A pause button acts on release, and only for a press that began on it.
    this.input.on('pointerup', (p) => {
      const btn = this.armed;
      this.armed = null;
      if (btn && hit(p, btn, BTN_PAD)) this.pauseActs[btn.action]();
    });
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
    return this.scene.manager.scenes.find((sc) => sc instanceof PlayScene && (sc.sys.isActive() || sc.sys.isPaused()));
  }

  setPaused(on) {
    const play = this.playScene();
    // Not while the level is leaving: the next level starts on its own, and a pause asked in
    // that gap was lost with the old scene, leaving PAUSED over a level that kept playing. Nor
    // once the encounter is decided: the pause screen's restart during the Hydra's fall replayed
    // the boss room with the run clock already stopped, its stars still counting.
    if (!play || this.registry.get('cutscene') || (on && (play.leaving || play.outcome)) || play.sys.isPaused() === on) return;
    // Phaser pauses a scene on its next frame; the flag holds powers off from the moment of
    // asking (a key pressed in that frame, or a hidden tab, which draws no frames, fired them).
    play.pauseAsked = on;
    if (on) play.scene.pause();
    else play.scene.resume();
    touch.dropJump(); // held thumbs carry over like held keys; a jump tapped meanwhile doesn't
    this.pausedText.setVisible(on);
    this.dim.setVisible(on);
    this.soundBox.setVisible(on && TOUCH);
    this.soundText.setVisible(on && TOUCH);
    for (const o of this.pauseButtons) o.setVisible(on);
    this.helpText.setVisible(on);
  }

  // From the pause screen: back to the start of this level with the stars it began with. The
  // run clock keeps going (a restart costs time, as a death does); in the first level it's a
  // new run on a fresh clock (run.js retryLevel). For perfecting a run.
  restartLevel() {
    const play = this.playScene();
    if (!play?.sys.isPaused()) return;
    retryLevel(this, play.scene.key);
  }

  // From the pause screen: a new run on a fresh clock, from the first level, without the title
  // screen or the intros already seen (run.js beginRun). Only while paused, as restartLevel.
  newRun() {
    const play = this.playScene();
    if (!play?.sys.isPaused()) return;
    this.scene.stop(play.scene.key);
    beginRun(this);
  }

  // From the pause screen: leave the run for the title screen, which resets the run clock
  // (Title.create).
  toTitle() {
    const play = this.playScene();
    if (!play?.sys.isPaused()) return;
    this.scene.stop(play.scene.key);
    this.scene.start('Title', {}); // {}: Phaser would hand the title its last data (a menu row)
  }

  tap(p) {
    const play = this.playScene();
    if (!play || this.registry.get('cutscene')) return;
    if (play.sys.isPaused()) {
      this.armed = PAUSE_BTNS.find((b) => hit(p, b, BTN_PAD)) ?? null;
      if (this.armed || !TOUCH) return;
      if (hit(p, SOUND_BTN, 12)) toggleMute(this.sound);
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
    const timing = settings.get('timer') && run.state === 'running';
    this.timer.setVisible(timing);
    if (timing) this.timer.setText(formatTime(run.elapsed())).setTint(run.ranked ? 0x8b8b8b : 0xe5534b);
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
    const play = this.playScene();
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
    const cta = !overflow ? null : refactorLeft > 0 ? `CONTEXT FULL → refactor ready in ${Math.ceil(refactorLeft / 1000)}s` : TOUCH ? 'CONTEXT FULL → tap "refactor"' : this.lines.full;

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
      this.soundText.setText(isMuted() ? 'sound: off' : 'sound: on');
      const idle = !voice.heard && !voice.listening && !fresh;
      let line = voice.heard ? `$ heard "${voice.heard.slice(-26)}"` : voice.listening ? '$ listening... let go to run it' : cta ? `$ ${cta}` : this.talk ? '$ tap a power, or hold talk and say it' : '$ tap a power to run it';
      if (fresh && ev.type === 'fired') line = `✓ ran: ${POWERS[ev.name].label}`;
      else if (fresh && ev.type === 'cooldown') line = `${POWERS[ev.name].label}: cooling down ${Math.ceil(ev.left / 1000)}s`;
      this.heard.setText(line).setTint(fresh && ev.type === 'fired' ? 0x3fb950 : fresh ? 0xe3b341 : idle && cta ? 0xe5534b : 0xf5f5f5);
      return;
    }

    // Left: what Shoutr Flow heard (it lapses after a moment). Right: what actually happened
    // (ran / cooling down) for ~2s, otherwise the light. Speech recognized is not the same as a
    // power firing; a power that ran on a sound-alike says so.
    const heard = voice.heard ? `heard "${voice.heard.slice(-26)}"` : (cta ?? this.lines.powers);
    this.heard.setText(`$ ${heard}`).setTint(!voice.heard && cta ? 0xe5534b : 0xf5f5f5);
    if (fresh && ev.type === 'fired') {
      this.mic.setText(`✓ ${ev.alike ? 'close enough' : 'ran'}: ${POWERS[ev.name].label}`);
      this.mic.setTint(0x3fb950);
    } else if (fresh && ev.type === 'cooldown') {
      this.mic.setText(`${POWERS[ev.name].label}: cooling down ${Math.ceil(ev.left / 1000)}s`);
      this.mic.setTint(0xe3b341);
    } else if (voice.error) {
      // Why voice stopped, in red, until it works again; the keys are the way on.
      this.mic.setText(`${voice.error}: ${powerKeys()}`);
      this.mic.setTint(0xe5534b);
    } else if (this.say === 'keys') {
      this.mic.setText('');
    } else {
      // The light: lit only while a session is really running, and white the moment a voice
      // comes in, from the mic's level. A result takes most of a second; this is what tells the
      // player they were heard, so they don't say it again. The game draws it, so it shows in
      // fullscreen, where the browser's own mark does not.
      this.mic.setText(`${voice.running ? '●' : '○'} Shoutr Flow${this.say === 'hold' ? `: hold ${this.talkKey}` : ''}`);
      this.mic.setTint(voice.speaking || voice.listening ? 0xf5f5f5 : voice.running ? 0x3fb950 : 0x8b8b8b);
    }
  }
}
