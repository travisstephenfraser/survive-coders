import { FONT } from './palette.js';

// World scenes render at 320x180 and zoom 3x; text is drawn at 3x size and scaled
// down so it stays crisp instead of being upscaled from a tiny bitmap.
export const ZOOM = 3;
export const TILE = 16;
export const MAX_HP = 5;

export function worldText(scene, x, y, str, opts = {}) {
  const size = opts.size ?? 8;
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: `${size * ZOOM}px`,
    color: opts.color ?? '#f5f5f5',
    backgroundColor: opts.bg,
    padding: opts.bg ? { x: 2 * ZOOM, y: 1 * ZOOM } : undefined,
    align: 'center',
  });
  t.setScale(1 / ZOOM).setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5);
  if (opts.depth !== undefined) t.setDepth(opts.depth);
  return t;
}

export function floatText(scene, x, y, str, color = '#f5f5f5', size = 7) {
  const t = worldText(scene, x, y, str, { color, size, depth: 50 });
  scene.tweens.add({ targets: t, y: y - 18, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  return t;
}

export function uiText(scene, x, y, str, opts = {}) {
  return scene.add
    .text(x, y, str, {
      fontFamily: FONT,
      fontSize: `${opts.size ?? 24}px`,
      color: opts.color ?? '#f5f5f5',
      backgroundColor: opts.bg,
      padding: opts.pad,
      align: opts.align ?? 'left',
      wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
    })
    .setOrigin(opts.ox ?? 0, opts.oy ?? 0);
}

export const params = new URLSearchParams(window.location.search);
