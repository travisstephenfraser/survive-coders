import Phaser from 'phaser';
import { uiText } from '../util.js';
import { applyScreenFX, setScreenFX, shake } from '../fx.js';
import { isMuted, musicVolume, setMuted, sfx as playSfx } from '../audio.js';
import { REDUCED_MOTION, settings } from '../settings.js';
import { terminalWindow } from '../terminal.js';
import { TOUCH, canFullscreen, isFullscreen, toggleFullscreen } from '../touch.js';
import { menu, textRow } from '../menu.js';

const X_LABEL = 70;
const X_VALUE = 380;
const DOTS = 10;

// The settings screen, from the title. Everything applies at once and is remembered in this
// browser (settings.js).
export default class Settings extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  create() {
    applyScreenFX(this.cameras.main);
    const win = terminalWindow(this, 'vim ~/.config/survive-coders');
    uiText(this, X_LABEL, win.y + 48, '" settings: saved in this browser', { size: 16, color: '#8b8b8b' });

    const onOff = (v) => (v ? 'on' : 'off');
    const toggle = (key, after) => () => {
      settings.set(key, !settings.get(key));
      after?.(settings.get(key));
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
    ].filter(Boolean);

    const items = rows.map((r, i) => (Array.isArray(r) ? this.row(win.y + 92 + i * 36, ...r) : r(win.y + 92 + i * 36)));
    const back = () => this.scene.start('Title', { from: 'settings' });
    items.push(textRow(this, X_LABEL, win.y + 92 + items.length * 36 + 8, 'BACK', { size: 16, onPick: back }));
    menu(this, items, { onBack: back });

    // Fullscreen can also end from outside (ESC, the browser's own button).
    const redraw = () => items.forEach((it) => it.redraw());
    document.addEventListener('fullscreenchange', redraw);
    this.events.once('shutdown', () => {
      document.removeEventListener('fullscreenchange', redraw);
      this.preview?.destroy();
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
      bounds: () => new Phaser.Geom.Rectangle(X_LABEL - 10, y - 8, 820, 32),
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
