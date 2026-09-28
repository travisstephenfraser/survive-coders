// Procedural SF skyline, drawn once into canvas textures. Layers are TileSprites pinned to the
// camera; Level1 scrolls each one at its own parallax factor.
//   sky  (fixed): gradient, synthwave sun, bay water
//   far  (0.15): Twin Peaks + Sutro Tower, Golden Gate Bridge, Marin headlands
//   fog  (0.2):  Karl the Fog, drifting
//   mid  (0.3):  Coit Tower, Transamerica Pyramid, Salesforce Tower, downtown + neon billboards
//   signs (0.3): the billboards' lettering, at 3x resolution (see SIGNS)
//   near (0.55): Painted Ladies, cable car, street lamps

import { FONT_KEY } from './util.js';
import { mix } from './hqArt.js';

const ORANGE = '#d97757';
const ORANGE_DIM = '#b8603f';
const CYAN = '#39c5cf';
const MAGENTA = '#c678dd';
const YELLOW = '#e3b341';
const WARM = '#f0c090';

function rng(seed) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

function canvasTex(scene, key, w, h, draw, crisp = true) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  if (crisp) hardenAlpha(ctx, w, h);
  tex.refresh();
}

// Canvas paths antialias; snap alpha so silhouettes stay pixel-crisp.
function hardenAlpha(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Bresenham so thin structures (cables, antennas) are exactly one pixel.
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

const quadAt = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

function quad(ctx, x0, y0, cx, cy, x1, y1, color, steps = 48) {
  let px = x0;
  let py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = quadAt(x0, cx, x1, t);
    const y = quadAt(y0, cy, y1, t);
    line(ctx, px, py, x, y, color);
    px = x;
    py = y;
  }
}

function poly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

function ellipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Tiny thresholded canvas text: reads as a bitmap font on neon signs.
function pixelText(ctx, str, x, y, color, size = 8) {
  const c = document.createElement('canvas');
  c.width = str.length * size + 4;
  c.height = size + 4;
  const t = c.getContext('2d');
  t.font = `bold ${size}px Menlo, monospace`;
  t.textBaseline = 'top';
  t.fillStyle = color;
  t.fillText(str, 1, 1);
  const img = t.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 120 ? 255 : 0;
  t.putImageData(img, 0, 0);
  ctx.drawImage(c, Math.round(x), Math.round(y));
  return t.measureText(str).width;
}

function windows(ctx, x, y, w, h, r, density = 0.28) {
  const colors = [ORANGE, ORANGE, WARM, CYAN];
  for (let wy = y + 3; wy < y + h - 2; wy += 4) {
    for (let wx = x + 2; wx < x + w - 2; wx += 3) {
      if (r() < density) rect(ctx, wx, wy, 1, 2, colors[Math.floor(r() * colors.length)]);
    }
  }
}

// Neon billboards on the mid skyline. Their frames are painted into bg_mid; the lettering is
// its own layer, bg_signs, with the same parallax. That layer is drawn at 3x the world's
// resolution in the game's 8x8 pixel font, so a font pixel is 2 screen pixels (as on the
// street signs) instead of a 3-pixel world block, and the neon reads. (It was an 8px system font thresholded onto the world grid: mush.)
const SIGNS = [
  { x: 196, y: 70, text: 'AGI SOON', border: CYAN, fg: ORANGE },
  { x: 300, y: 60, text: 'SERIES A', border: MAGENTA, fg: WARM },
  { x: 540, y: 76, text: 'GPU', border: ORANGE, fg: CYAN },
  { x: 700, y: 58, text: 'NOW HIRING 10x', border: YELLOW, fg: ORANGE },
];
export const SIGN_RES = 3; // bg_signs texels per world pixel
const SIGN_PX = 2; // texels per font pixel

// Glyph metrics from the bitmap font font.js builds (proportional advances), plus the ink
// rows of each string, so the frames can be sized to the lettering.
function layoutSigns(scene) {
  const font = scene.cache.bitmapFont.get(FONT_KEY);
  const sheet = scene.textures.get(font.texture).getSourceImage();
  const px = sheet.getContext('2d').getImageData(0, 0, sheet.width, sheet.height).data;
  return SIGNS.map((sg) => {
    const glyphs = [...sg.text].map((ch) => font.data.chars[ch.charCodeAt(0)]);
    let [top, bottom] = [8, -1];
    for (const g of glyphs) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (px[((g.y + y) * sheet.width + g.x + x) * 4 + 3]) [top, bottom] = [Math.min(top, y), Math.max(bottom, y)];
        }
      }
    }
    const inkW = glyphs.reduce((w, g) => w + g.xAdvance, 0) - 1; // font px
    const w = Math.ceil((inkW * SIGN_PX) / SIGN_RES) + 6; // world px: 3 px padding a side
    const h = Math.ceil(((bottom - top + 1) * SIGN_PX) / SIGN_RES) + 5;
    return { ...sg, glyphs, top, bottom, inkW, w, h, sheet };
  });
}

function neonSign(ctx, sg) {
  const { x, y, w, h } = sg;
  rect(ctx, x, y, w, h, '#0d0d0d');
  ctx.strokeStyle = sg.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  line(ctx, x + 4, y + h, x + 4, y + h + 6, '#3a3a3a');
  line(ctx, x + w - 5, y + h, x + w - 5, y + h + 6, '#3a3a3a');
}

// The lettering, centred in each frame, on a transparent 3x canvas.
function drawSignText(ctx, signs) {
  for (const sg of signs) {
    const ink = document.createElement('canvas');
    ink.width = sg.inkW * SIGN_PX;
    ink.height = 8 * SIGN_PX;
    const t = ink.getContext('2d');
    t.imageSmoothingEnabled = false;
    let pen = 0;
    for (const g of sg.glyphs) {
      t.drawImage(sg.sheet, g.x, g.y, 8, 8, (pen + g.xOffset) * SIGN_PX, 0, 8 * SIGN_PX, 8 * SIGN_PX);
      pen += g.xAdvance;
    }
    t.globalCompositeOperation = 'source-in'; // white glyphs take the sign's colour
    t.fillStyle = sg.fg;
    t.fillRect(0, 0, ink.width, ink.height);
    const inkH = (sg.bottom - sg.top + 1) * SIGN_PX;
    const x = Math.round((sg.x + sg.w / 2) * SIGN_RES - ink.width / 2);
    const y = Math.round((sg.y + sg.h / 2) * SIGN_RES - inkH / 2) - sg.top * SIGN_PX;
    ctx.drawImage(ink, x, y);
  }
}

function drawSky(ctx, w, h) {
  // Sunset: dusk indigo overhead warming to a rose-orange glow at the bay's horizon (y 126).
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#120c22');
  g.addColorStop(0.3, '#2a1535');
  g.addColorStop(0.5, '#4a1d3a');
  g.addColorStop(0.62, '#7a2e38');
  g.addColorStop(0.69, '#9c4632');
  g.addColorStop(0.7, '#2a1a24');
  g.addColorStop(1, '#130f18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const r = rng(42);
  for (let i = 0; i < 40; i++) rect(ctx, r() * w, r() * 60, 1, 1, r() < 0.8 ? '#6a6a78' : ORANGE_DIM);

  // Synthwave sun sinking into the bay, with scanline gaps.
  const cx = 168;
  const cy = 124;
  for (let y = cy - 44; y < cy; y++) {
    const dy = cy - y;
    const half = Math.sqrt(44 * 44 - dy * dy);
    const gap = y > cy - 22 && (y - (cy - 22)) % 5 < 1 + (y - (cy - 22)) / 8;
    if (gap) continue;
    const t = (y - (cy - 44)) / 44;
    rect(ctx, cx - half, y, half * 2, 1, t < 0.4 ? '#f3a07a' : t < 0.75 ? ORANGE : '#b4533a');
  }
  // Bay water with the sun's reflection.
  for (let y = 126; y < h; y += 3) {
    const spread = 34 - (y - 126) * 0.5;
    if (spread < 4) break;
    rect(ctx, cx - spread + ((y * 7) % 5), y, spread * 2 - ((y * 3) % 9), 1, '#5a2e22');
  }
}

function drawFar(ctx) {
  // Marin headlands behind the bridge.
  poly(ctx, [[330, 124], [380, 98], [430, 104], [470, 92], [540, 108], [600, 124]], '#120d12');

  // Twin Peaks, with Sutro Tower on the saddle.
  ellipse(ctx, 70, 132, 52, 44, '#161017');
  ellipse(ctx, 150, 134, 48, 38, '#161017');
  const sx = 112;
  const base = 98;
  const c = ORANGE_DIM;
  line(ctx, sx - 11, base, sx - 3, 58, c);
  line(ctx, sx + 11, base, sx + 3, 58, c);
  line(ctx, sx, base + 2, sx, 58, '#8a4a36');
  line(ctx, sx - 8, 82, sx + 8, 82, c);
  line(ctx, sx - 5, 68, sx + 5, 68, c);
  line(ctx, sx - 3, 58, sx - 8, 38, c);
  line(ctx, sx + 3, 58, sx + 8, 38, c);
  line(ctx, sx, 58, sx, 35, c);
  line(ctx, sx - 6, 48, sx + 6, 48, c);
  line(ctx, sx - 7, 41, sx + 7, 41, c);
  line(ctx, sx - 8, 38, sx - 8, 27, c);
  line(ctx, sx + 8, 38, sx + 8, 27, c);
  line(ctx, sx, 35, sx, 22, c);
  for (const [x, y] of [[sx - 8, 26], [sx + 8, 26], [sx, 21], [sx - 6, 48], [sx + 6, 48]]) rect(ctx, x, y, 1, 1, '#ff5a4e');

  // Golden Gate Bridge (International Orange is basically Claude orange).
  const deck = 116;
  const t1 = 330;
  const t2 = 500;
  const top = 42;
  const sag = 158;
  const cable = '#d0674a';
  quad(ctx, 262, deck - 2, 300, 96, t1, top + 2, cable);
  quad(ctx, t1, top + 2, (t1 + t2) / 2, sag, t2, top + 2, cable);
  quad(ctx, t2, top + 2, 530, 96, 572, deck - 2, cable);
  for (let x = t1 + 4; x < t2 - 2; x += 5) {
    const t = (x - t1) / (t2 - t1);
    const y = quadAt(top + 2, sag, top + 2, t);
    if (y < deck - 1) line(ctx, x, y, x, deck - 1, '#5a3024');
  }
  for (const tx of [t1, t2]) {
    rect(ctx, tx - 5, top, 2, 128 - top, ORANGE);
    rect(ctx, tx + 3, top, 2, 128 - top, ORANGE);
    for (const by of [top + 3, top + 17, top + 33, top + 50]) rect(ctx, tx - 5, by, 10, 2, ORANGE);
    rect(ctx, tx - 6, top - 2, 3, 2, ORANGE);
    rect(ctx, tx + 3, top - 2, 3, 2, ORANGE);
    rect(ctx, tx - 1, top - 3, 1, 1, '#ff5a4e');
  }
  rect(ctx, 250, deck, 340, 2, ORANGE);
  for (let x = 252; x < 588; x += 4) rect(ctx, x, deck - 1, 1, 1, '#f5d0a0');
}

function drawFog(ctx, w, h) {
  const r = rng(7);
  for (let i = 0; i < 36; i++) {
    ctx.fillStyle = `rgba(150,156,168,${0.05 + r() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(r() * w, h / 2 + (r() - 0.5) * h * 0.5, 20 + r() * 40, 4 + r() * 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Salesforce Tower, the tallest thing in the skyline: a rounded-square obelisk whose sides run
// straight for the lower 40%, then curve in, ever faster, to a top half the base's width.
// Pale glass is striped by white fins, darker where the rounded corners turn away, with a warm
// rim on the sunset side. The crown is the open lattice of the top six floors, lit by Jim
// Campbell's "Day for Night" LEDs (here in bands, as on a pride night seen from the Bay Bridge),
// and a strip of lit panels runs down the face below it.
const TOWER_BANDS = ['#ff9ae8', '#ff6a5e', '#ff9a6a', '#ffe066', '#fff0c8', '#7fe8f0'];
function drawSalesforceTower(ctx, cx, base, top) {
  const r = rng(415); // 415 Mission St
  const H = base - top;
  const CROWN = 17; // lattice rows under the top
  const half = (y) => {
    const t = (base - y) / H; // 0 at the street, 1 at the top of the crown
    const curve = t < 0.42 ? 0 : ((t - 0.42) / 0.58) ** 2;
    const shoulder = [2, 1, 1][y - top] ?? 0; // the crown's rounded top corners
    return Math.round(12 - 6 * curve) - shoulder;
  };
  for (let y = top; y < base; y++) {
    const hw = half(y);
    const crown = y - top < CROWN;
    const sky = 1 - (y - top) / H; // glass higher up reflects more of the dusk sky
    for (let x = -hw; x < hw; x++) {
      const edge = Math.min(x + hw, hw - 1 - x); // 0 at the silhouette's edge
      let c;
      if (crown) {
        const row = y - top;
        if (row % 3 === 0 || (x + 20) % 2 === 0) c = '#241f2c'; // floor bands and mullions
        else c = r() < 0.12 ? '#3a3040' : TOWER_BANDS[Math.min(TOWER_BANDS.length - 1, Math.floor(row / 3))];
      } else {
        const fin = (x + 20) % 3 === 0;
        c = mix(fin ? '#4a4d5e' : '#23242f', fin ? '#8a7f98' : '#3c3548', sky);
        if (y % 4 === 1 && !fin && r() < 0.1) c = r() < 0.7 ? WARM : '#dfe8f0'; // a few offices still lit
      }
      if (edge === 0) c = x < 0 ? '#b0605a' : '#15141b'; // sunset rim on the left, shadow on the right
      else if (edge === 1 && !crown) c = mix(c, '#101018', 0.45); // the corner turning away
      rect(ctx, cx + x, y, 1, 1, c);
    }
  }
  // Lit panels running down the face from the crown.
  for (let y = top + CROWN; y < top + CROWN + 12; y++) if ((y - top) % 3) rect(ctx, cx + 1, y, 1, 1, y - top < CROWN + 6 ? CYAN : '#2e6d78');
}

function drawMid(ctx, w, signs) {
  const r = rng(99);
  const base = 150;

  // Back row of towers.
  for (let x = 0; x < w; ) {
    const bw = 14 + Math.floor(r() * 18);
    const bh = 40 + Math.floor(r() * 45);
    rect(ctx, x, base - bh, bw, bh, '#120f16');
    windows(ctx, x, base - bh, bw, bh, r, 0.12);
    x += bw + 1;
  }

  // Coit Tower on Telegraph Hill.
  ellipse(ctx, 120, 152, 62, 44, '#18121a');
  rect(ctx, 110, 104, 20, 6, '#6f6862');
  rect(ctx, 116, 62, 8, 44, '#a39a90');
  line(ctx, 118, 64, 118, 104, '#7b736b');
  line(ctx, 121, 64, 121, 104, '#7b736b');
  rect(ctx, 115, 57, 10, 6, '#b8afa4');
  for (const x of [116, 119, 122]) rect(ctx, x, 59, 1, 2, ORANGE);
  rect(ctx, 119, 54, 2, 3, '#b8afa4');

  // Front row of mid-rise downtown blocks.
  const fronts = [[190, 34, 62], [226, 26, 48], [300, 40, 70], [344, 22, 54], [470, 30, 66], [560, 24, 58], [676, 34, 74], [714, 28, 50], [746, 40, 64], [790, 30, 52], [824, 36, 70]];
  for (const [x, bw, bh] of fronts) {
    rect(ctx, x, base - bh, bw, bh, '#17141c');
    windows(ctx, x, base - bh, bw, bh, r, 0.3);
    rect(ctx, x, base - bh, bw, 1, '#2a2430');
  }

  // Transamerica Pyramid.
  const px = 430;
  poly(ctx, [[px - 14, base], [px, 16], [px + 14, base]], '#1d1a23');
  for (let y = 30; y < base; y += 4) {
    const half = ((y - 16) / (base - 16)) * 14;
    for (let x = px - half + 2; x < px + half - 1; x += 3) if (r() < 0.45) rect(ctx, x, y, 1, 2, r() < 0.5 ? WARM : CYAN);
  }
  line(ctx, px - 14, base, px, 16, ORANGE);
  line(ctx, px + 14, base, px, 16, ORANGE);
  poly(ctx, [[px - 5, 60], [px - 9, 64], [px - 9, 78], [px - 6, 78]], '#1d1a23');
  poly(ctx, [[px + 5, 60], [px + 9, 64], [px + 9, 78], [px + 6, 78]], '#1d1a23');
  line(ctx, px, 16, px, 4, '#d8d0c4');
  rect(ctx, px, 3, 1, 1, '#ff5a4e');

  drawSalesforceTower(ctx, 630, base, 20);

  // Neon billboard frames; their lettering is bg_signs.
  for (const sg of signs) neonSign(ctx, sg);
}

function drawNear(ctx, w) {
  const r = rng(5);
  const base = 150;
  const trims = [ORANGE, CYAN, MAGENTA, YELLOW];
  const bodies = ['#1c1519', '#16181f', '#1d1616', '#181520'];
  const house = (x, i) => {
    const body = bodies[i % bodies.length];
    const trim = trims[i % trims.length];
    const roofY = 92 + (i % 3) * 4;
    rect(ctx, x, 108, 32, base - 108, body);
    if (i % 2 === 0) {
      poly(ctx, [[x - 1, 108], [x + 16, roofY], [x + 33, 108]], body);
      line(ctx, x - 1, 108, x + 16, roofY, trim);
      line(ctx, x + 16, roofY, x + 33, 108, trim);
    } else {
      rect(ctx, x - 1, 102, 34, 6, body);
      rect(ctx, x - 1, 102, 34, 1, trim);
      for (let bx = x + 1; bx < x + 32; bx += 4) rect(ctx, bx, 103, 1, 2, trim);
    }
    rect(ctx, x, 108, 32, 1, trim);
    // Bay window.
    poly(ctx, [[x + 3, 140], [x + 3, 118], [x + 6, 115], [x + 14, 115], [x + 17, 118], [x + 17, 140]], body);
    line(ctx, x + 3, 118, x + 6, 115, trim);
    line(ctx, x + 6, 115, x + 14, 115, trim);
    line(ctx, x + 14, 115, x + 17, 118, trim);
    for (const wx of [x + 5, x + 9, x + 13]) rect(ctx, wx, 119, 2, 7, r() < 0.75 ? WARM : '#2a2226');
    for (const wx of [x + 5, x + 12, x + 21, x + 26]) if (wx < x + 30) rect(ctx, wx, 111, 2, 3, r() < 0.6 ? ORANGE : '#2a2226');
    rect(ctx, x + 21, 132, 6, 18, '#0d0d0d');
    line(ctx, x + 20, 131, x + 27, 131, trim);
    rect(ctx, x + 22, 122, 4, 5, r() < 0.5 ? WARM : '#2a2226');
  };
  let i = 0;
  for (let x = 6; x < 330; x += 34) house(x, i++);

  // Cable car.
  const cx = 350;
  rect(ctx, cx, 126, 40, 18, '#6b2a22');
  rect(ctx, cx - 2, 123, 44, 3, '#3a1814');
  rect(ctx, cx, 133, 40, 2, '#e8d8b0');
  for (let x = cx + 2; x < cx + 38; x += 6) rect(ctx, x, 127, 4, 5, r() < 0.8 ? WARM : '#2a1c18');
  rect(ctx, cx + 4, 144, 5, 4, '#0d0d0d');
  rect(ctx, cx + 31, 144, 5, 4, '#0d0d0d');
  pixelText(ctx, 'POWELL', cx + 9, 136, '#3a1814', 7);
  line(ctx, cx + 20, 123, cx + 26, 100, '#3a3a3a');

  for (let x = 410; x < w - 20; x += 34) house(x, i++);

  // Street lamps.
  for (let x = 30; x < w; x += 120) {
    line(ctx, x, base, x, 112, '#34343c');
    rect(ctx, x - 2, 110, 5, 2, '#34343c');
    rect(ctx, x - 1, 112, 3, 2, '#f5d0a0');
  }
}

// A glass tower beside the park: dusk sky caught in the upper floors, mullions, floors lit in
// runs, a sunset rim. `braced` is 181 Fremont: a diagonal exoskeleton and a sloped top.
const GLASS = [['#172029', '#33485a'], ['#1b1d2b', '#3b4063'], ['#1d1a24', '#433a52'], ['#142326', '#2c5256']];
function glassTower(ctx, x, top, bw, base, [body, sky], r, braced) {
  const roof = (gx) => (braced ? top + Math.round(((gx - x) / bw) * 12) : top);
  for (let gx = x; gx < x + bw; gx++) {
    for (let y = roof(gx); y < base; y++) rect(ctx, gx, y, 1, 1, mix(sky, body, Math.min(1, ((y - top) / (base - top)) * 1.6)));
  }
  for (let mx = x + 3; mx < x + bw - 1; mx += 4) line(ctx, mx, roof(mx) + 2, mx, base - 1, mix(body, '#000000', 0.35));
  for (let y = top + 16; y < base - 2; y += 5) {
    let run = 0;
    for (let wx = x + 1; wx < x + bw - 3; wx += 4) {
      if (!run && r() < 0.09) run = 1 + Math.floor(r() * 5);
      if (run && y > roof(wx) + 2) {
        rect(ctx, wx, y, 3, 2, r() < 0.8 ? WARM : '#dfe8f0');
        run--;
      }
    }
  }
  if (braced) {
    for (let gx = x; gx < x + bw; gx++) {
      const d = gx - x;
      for (let k = -2; k < 8; k++) {
        for (const y of [top + k * 22 + d, top + k * 22 + bw - 1 - d]) if (y > roof(gx) && y < base) rect(ctx, gx, y, 1, 1, '#6a7382');
      }
    }
  }
  line(ctx, x, roof(x), x, base, '#9c5a58'); // sunset rim
  for (let gx = x; gx < x + bw; gx++) rect(ctx, gx, roof(gx), 1, 1, mix(sky, '#ffffff', 0.25));
}

// Salesforce Park's near plane: the glass towers that wall the park in, kept below the skyline
// so the Salesforce Tower always clears them, and in front of them the park's own canopy:
// redwood spires, round street trees, palms from the palm garden, a hedge along the path, and
// the slim lamps. Nothing crosses the texture's edges, so it wraps cleanly.
function drawPark(ctx, w) {
  const r = rng(23);
  const base = 150;
  let fremont = false; // 181 Fremont, once
  for (let x = 4; x < w - 30; ) {
    const bw = 28 + Math.floor(r() * 26);
    if (x + bw > w - 4) break;
    const braced = !fremont && x > 380;
    fremont ||= braced;
    glassTower(ctx, x, base - (braced ? 100 : 52 + Math.floor(r() * 36)), bw, base, GLASS[Math.floor(r() * GLASS.length)], r, braced);
    x += bw + 4 + Math.floor(r() * 22);
  }
  const CANOPY = ['#1a2c20', '#24392b', '#30503a', '#44694f'];
  for (let x = 24; x < w - 20; x += 50 + Math.floor(r() * 50)) {
    const h = 46 + Math.floor(r() * 18);
    for (let y = base - h; y < base - 6; y++) {
      const half = Math.round(((y - (base - h)) / h) * 9);
      rect(ctx, x - half, y, half * 2 + 1, 1, (y + x) % 6 === 0 ? CANOPY[1] : CANOPY[0]);
    }
  }
  const roundTree = (x) => {
    const trunkH = 10 + Math.floor(r() * 10);
    rect(ctx, x - 1, base - trunkH, 2, trunkH, '#2a211c');
    const cy = base - trunkH - 9;
    const rx = 14 + r() * 6;
    const ry = 11 + r() * 5;
    ellipse(ctx, x, cy, rx, ry, CANOPY[0]);
    ellipse(ctx, x - 3, cy - 3, rx * 0.65, ry * 0.6, CANOPY[1]);
    ellipse(ctx, x - 6, cy - 6, rx * 0.3, ry * 0.3, CANOPY[2]);
    rect(ctx, x - 8, cy - 9, 2, 1, CANOPY[3]);
  };
  for (let x = 20; x < w - 20; x += 22 + Math.floor(r() * 16)) {
    if (r() < 0.25) {
      // Palm: a leaning trunk and drooping fronds.
      const lean = r() < 0.5 ? -3 : 3;
      line(ctx, x, base, x + lean, base - 44, '#3a2e24');
      for (const [dx, dy] of [[-11, 5], [-9, -2], [-4, -5], [3, -5], [9, -2], [11, 5]]) {
        line(ctx, x + lean, base - 44, x + lean + dx, base - 44 + dy, CANOPY[2]);
        rect(ctx, x + lean + dx, base - 44 + dy + 1, 1, 1, CANOPY[1]);
      }
    } else roundTree(x);
  }
  // Hedge along the path.
  for (let x = 0; x < w; x += 7) ellipse(ctx, x + 3, base - 3, 6, 4 + ((x * 13) % 3), CANOPY[(x * 7) % 3 === 0 ? 1 : 0]);
  for (let x = 44; x < w - 10; x += 110) {
    line(ctx, x, base, x, 108, '#34343c');
    rect(ctx, x - 1, 106, 3, 2, '#f5d0a0');
    rect(ctx, x, 105, 1, 1, '#fff0c8');
  }
}

export function buildBackdrops(scene) {
  canvasTex(scene, 'bg_sky', 320, 180, drawSky, false);
  canvasTex(scene, 'bg_far', 600, 180, drawFar);
  canvasTex(scene, 'bg_fog', 320, 40, drawFog, false);
  const signs = layoutSigns(scene); // the pixel font is built first (Boot)
  canvasTex(scene, 'bg_mid', 900, 180, (ctx, w) => drawMid(ctx, w, signs));
  canvasTex(scene, 'bg_signs', 900 * SIGN_RES, 180 * SIGN_RES, (ctx) => drawSignText(ctx, signs));
  canvasTex(scene, 'bg_near', 900, 180, drawNear);
  canvasTex(scene, 'bg_park', 900, 180, drawPark);
}

// Parallax factor per layer; Level1 adds these as camera-pinned TileSprites.
// Every plane is opaque (nothing behind shows through a silhouette); depth comes from `tint`,
// which dims each plane more the farther back it sits, so the street is brightest and the
// headlands dimmest against the sunset.
export const LAYERS = [
  { key: 'bg_sky', f: 0 },
  { key: 'bg_far', f: 0.15, tint: 0x80788c },
  { key: 'bg_fog', f: 0.2, y: 96, h: 40, drift: 0.004 },
  { key: 'bg_mid', f: 0.3, tint: 0x9c94a8 },
  { key: 'bg_signs', f: 0.3, tint: 0xb8b0c0, res: SIGN_RES },
  { key: 'bg_near', f: 0.55, tint: 0xc8c4d0 },
];

// Salesforce Park: the same sky and skyline, with the park's glass towers and trees as the near
// plane. The skyline sits 100px further right (`ox`), so the Salesforce Tower rises
// over the second half of the park and slides behind its own lobby at the exit.
export const PARK_LAYERS = [
  ...LAYERS.filter((l) => l.key !== 'bg_near').map((l) => (l.key === 'bg_mid' || l.key === 'bg_signs' ? { ...l, ox: -100 } : l)),
  { key: 'bg_park', f: 0.55, tint: 0xc8c4d0 },
];

// The view from the Salesforce Tower's floors, 900ft up: the same sky, the city dropped below
// the window line (the hills 40px, downtown 55px; the street is out of sight), and Karl the Fog
// down over the bay. Floors are too short to scroll the skyline as far as the tower itself.
export const TOWER_VIEW = [
  { key: 'bg_sky', f: 0 },
  { key: 'bg_far', f: 0.15, tint: 0x80788c, y: 40 },
  { key: 'bg_mid', f: 0.3, tint: 0x9c94a8, y: 55 },
  { key: 'bg_signs', f: 0.3, tint: 0xb8b0c0, res: SIGN_RES, y: 55 },
  { key: 'bg_fog', f: 0.2, y: 118, h: 40, drift: 0.004 },
];

// Cable cars running along the Painted Ladies street (near layer plane).
export const TROLLEYS = [
  { x0: 0, speed: 0.012, dir: 1 },
  { x0: 230, speed: 0.012, dir: 1 },
];
