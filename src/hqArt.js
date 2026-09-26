// Procedural pixel art for the Anthropic HQ arena (warm wood slats, the white fluted
// ANTHROPIC wall, SF window views, Dario's Furbies) plus the Powell St cable car.
// Everything is integer fillRects so it stays crisp under pixelArt scaling.

function rng(seed) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Bresenham so thin structures (legs, poles) are exactly one pixel.
function line(ctx, x0, y0, x1, y1, color) {
  ctx.fillStyle = color;
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// Scanline fills: no canvas paths, so no antialiased edges.
function fillEllipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const half = ry === 0 ? rx : Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
  }
}

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  const ys = pts.map((p) => p[1]);
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  for (let y = minY; y < maxY; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(xs[k]);
      const xb = Math.round(xs[k + 1]);
      if (xb > xa) ctx.fillRect(xa, y, xb - xa, 1);
    }
  }
}

// Paint a pixel map: each char looks up a color in `pal`; '.' or unknown = transparent.
function paint(ctx, rows, ox, oy, pal) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (c) rect(ctx, ox + x, oy + y, 1, 1, c);
    }
  });
}

const toRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
};
const step = (t, n = 10) => Math.round(t * n) / n; // quantize light so it bands like pixel art

// Blend pixels toward `color` by fn(x, y) in [0, 1] (quantized). Keeps every pixel opaque.
function light(ctx, x0, y0, x1, y1, color, fn) {
  const w = x1 - x0;
  const h = y1 - y0;
  const img = ctx.getImageData(x0, y0, w, h);
  const d = img.data;
  const [lr, lg, lb] = toRgb(color);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = fn(x0 + x, y0 + y);
      if (t <= 0) continue;
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;
      d[i] += (lr - d[i]) * t;
      d[i + 1] += (lg - d[i + 1]) * t;
      d[i + 2] += (lb - d[i + 2]) * t;
    }
  }
  ctx.putImageData(img, x0, y0);
}

// Canvas-drawn alpha is binary after this, matching backdrops.js.
function hardenAlpha(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
}

const ORANGE = '#d97757';
const WARM = '#ffd9a0';

// ---------------------------------------------------------------------------------------------
// hq_wall 320x192: ceiling + spotlights, wood slat walls, fluted ANTHROPIC feature wall
// (x 40..200, y 40..156, letters y 50..57), tall SF window behind the Hydra (x 216..302).

const GLYPHS = {
  A: ['.####.', '##..##', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
  N: ['##..##', '###.##', '###.##', '######', '##.###', '##.###', '##..##', '##..##'],
  T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  H: ['##..##', '##..##', '##..##', '######', '######', '##..##', '##..##', '##..##'],
  R: ['#####.', '##..##', '##..##', '#####.', '####..', '##.##.', '##..##', '##..##'],
  O: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  P: ['#####.', '##..##', '##..##', '##..##', '#####.', '##....', '##....', '##....'],
  I: ['##', '##', '##', '##', '##', '##', '##', '##'],
  C: ['.####.', '##..##', '##....', '##....', '##....', '##....', '##..##', '.####.'],
};

function blockText(ctx, str, x, y, color) {
  let cx = x;
  for (const ch of str) {
    const g = GLYPHS[ch];
    paint(ctx, g, cx, y, { '#': color });
    cx += g[0].length + 2;
  }
}

function textWidth(str) {
  return [...str].reduce((w, ch) => w + GLYPHS[ch][0].length + 2, -2);
}

const SLATS = ['#5e3b21', '#6b4426', '#65401f', '#724828', '#6b4426', '#5a381f'];
const SPOTS = [28, 64, 100, 136, 172, 208, 238, 268, 296];
const FEATURE = { x0: 40, x1: 200, y0: 40, y1: 156, r: 9 };
const WIN = { x0: 216, x1: 302, y0: 32, y1: 148 };

export function drawHQWall(ctx) {
  const W = 320;
  const r = rng(2024);

  // Wood slat wall: 3px slats with a 1px shadow gap, lit left edge.
  for (let x = 0; x < W; x++) {
    const s = Math.floor(x / 4);
    const k = x % 4;
    const tone = SLATS[(s * 7 + (s >> 2)) % SLATS.length];
    const c = k === 3 ? '#2b1b10' : k === 0 ? mix(tone, '#a8703e', 0.3) : tone;
    rect(ctx, x, 24, 1, 136, c);
  }
  for (let i = 0; i < 700; i++) {
    const x = Math.floor(r() * W);
    if (x % 4 === 3) continue;
    rect(ctx, x, 24 + Math.floor(r() * 130), 1, 1 + Math.floor(r() * 3), '#4f3119');
  }

  // Concrete ribbed ceiling.
  rect(ctx, 0, 0, W, 24, '#2c2926');
  for (let y = 1; y < 21; y += 5) {
    rect(ctx, 0, y, W, 2, '#37332f');
    rect(ctx, 0, y + 2, W, 1, '#221f1c');
  }
  rect(ctx, 0, 21, W, 3, '#1c1916');

  // Floor band (normally hidden under tiles) + baseboard with a Claude-orange accent strip.
  rect(ctx, 0, 160, W, 32, '#1a1410');
  rect(ctx, 0, 154, W, 6, '#221710');
  rect(ctx, 0, 154, W, 1, ORANGE);

  // Tall window with a dusky SF view, behind the Hydra.
  const { x0: wx0, x1: wx1, y0: wy0, y1: wy1 } = WIN;
  for (let y = wy0; y < wy1; y++) {
    const t = Math.floor((y - wy0) / 4) * 4 / (wy1 - wy0);
    const c = t < 0.4 ? mix('#1b2136', '#2e3350', t / 0.4) : t < 0.75 ? mix('#2e3350', '#58435a', (t - 0.4) / 0.35) : mix('#58435a', '#7a5048', (t - 0.75) / 0.25);
    rect(ctx, wx0, y, wx1 - wx0, 1, c);
  }
  // Salesforce-style tower with a Claude-orange crown.
  rect(ctx, 262, 50, 14, wy1 - 50, '#2c3246');
  fillEllipse(ctx, 268, 50, 6, 5, '#2c3246');
  for (let y = 46; y < 56; y += 2) for (let x = 263; x < 275; x += 2) if (r() < 0.6) rect(ctx, x, y, 1, 1, r() < 0.7 ? ORANGE : '#f5d0a0');
  let bx = wx0;
  while (bx < wx1) {
    const bw = 6 + Math.floor(r() * 10);
    const bh = 26 + Math.floor(r() * 64);
    const top = wy1 - bh;
    const w = Math.min(bw, wx1 - bx);
    if (!(bx < 276 && bx + w > 262 && top < 50)) {
      rect(ctx, bx, top, w, bh, ['#232838', '#2a3042', '#313849'][Math.floor(r() * 3)]);
      for (let yy = top + 3; yy < wy1 - 2; yy += 4) {
        for (let xx = bx + 1; xx < bx + w - 1; xx += 2) if (r() < 0.3) rect(ctx, xx, yy, 1, 2, r() < 0.7 ? '#e8c078' : '#9fb8d0');
      }
    }
    bx += bw;
  }
  // Glass reflections.
  light(ctx, wx0, wy0, wx1, wy1, '#9aa6c0', (x, y) => {
    const d = (x - wx0) + (y - wy0) * 0.6;
    return d % 46 < 3 ? 0.18 : d % 46 < 5 ? 0.08 : 0;
  });
  // Frame, mullions, transom, sill.
  rect(ctx, wx0 - 2, wy0 - 2, wx1 - wx0 + 4, 2, '#1f1812');
  rect(ctx, wx0 - 2, wy0, 2, wy1 - wy0, '#1f1812');
  rect(ctx, wx1, wy0, 2, wy1 - wy0, '#1f1812');
  for (const mx of [236, 257, 279]) rect(ctx, mx, wy0, 2, wy1 - wy0, '#1f1812');
  rect(ctx, wx0, 74, wx1 - wx0, 2, '#1f1812');
  rect(ctx, wx0 - 3, wy1, wx1 - wx0 + 6, 3, '#8a5a32');
  rect(ctx, wx0 - 3, wy1, wx1 - wx0 + 6, 1, '#a8703e');
  rect(ctx, wx0 - 3, wy1 + 3, wx1 - wx0 + 6, 1, '#3a2616');

  // White fluted feature wall with rounded top corners and an uplight at its base.
  const { x0: fx0, x1: fx1, y0: fy0, y1: fy1, r: R } = FEATURE;
  const PLEAT = ['#aaa194', '#988f82', '#988f82', '#7f766a', '#665e54'];
  for (let y = fy0; y < fy1; y++) {
    for (let x = fx0; x < fx1; x++) {
      const cy = fy0 + R;
      if (y < cy) {
        const cxL = fx0 + R;
        const cxR = fx1 - 1 - R;
        if (x < cxL && (x - cxL) ** 2 + (y - cy) ** 2 > R * R) continue;
        if (x > cxR && (x - cxR) ** 2 + (y - cy) ** 2 > R * R) continue;
      }
      let c = PLEAT[(x - fx0) % 5];
      const up = y > fy1 - 34 ? ((y - (fy1 - 34)) / 34) ** 1.6 : 0;
      const top = y < fy0 + 18 ? 1 - (y - fy0) / 18 : 0;
      if (up > 0) c = mix(c, '#f2cf9a', step(up * 0.75));
      if (top > 0) c = mix(c, '#3a332c', step(top * 0.3));
      rect(ctx, x, y, 1, 1, c);
    }
  }
  // Plinth + uplight strip.
  rect(ctx, fx0 - 2, fy1, fx1 - fx0 + 4, 4, '#2a2019');
  rect(ctx, fx0, fy1, fx1 - fx0, 1, WARM);
  // ANTHROPIC in black block capitals with a soft drop shadow.
  const tw = textWidth('ANTHROPIC');
  const tx = Math.round((fx0 + fx1) / 2 - tw / 2);
  blockText(ctx, 'ANTHROPIC', tx + 1, 51, '#6a6155');
  blockText(ctx, 'ANTHROPIC', tx, 50, '#141210');

  // Ceiling track + spotlight cans with warm cones (skipped over the window glass).
  rect(ctx, 16, 25, 288, 1, '#151311');
  for (const sx of SPOTS) {
    rect(ctx, sx - 1, 26, 3, 1, '#151311');
    rect(ctx, sx - 2, 27, 5, 4, '#1b1917');
    rect(ctx, sx - 2, 27, 1, 4, '#3a3530');
    rect(ctx, sx + 2, 28, 1, 1, ORANGE);
    rect(ctx, sx - 1, 31, 3, 1, '#ffe0a8');
  }
  light(ctx, 0, 32, W, 104, WARM, (x, y) => {
    if (x >= wx0 - 2 && x < wx1 + 2 && y < wy1) return 0;
    let t = 0;
    for (const sx of SPOTS) {
      const dy = y - 32;
      const half = 1 + dy * 0.32;
      const dx = Math.abs(x - sx);
      if (dx > half) continue;
      const edge = 1 - dx / (half + 1);
      t = Math.max(t, 0.3 * (1 - dy / 72) * (0.45 + 0.55 * edge));
    }
    return step(t, 20);
  });

  // Vertical light-bar sconces on the wood, with a halo.
  for (const sx of [26, 208]) {
    light(ctx, sx - 7, 55, sx + 9, 89, WARM, (x, y) => {
      const dx = Math.max(0, Math.abs(x - (sx + 0.5)) - 1);
      const dy = Math.max(0, y < 62 ? 62 - y : y > 81 ? y - 81 : 0);
      const d = Math.hypot(dx, dy);
      return d > 6 ? 0 : step(0.4 * (1 - d / 6));
    });
    rect(ctx, sx, 61, 2, 1, '#2a2622');
    rect(ctx, sx, 62, 2, 20, '#ffe9c0');
    rect(ctx, sx, 82, 2, 1, '#2a2622');
  }
}

// ---------------------------------------------------------------------------------------------
// Furbies (Dario's office): 32x16 sheets, frame 0 eyes open, frame 1 blink. Feet on row 15.

const FURBY_OPEN = [
  '.T............T.',
  '.TT..........TT.',
  '..MI........IM..',
  '..MIM......MIM..',
  '...MMMTTTTMMM...',
  '..MMMMMMMMMMMM..',
  '.MMEEEMMMMEEEMM.',
  '.MEEKKEMMEKKEEM.',
  '.MEEKKEMMEKKEEM.',
  '.MMEEEMBBMEEEMM.',
  'SMMMMMMbbMMMMMMS',
  'SMMLLLLLLLLLLMMS',
  'SMLLLLLLLLLLLLMS',
  '.SMLLLLLLLLLLMS.',
  '..SSMMMMMMMMSS..',
  '...FF......FF...',
];
const FURBY_BLINK = [
  ...FURBY_OPEN.slice(0, 6),
  '.MMMMMMMMMMMMMM.',
  '.MMSSSMMMMSSSMM.',
  '.MMTTTMMMMTTTMM.',
  '.MMMMMMBBMMMMMM.',
  ...FURBY_OPEN.slice(10),
];

const FURBY_COMMON = { E: '#f5f5f5', K: '#141414', B: '#f3a03a', b: '#c2701a', F: '#f3a03a' };
const FURBY_PAL = {
  pink: { M: '#e27aa9', S: '#b3588a', L: '#f6cadb', T: '#8b3a66', I: '#f7a8c8' },
  teal: { M: '#3fb8b1', S: '#2a8984', L: '#c4ece7', T: '#1f5c59', I: '#8fe0da' },
  gold: { M: '#e3b341', S: '#b3862a', L: '#f7e5b5', T: '#7a5a18', I: '#f5d27a' },
};

function furby(colors) {
  const pal = { ...FURBY_COMMON, ...colors };
  return (ctx) => {
    paint(ctx, FURBY_OPEN, 0, 0, pal);
    paint(ctx, FURBY_BLINK, 16, 0, pal);
  };
}

export const drawFurbyPink = furby(FURBY_PAL.pink);
export const drawFurbyTeal = furby(FURBY_PAL.teal);
export const drawFurbyGold = furby(FURBY_PAL.gold);

// ---------------------------------------------------------------------------------------------
// Props. All bottom-anchored: the lowest opaque row is where they touch the floor/shelf.

// Red Saarinen womb chair, three-quarter view facing right, ~18px tall (y 14..31).
export function drawWombChair(ctx) {
  const chrome = '#c9ccd0';
  const chromeD = '#7d8186';
  line(ctx, 10, 25, 7, 31, chromeD);
  line(ctx, 16, 26, 16, 31, chromeD);
  line(ctx, 22, 25, 26, 31, chrome);
  line(ctx, 9, 27, 24, 27, chromeD);
  for (const x of [6, 15, 26]) rect(ctx, x, 31, 2, 1, '#3a3a3a');
  fillEllipse(ctx, 16, 20, 11, 7, '#7a1c1a');
  fillEllipse(ctx, 16, 19, 10, 6, '#b8322c');
  fillEllipse(ctx, 18, 18, 7, 4, '#5e1614');
  fillEllipse(ctx, 13, 18, 3, 4, '#a52b27');
  fillEllipse(ctx, 19, 22, 6, 1, '#d6463d');
  rect(ctx, 11, 24, 14, 1, '#8e2522');
  // Rim highlight along the top-left of the shell.
  for (const [x, y] of [[8, 16], [9, 15], [10, 14], [11, 14], [12, 13], [13, 13], [14, 13], [15, 13], [7, 17], [7, 18]]) rect(ctx, x, y, 1, 1, '#e36052');
}

// Warm wood built-in shelving, 4 compartments of books + a few objects.
export function drawBookshelf(ctx) {
  const r = rng(77);
  rect(ctx, 0, 0, 32, 48, '#6b4426');
  rect(ctx, 2, 2, 28, 43, '#3e2716');
  rect(ctx, 0, 0, 32, 1, '#a8703e');
  rect(ctx, 0, 0, 1, 48, '#8a5a32');
  const shelves = [12, 24, 36];
  for (const y of shelves) {
    rect(ctx, 2, y, 28, 2, '#8a5a32');
    rect(ctx, 2, y, 28, 1, '#a8703e');
  }
  rect(ctx, 0, 45, 32, 3, '#4a2e1a');
  const SPINES = ['#b83a2e', '#2e5a8a', '#d8a040', '#3a7a4a', '#e8d8b0', '#7a3a6a', ORANGE, '#1f2f4a', '#c8c0b0', '#8a2a2a'];
  const bays = [[2, 11], [14, 23], [26, 35], [38, 44]];
  bays.forEach(([top, bottom], bay) => {
    let x = 3;
    const stop = bay === 1 ? 20 : bay === 3 ? 22 : 29;
    while (x < stop) {
      const w = 1 + Math.floor(r() * 2);
      const h = Math.min(bottom - top, 6 + Math.floor(r() * 4));
      const c = SPINES[Math.floor(r() * SPINES.length)];
      rect(ctx, x, bottom - h + 1, w, h, c);
      if (h > 6) rect(ctx, x, bottom - h + 3, w, 1, mix(c, '#ffffff', 0.3));
      x += w + (r() < 0.25 ? 1 : 0);
    }
    if (bay === 1) {
      // Framed picture.
      rect(ctx, 22, 15, 7, 7, '#e8e2d6');
      rect(ctx, 23, 16, 5, 5, '#2a2622');
      rect(ctx, 24, 18, 3, 2, ORANGE);
    }
    if (bay === 3) {
      // Tiny potted plant.
      rect(ctx, 24, 41, 4, 3, '#d8d0c0');
      rect(ctx, 23, 38, 2, 2, '#3f7a36');
      rect(ctx, 26, 37, 2, 3, '#5a9a48');
      rect(ctx, 25, 39, 1, 2, '#2f5a2a');
    }
  });
}

// Potted fiddle-leaf fig, pot on rows 24..31.
export function drawPlant(ctx) {
  line(ctx, 8, 24, 8, 8, '#5a3a22');
  line(ctx, 8, 14, 11, 10, '#5a3a22');
  line(ctx, 8, 18, 5, 14, '#5a3a22');
  const leaves = [[5, 4, 1], [10, 3, 0], [4, 10, 1], [12, 8, 0], [5, 16, 1], [11, 14, 0], [8, 1, 0], [3, 20, 1], [12, 19, 0]];
  for (const [x, y, flip] of leaves) {
    fillEllipse(ctx, x, y + 2, 2, 3, '#2f5a2a');
    fillEllipse(ctx, x + (flip ? -0 : 0), y + 1, 2, 2, '#3f7a36');
    rect(ctx, x - 1 + (flip ? 0 : 1), y, 1, 2, '#5a9a48');
  }
  rect(ctx, 4, 24, 9, 2, '#e2dacb');
  rect(ctx, 5, 26, 7, 5, '#d8d0c0');
  rect(ctx, 10, 26, 2, 5, '#b0a898');
  rect(ctx, 5, 31, 7, 1, '#8a8274');
}

// Dark round meeting table (side view) with three black mugs; floor contact on row 23.
export function drawRoundTable(ctx) {
  fillEllipse(ctx, 24, 13, 22, 2, '#3a2e25');
  rect(ctx, 3, 13, 42, 1, '#5a4636');
  for (let x = 4; x < 44; x++) rect(ctx, x, 11, 1, 1, x % 3 === 0 ? '#6e5642' : '#4a3a2e');
  rect(ctx, 2, 14, 44, 2, '#1c1612');
  rect(ctx, 22, 16, 4, 5, '#1c1612');
  rect(ctx, 23, 16, 1, 5, '#3a2e24');
  rect(ctx, 14, 21, 20, 2, '#1c1612');
  rect(ctx, 14, 21, 20, 1, '#3a2e24');
  rect(ctx, 12, 23, 24, 1, '#0f0c0a');
  for (const mx of [9, 22, 36]) {
    rect(ctx, mx, 7, 4, 4, '#1c1c1c');
    rect(ctx, mx, 7, 4, 1, '#6a6a6a');
    rect(ctx, mx + 4, 8, 1, 2, '#1c1c1c');
    rect(ctx, mx, 8, 1, 3, '#3a3a3a');
    rect(ctx, mx + 1, 5, 1, 1, '#8a8a8a');
    rect(ctx, mx + 2, 4, 1, 1, '#5a5a5a');
  }
}

// Persian rug, edge-on strip that lies on the floor.
export function drawRug(ctx) {
  const RED = '#7a2424';
  const BLUE = '#1f2f5a';
  const CREAM = '#d8c8a8';
  rect(ctx, 0, 0, 96, 8, BLUE);
  rect(ctx, 0, 0, 96, 2, RED);
  rect(ctx, 0, 6, 96, 2, RED);
  for (let x = 1; x < 96; x += 3) {
    rect(ctx, x, 0, 1, 1, CREAM);
    rect(ctx, x + 1, 7, 1, 1, CREAM);
  }
  for (let cx = 8; cx < 96; cx += 16) {
    fillPoly(ctx, [[cx, 2], [cx + 5, 4], [cx, 6], [cx - 5, 4]], '#9a3030');
    rect(ctx, cx - 1, 3, 3, 2, CREAM);
    rect(ctx, cx, 4, 1, 1, '#2e5a8a');
    rect(ctx, cx + 8, 3, 1, 2, '#c89a4a');
  }
  for (const x of [0, 94]) for (let y = 0; y < 8; y += 2) rect(ctx, x, y, 2, 1, CREAM);
}

// Warm vertical light bar.
export function drawSconce(ctx) {
  rect(ctx, 0, 0, 4, 16, '#e8b070');
  rect(ctx, 1, 1, 2, 14, '#fff0c8');
  rect(ctx, 0, 0, 4, 1, '#2a2622');
  rect(ctx, 0, 15, 4, 1, '#2a2622');
}

// ---------------------------------------------------------------------------------------------
// Powell St cable car, side view facing right; wheels touch row 31.

export function drawTrolley(ctx) {
  const MAROON = '#8a2721';
  const MAROON_D = '#62201b';
  const CREAM = '#e6d6ae';
  const ROOF = '#5a3a22';
  const ROOF_L = '#7a5232';
  const BRASS = '#c9a040';
  const INSIDE = '#2a1a14';
  // Clerestory roof with overhang.
  rect(ctx, 14, 0, 28, 2, ROOF);
  rect(ctx, 14, 0, 28, 1, ROOF_L);
  rect(ctx, 1, 2, 54, 3, ROOF);
  rect(ctx, 1, 2, 54, 1, ROOF_L);
  rect(ctx, 0, 4, 56, 1, '#3a2616');
  // Open end platforms: dark interior, brass poles, outward benches, low maroon dash.
  for (const ex of [1, 46]) {
    rect(ctx, ex, 5, 9, 11, INSIDE);
    rect(ctx, ex, 16, 9, 1, CREAM);
    rect(ctx, ex, 17, 9, 6, MAROON);
    rect(ctx, ex + 1, 13, 7, 2, '#6a4428');
    rect(ctx, ex, 5, 1, 12, BRASS);
    rect(ctx, ex + 8, 5, 1, 12, BRASS);
  }
  // Enclosed cabin with lit windows.
  rect(ctx, 10, 5, 36, 20, MAROON);
  for (let x = 12; x < 44; x += 6) {
    rect(ctx, x, 7, 4, 7, '#f0c27a');
    rect(ctx, x, 13, 4, 1, '#b8864a');
    rect(ctx, x, 7, 1, 1, '#fff0c8');
  }
  rect(ctx, 10, 16, 36, 2, CREAM);
  rect(ctx, 10, 18, 36, 7, MAROON_D);
  rect(ctx, 25, 19, 6, 4, CREAM);
  rect(ctx, 27, 20, 2, 2, MAROON_D);
  // Grip lever on the front platform, down into the cable slot.
  rect(ctx, 50, 8, 1, 21, '#8a8a8a');
  rect(ctx, 49, 7, 3, 2, '#c0c0c0');
  // Running board, trucks, wheels.
  rect(ctx, 0, 25, 56, 2, '#2e2018');
  rect(ctx, 0, 25, 56, 1, '#4a3424');
  rect(ctx, 8, 27, 12, 2, '#1a1614');
  rect(ctx, 36, 27, 12, 2, '#1a1614');
  for (const wx of [11, 17, 39, 45]) {
    fillEllipse(ctx, wx, 29, 2, 2, '#262626');
    rect(ctx, wx, 29, 1, 1, '#6a6a6a');
  }
  // Headlight and bell.
  rect(ctx, 55, 18, 1, 2, '#fff0c8');
  rect(ctx, 50, 1, 2, 1, BRASS);
}

export const HQ_ART = {
  hq_wall: { w: 320, h: 192, draw: drawHQWall },
  furby_pink: { w: 32, h: 16, draw: drawFurbyPink },
  furby_teal: { w: 32, h: 16, draw: drawFurbyTeal },
  furby_gold: { w: 32, h: 16, draw: drawFurbyGold },
  womb_chair: { w: 32, h: 32, draw: drawWombChair },
  bookshelf: { w: 32, h: 48, draw: drawBookshelf },
  plant: { w: 16, h: 32, draw: drawPlant },
  round_table: { w: 48, h: 24, draw: drawRoundTable },
  rug: { w: 96, h: 8, draw: drawRug },
  sconce: { w: 4, h: 16, draw: drawSconce },
  trolley: { w: 56, h: 32, draw: drawTrolley },
};

export function buildHQTextures(scene) {
  for (const [key, { w, h, draw }] of Object.entries(HQ_ART)) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    hardenAlpha(ctx, w, h);
    tex.refresh();
  }
}
