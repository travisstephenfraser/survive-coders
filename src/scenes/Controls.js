import Phaser from 'phaser';
import { uiText } from '../util.js';
import { applyScreenFX } from '../fx.js';
import { ACTIONS, LABELS, keyName, keymap } from '../keymap.js';
import { terminalWindow } from '../terminal.js';
import { menu, textRow } from '../menu.js';

const X_LABEL = 70;
const X_VALUE = 380;
const ROW_Y = 76; // the first action's line, from the window's top
const ROW_H = 24;
const GREY = 0x8b8b8b;

// A refused key's name for the status line, in characters the font has ("Enter" → ENTER).
const spoken = (key) => (/^[ -~]+$/.test(key) ? key.toUpperCase() : 'that key');

// The controls screen, from Settings, on keyboards only. ENTER or a click on an action, then a
// key, makes that key the action's one key; a key another action had is taken from it. The map
// applies from the next level started and is remembered in this browser (keymap.js).
export default class Controls extends Phaser.Scene {
  constructor() {
    super('Controls');
  }

  create() {
    applyScreenFX(this.cameras.main);
    const win = terminalWindow(this, 'vim ~/.config/survive-coders/keys');
    uiText(this, X_LABEL, win.y + 48, '" controls: saved in this browser', { size: 16, color: '#8b8b8b' });
    this.capturing = null; // the action waiting for a key
    this.rows = ACTIONS.map((action, i) => this.row(win.y + ROW_Y + i * ROW_H, action));
    const below = win.y + ROW_Y + ACTIONS.length * ROW_H + 4;
    // What the last key did, beside RESET ALL.
    this.note = uiText(this, X_VALUE, below, '', { size: 16, color: '#e3b341' });
    const back = () => this.scene.start('Settings', { from: 'controls' });
    const items = [
      ...this.rows,
      textRow(this, X_LABEL, below, 'RESET ALL', { size: 16, onPick: () => this.resetAll() }),
      textRow(this, X_LABEL, below + ROW_H, 'BACK', { size: 16, onPick: back }),
    ];
    uiText(this, X_LABEL, win.y + win.h - 28, '↑↓ choose   ENTER rebind   BACKSPACE default   ESC back', { size: 16, color: '#8b8b8b' });

    // In the capture phase, so while an action waits for a key this listener sees the key
    // before any other on the window and stops it there: the menu (ESC would leave, SPACE
    // would pick), Phaser, and the voice keys (M would open the microphone) never get it.
    const onKey = (e) => this.onKey(e);
    window.addEventListener('keydown', onKey, true);
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey, true));
    this.menu = menu(this, items, { onBack: back });
  }

  // An action's line: `> label` on the left, its keys on the right (`press a key_` while it
  // waits for one, `unbound` in red when it has none).
  row(y, action) {
    const name = uiText(this, X_LABEL, y, '', { size: 16 });
    const val = uiText(this, X_VALUE, y, '', { size: 16 });
    let focused = false;
    const row = {
      action,
      bounds: () => new Phaser.Geom.Rectangle(X_LABEL - 10, y - 4, 820, ROW_H),
      focus: (on) => {
        focused = on;
        row.redraw();
      },
      redraw: () => {
        const waiting = this.capturing === action;
        const bound = keymap.codes(action).length > 0;
        name.setText(`${focused ? '>' : ' '} ${LABELS[action]}`).setTint(focused ? 0x3fb950 : GREY);
        val.setText(waiting ? 'press a key_' : bound ? keymap.names(action, '  ') : 'unbound');
        val.setTint(waiting ? 0xe3b341 : !bound ? 0xe5534b : focused ? 0xf5f5f5 : GREY);
      },
      activate: () => this.capture(action),
    };
    row.redraw();
    return row;
  }

  // Start waiting for `action`'s key (or stop waiting, with null).
  capture(action) {
    this.capturing = action;
    this.say('');
  }

  // Every row is redrawn: a bind or a reset can change another action's keys too.
  say(text) {
    this.note.setText(text);
    for (const row of this.rows) row.redraw();
  }

  resetAll() {
    keymap.reset();
    this.capturing = null;
    this.say('defaults restored');
  }

  onKey(e) {
    // Ctrl, Alt and Meta combinations stay the browser's (reload, close), and can't be bound.
    if (!this.sys.isActive() || e.metaKey || e.ctrlKey || e.altKey) return;
    const action = this.capturing;
    if (!action) {
      // BACKSPACE (or DELETE) on an action puts its defaults back.
      const row = this.rows[this.menu.index];
      if (row && !e.repeat && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        keymap.reset(row.action);
        this.say(`${LABELS[row.action]}: defaults`);
      }
      return;
    }
    e.stopImmediatePropagation();
    if (!/^F\d+$/.test(e.key)) e.preventDefault(); // the F-keys stay the browser's too
    if (e.repeat) return; // the ENTER that began the capture, still held
    if (e.key === 'Escape') return this.capture(null);
    const bound = keymap.bind(action, e.keyCode);
    if (!bound) return this.say(`${spoken(e.key)} can't be bound`); // still waiting
    this.capturing = null;
    this.say(bound.from ? `${keyName(e.keyCode)}: taken from ${LABELS[bound.from]}` : '');
  }
}
