import Phaser from 'phaser';
import { uiText } from '../util.js';
import { applyScreenFX, setScreenFX, shake } from '../fx.js';
import { isMuted, musicVolume, setMuted, sfx as playSfx } from '../audio.js';
import { MIC_MODES, REDUCED_MOTION, micCheck, settings } from '../settings.js';
import { voice } from '../voice.js';
import { terminalWindow } from '../terminal.js';
import { TOUCH, canFullscreen, isFullscreen, toggleFullscreen } from '../touch.js';
import { menu, textRow } from '../menu.js';
import { keymap } from '../keymap.js';

const X_LABEL = 70;
const X_VALUE = 380;
const DOTS = 10;
// On a keyboard: eleven rows and BACK, above the hint. A phone has fewer rows and keeps the
// pitch, the tap targets and the gaps between them that it had.
const ROW_H = TOUCH ? 36 : 30;
const ROW_HIT = TOUCH ? { up: 8, h: 32 } : { up: 7, h: ROW_H };

// The settings screen, from the title. Everything applies at once and is remembered in this
// browser (settings.js); the controls row opens the key map's own screen (Controls.js).
export default class Settings extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  create(data) {
    // Phaser keeps a scene's last data when it's started with none, so a later visit from the
    // title would open on the controls row again: take it and clear it.
    const from = data?.from;
    this.sys.settings.data = {};
    applyScreenFX(this.cameras.main);
    const win = terminalWindow(this, 'vim ~/.config/survive-coders');
    uiText(this, X_LABEL, win.y + 48, '" settings: saved in this browser', { size: 16, color: '#8b8b8b' });

    const onOff = (v) => (v ? 'on' : 'off');
    const toggle = (key, after) => () => {
      settings.set(key, !settings.get(key));
      after?.(settings.get(key));
    };
    // Shoutr Flow: how the mic listens on a keyboard. Where the browser can't recognise speech
    // on the device there is nothing to choose.
    const micPossible = voice.onDevice && voice.local !== 'unavailable';
    const micValue = () =>
      micPossible ? { open: 'open: say it, no key', hold: `hold ${keymap.name('talk')} to talk`, off: 'off: keys only' }[settings.get('mic')] : 'needs Chrome on a computer';
    const micStep = (dir = 1) => {
      if (!micPossible) return;
      const at = MIC_MODES.indexOf(settings.get('mic'));
      settings.set('mic', MIC_MODES[(at + dir + MIC_MODES.length) % MIC_MODES.length]);
    };
    const rows = [
      this.volumeRow('music volume', 'music', () => this.previewMusic()),
      this.volumeRow('sfx volume', 'sfx', () => playSfx(this, 'star', 0.5)),
      ['sound', () => (isMuted() ? 'muted' : 'on'), () => setMuted(this.sound, !isMuted())],
      ['crt filter', () => onOff(settings.get('crt')), toggle('crt', (on) => setScreenFX(this.cameras.main, on))],
      ['screen shake', () => onOff(settings.get('shake')), toggle('shake', (on) => on && shake(this.cameras.main, 200, 0.006))],
      ['flashes', () => onOff(settings.get('flash')), toggle('flash')],
      canFullscreen() && ['fullscreen', () => onOff(isFullscreen()), () => toggleFullscreen()],
      ['run timer', () => (settings.get('timer') ? 'shown' : 'hidden'), toggle('timer')],
      !TOUCH && ['Shoutr Flow', micValue, () => micStep(1), micStep],
      !TOUCH && micPossible && ['test microphone', () => (micCheck.passed() ? 'passed ✓' : 'not set up'), () => this.scene.start('MicCheck', { then: 'settings' }), () => {}],
      !TOUCH && ['controls', () => (keymap.isDefault() ? 'default keys' : 'custom keys'), () => this.scene.start('Controls'), () => {}],
    ].filter(Boolean);

    const items = rows.map((r, i) => (Array.isArray(r) ? this.row(win.y + 92 + i * ROW_H, ...r) : r(win.y + 92 + i * ROW_H)));
    const back = () => this.scene.start('Title', { from: 'settings' });
    items.push(textRow(this, X_LABEL, win.y + 92 + items.length * ROW_H + 2, 'BACK', { size: 16, onPick: back }));
    // Back from the controls screen or the mic check: on the row that opened it.
    const opened = { controls: 'controls', mic: 'test microphone' }[from];
    menu(this, items, { onBack: back, start: opened ? rows.findIndex((r) => r[0] === opened) : 0 });

    // Fullscreen can also end from outside (ESC, the browser's own button).
    const redraw = () => items.forEach((it) => it.redraw());
    document.addEventListener('fullscreenchange', redraw);
    this.events.once('shutdown', () => {
      document.removeEventListener('fullscreenchange', redraw);
      // Phaser reuses this scene object: a destroyed preview left here breaks the next visit.
      this.preview?.destroy();
      this.preview = null;
    });

    const hint = TOUCH ? 'tap a setting to change it' : '↑↓ choose   ←→ change   ENTER toggle   ESC back';
    uiText(this, X_LABEL, win.y + win.h - 34, hint, { size: 16, color: '#8b8b8b' });
    if (REDUCED_MOTION) {
      uiText(this, X_LABEL, win.y + win.h - 12, 'shake and flashes start off: your system asks for reduced motion', { size: 8, color: '#8b8b8b' });
    }
  }

  // A settings line: `> label` on the left, its value on the right. `pick` runs on ENTER, a
  // click or a tap; `adjust` on ←/→ (default: the same as pick, so ←→ flip toggles too).
  row(y, label, value, pick, adjust = () => pick()) {
    const name = uiText(this, X_LABEL, y, '', { size: 16 });
    const val = uiText(this, X_VALUE, y, '', { size: 16 });
    let focused = false;
    const row = {
      val,
      bounds: () => new Phaser.Geom.Rectangle(X_LABEL - 10, y - ROW_HIT.up, 820, ROW_HIT.h),
      focus(on) {
        focused = on;
        row.redraw();
      },
      redraw() {
        name.setText(`${focused ? '>' : ' '} ${label}`).setTint(focused ? 0x3fb950 : 0x8b8b8b);
        val.setText(value()).setTint(focused ? 0xf5f5f5 : 0x8b8b8b);
      },
      activate(via, p) {
        pick(via, p);
        row.redraw();
      },
      adjust(dir) {
        adjust(dir);
        row.redraw();
      },
    };
    row.redraw();
    return row;
  }

  // Volume as ten dots: ←→ step it, ENTER steps up (wrapping to silent), a tap on the dots sets it.
  volumeRow(label, key, feedback) {
    return (y) => {
      const set = (v) => {
        settings.set(key, v);
        feedback();
      };
      const value = () => {
        const n = Math.round(settings.get(key) * DOTS);
        return `${'●'.repeat(n)}${'○'.repeat(DOTS - n)}  ${n * 10}%`;
      };
      const row = this.row(
        y,
        label,
        value,
        (via, p) => {
          const dotsW = this.dotsWidth();
          if (via === 'pointer' && p.x >= X_VALUE && p.x <= X_VALUE + dotsW) set(Math.ceil(((p.x - X_VALUE) / dotsW) * DOTS) / DOTS);
          else set(settings.get(key) >= 1 ? 0 : settings.get(key) + 1 / DOTS);
        },
        (dir) => set(Math.min(1, Math.max(0, settings.get(key) + dir / DOTS))),
      );
      return row;
    };
  }

  dotsWidth() {
    if (!this.dotsW) {
      const probe = uiText(this, 0, 0, '●'.repeat(DOTS), { size: 16 });
      this.dotsW = probe.width;
      probe.destroy();
    }
    return this.dotsW;
  }

  // A few seconds of the city's song at the chosen level, restarted by each change.
  previewMusic() {
    if (!this.cache.audio.exists('music_level')) return;
    if (!this.preview) {
      this.preview = this.sound.add('music_level', { volume: musicVolume(0.28) });
      this.preview.play();
    }
    this.preview.setVolume(musicVolume(0.28));
    this.previewStop?.remove();
    this.previewStop = this.time.delayedCall(2500, () => {
      this.preview?.destroy();
      this.preview = null;
    });
  }
}
