import Phaser from 'phaser';
import { uiText } from './util.js';

// Focusable rows for the menu screens (title, settings, leaderboard). Keys: ↑↓ or W/S move,
// ←→ or A/D adjust, ENTER or SPACE pick, ESC goes back. The mouse selects on hover and picks
// on release over the row the press began on; a tap is the same press and release.
//
// Keys come from a raw window listener, not Phaser's: it runs inside the key event itself (a
// fullscreen request or a new tab needs that), and it can preventDefault exactly the keys it
// uses, so arrows and space don't scroll the page around the game when it's embedded.
//
// An item: { bounds() → Rectangle, focus(on), activate?(via), adjust?(dir), enabled?() }.
export function menu(scene, items, { onBack, start = 0 } = {}) {
  let at = -1;
  const usable = (i) => items[i] && items[i].enabled?.() !== false;

  function select(i) {
    if (i === at || !usable(i)) return;
    items[at]?.focus(false);
    at = i;
    items[at].focus(true);
  }

  function move(dir) {
    for (let step = 1; step <= items.length; step++) {
      const i = (at + dir * step + items.length) % items.length;
      if (usable(i)) return select(i);
    }
  }

  const KEYS = {
    ArrowUp: () => move(-1),
    w: () => move(-1),
    ArrowDown: () => move(1),
    s: () => move(1),
    ArrowLeft: () => items[at]?.adjust?.(-1),
    a: () => items[at]?.adjust?.(-1),
    ArrowRight: () => items[at]?.adjust?.(1),
    d: () => items[at]?.adjust?.(1),
    Enter: (e) => !e.repeat && items[at]?.activate?.('key'),
    ' ': (e) => !e.repeat && items[at]?.activate?.('key'),
    Escape: (e) => !e.repeat && onBack?.(),
  };
  const onKey = (e) => {
    // Phaser has already seen the key (and may have preventDefaulted it): don't bail on that.
    if (!scene.sys.isActive() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, select, textarea, button, a')) return;
    const act = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!act) return;
    e.preventDefault();
    act(e);
  };
  window.addEventListener('keydown', onKey);
  scene.events.once('shutdown', () => window.removeEventListener('keydown', onKey));

  // A row's own bounds first; the margin around them only where no row's bounds are hit, so
  // the margin of one row never takes a point inside its neighbour.
  const within = (p, padX, padY) =>
    items.findIndex((it, i) => usable(i) && Phaser.Geom.Rectangle.Inflate(Phaser.Geom.Rectangle.Clone(it.bounds()), padX, padY).contains(p.x, p.y));
  const hitAt = (p) => {
    const exact = within(p, 0, 0);
    return exact >= 0 ? exact : within(p, 6, 4);
  };
  let pressed = -1;
  scene.input.on('pointermove', (p) => {
    const i = hitAt(p);
    if (i >= 0) select(i);
  });
  scene.input.on('pointerdown', (p) => {
    pressed = hitAt(p);
    if (pressed >= 0) select(pressed);
  });
  scene.input.on('pointerup', (p) => {
    const i = hitAt(p);
    if (i >= 0 && i === pressed) items[i].activate?.('pointer', p);
    pressed = -1;
  });

  if (usable(start)) select(start);
  else move(1);
  return {
    select,
    get index() {
      return at;
    },
    // Re-check which rows are usable after something changed (e.g. a list finished loading).
    refresh() {
      if (!usable(at)) {
        items[at]?.focus(false);
        at = -1;
        move(1);
      }
    },
  };
}

// A menu row drawn as text: `> LABEL_` in green while selected, grey otherwise, pulsing like a
// prompt. `label` can be a function, redrawn on focus and by row.redraw().
export function textRow(scene, x, y, label, { size = 24, onPick, onAdjust, enabled } = {}) {
  const text = uiText(scene, x, y, '', { size });
  let focused = false;
  let pulse = null;
  const row = {
    text,
    bounds: () => text.getBounds(),
    enabled,
    focus(on) {
      focused = on;
      row.redraw();
      pulse?.remove();
      text.setAlpha(1);
      pulse = on ? scene.tweens.add({ targets: text, alpha: 0.55, duration: 600, yoyo: true, repeat: -1 }) : null;
    },
    redraw() {
      const s = typeof label === 'function' ? label() : label;
      text.setText(focused ? `> ${s}_` : `  ${s}`);
      text.setTint(enabled?.() === false ? 0x444c56 : focused ? 0x3fb950 : 0x8b8b8b);
    },
    activate: onPick,
    adjust: onAdjust,
  };
  row.redraw();
  return row;
}
