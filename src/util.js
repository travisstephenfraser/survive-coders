import { hex } from './palette.js';
import { FLOAT_MS, JOKE_HOLD_MS } from './pacing.js';
import { keymap } from './keymap.js';

// World scenes render at 320x180 and zoom 3x. All text is the 8x8 pixel font ('pixel',
// built in Boot from the Ninja Adventure sheet); sizes snap to whole font pixels so glyphs
// stay crisp: UI text at 8/16/24/32px, world text at 2 screen px per font pixel.
export const ZOOM = 3;
export const TILE = 16;
export const MAX_HP = 5;
export const MAX_TOKENS = 160; // MAX power-up budget: one token per streamed character
export const FONT_KEY = 'pixel';

const WORLD_SMALL = 16 / ZOOM; // 2 screen px per font pixel
const WORLD_BIG = 32 / ZOOM; // 4 screen px per font pixel

function bitmap(scene, x, y, str, size, color) {
  const t = scene.add.bitmapText(x, y, FONT_KEY, str, size);
  t.setTint(hex(color));
  return t;
}

// Optional background box: returns a container of [box, text] positioned by origin.
function boxed(scene, x, y, text, bg, ox, oy, pad) {
  const w = text.width + pad * 2;
  const h = text.height + pad * 2;
  const box = scene.add.rectangle(0, 0, w, h, hex(bg));
  text.setOrigin(0.5).setPosition(0, 0);
  const c = scene.add.container(x + (0.5 - ox) * w, y + (0.5 - oy) * h, [box, text]);
  c.textObj = text;
  return c;
}

export function worldText(scene, x, y, str, opts = {}) {
  const size = opts.tiny ? 8 / ZOOM : (opts.size ?? 6) >= 12 ? WORLD_BIG : WORLD_SMALL;
  const t = bitmap(scene, x, y, str, size, opts.color ?? '#f5f5f5');
  const ox = opts.ox ?? 0.5;
  const oy = opts.oy ?? 0.5;
  const obj = opts.bg ? boxed(scene, x, y, t, opts.bg, ox, oy, 2) : t.setOrigin(ox, oy);
  if (opts.depth !== undefined) obj.setDepth(opts.depth);
  return obj;
}

// Text that rises and fades over the world. `hold` keeps it still and solid first.
function rise(scene, x, y, str, color, hold) {
  const t = worldText(scene, x, y, str, { color, depth: 50 });
  scene.tweens.add({ targets: t, y: y - 18, alpha: 0, delay: hold, duration: FLOAT_MS, onComplete: () => t.destroy() });
  return t;
}

// A status pop (+1★, GONG!, context +25%): quick, gone in FLOAT_MS.
export function floatText(scene, x, y, str, color = '#f5f5f5') {
  return rise(scene, x, y, str, color, 0);
}

// A joke (a kill line, an enemy's bark): it holds still for JOKE_HOLD_MS before the same rise
// and fade, 1.5x as long in all, so it can be read mid-fight.
export function jokeText(scene, x, y, str, color = '#f5f5f5') {
  return rise(scene, x, y, str, color, JOKE_HOLD_MS);
}

// Screen-space text; size snaps to a multiple of 8 (8 = 1x font).
export function uiText(scene, x, y, str, opts = {}) {
  const size = Math.max(8, Math.round((opts.size ?? 16) / 8) * 8);
  const t = bitmap(scene, x, y, str, size, opts.color ?? '#f5f5f5');
  if (opts.lineSpacing) t.setLineSpacing(opts.lineSpacing);
  if (opts.wrap) t.setMaxWidth(opts.wrap);
  const ox = opts.ox ?? 0;
  const oy = opts.oy ?? 0;
  if (opts.bg) return boxed(scene, x, y, t, opts.bg, ox, oy, opts.pad ?? 6);
  return t.setOrigin(ox, oy);
}

export const params = new URLSearchParams(window.location.search);

// Phaser replays a frame's queued key events each time another one arrives, so with three in
// one frame an earlier keydown fires again after its DOM dispatch is over (eventPhase 0).
// Toggles wrap their handler in this so a replay can't flip them back.
export const freshKey = (fn) => (e) => {
  if (e?.eventPhase !== 0) fn(e);
};

// The Phaser keys for an action, as the controls screen has them set (keymap.js): made when a
// level starts, since the map only changes between runs. An unbound action has none.
export const actionKeys = (scene, action) => keymap.codes(action).map((code) => scene.input.keyboard.addKey(code));

// Whether any of an action's keys is down.
export const held = (keys) => keys.some((k) => k.isDown);

// An action's keydown in this scene, for the actions that are a press (pause, mute), not a hold.
export const onAction = (scene, action, fn) => scene.input.keyboard.on('keydown', freshKey((e) => keymap.has(action, e.keyCode) && fn(e)));
