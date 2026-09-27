// Draws the favicon, home-screen icons and the link-preview card from the game's own pixel
// art: the hero and laptop from src/sprites.js, text in the Ninja Adventure 8x8 font. Every
// scale is a whole number, so pixels stay square. No dependencies (PNG via node:zlib).
//
//   node scripts/make-images.mjs      writes into public/; rerun after changing the hero
import { readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { paintSprite, spriteSize } from '../src/sprites.js';
import { ASCII, EXTRA, GLYPHS_PER_ROW } from '../src/glyphs.js';

const ROOT = new URL('..', import.meta.url);
const BG = '#0d0d0d';
const ORANGE = '#d97757';
const BAR = '#1c1c1f';
const GRAY = '#8b8b8b';
const WHITE = '#f5f5f5';
const GREEN = '#3fb950';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);

// RGBA raster with the three 2D-context calls the sprite painters use.
class Raster {
  constructor(w, h, bg) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    if (bg) this.fill(0, 0, w, h, bg);
  }

  set fillStyle(hex) {
    this.color = hex;
  }

  fillRect(x, y, w, h) {
    this.fill(x, y, w, h, this.color);
  }

  // A copy, as in a browser: outline() reads it while painting.
  getImageData() {
    return { data: this.data.slice() };
  }

  fill(x, y, w, h, hex) {
    const c = rgb(hex);
    for (let yy = Math.max(0, y); yy < Math.min(this.height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.width, x + w); xx++) this.data.set(c, (yy * this.width + xx) * 4);
    }
  }

  alpha(x, y) {
    return this.data[(y * this.width + x) * 4 + 3];
  }

  // Bounding box of the opaque pixels.
  ink() {
    let [x0, y0, x1, y1] = [this.width, this.height, -1, -1];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.alpha(x, y)) continue;
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // Nearest-neighbour blit of src's opaque pixels at a whole-number scale.
  draw(src, dx, dy, s = 1) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const i = (y * src.width + x) * 4;
        if (!src.data[i + 3]) continue;
        const hex = `#${[0, 1, 2].map((k) => src.data[i + k].toString(16).padStart(2, '0')).join('')}`;
        this.fill(dx + x * s, dy + y * s, s, s, hex);
      }
    }
  }

  disc(cx, cy, r, hex) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.fill(cx + x, cy + y, 1, 1, hex);
    }
  }
}

function readPng(url) {
  const buf = readFileSync(url);
  const idat = [];
  let w;
  let h;
  for (let pos = 8; pos < buf.length; ) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      [w, h] = [body.readUInt32BE(0), body.readUInt32BE(4)];
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('font PNG must be 8-bit RGBA, not interlaced');
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const img = new Raster(w, h);
  const stride = w * 4;
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? img.data[y * stride + i - 4] : 0;
      const b = y > 0 ? img.data[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= 4 ? img.data[(y - 1) * stride + i - 4] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][filter];
      img.data[y * stride + i] = (raw[y * (stride + 1) + 1 + i] + pred) & 255;
    }
  }
  return img;
}

function writePng(name, img) {
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) Buffer.from(img.data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  const chunk = (type, body) => {
    const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const head = Buffer.alloc(4);
    const tail = Buffer.alloc(4);
    head.writeUInt32BE(body.length);
    tail.writeUInt32BE(crc32(tb));
    return Buffer.concat([head, tb, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(new URL(`public/${name}`, ROOT), png);
  console.log(`public/${name}  ${img.width}x${img.height}  ${png.length} bytes`);
}

function sprite(key) {
  const { w, h } = spriteSize(key);
  const r = new Raster(w, h);
  paintSprite(r, key);
  return r;
}

// The game's proportional spacing (font.js): advance = inked width + 1, space = 4.
const SHEET = readPng(new URL('public/assets/ninja/font8x8.png', ROOT));
const GLYPH = new Map(
  [...ASCII, ...Object.keys(EXTRA)].map((ch, cell) => {
    const cx = (cell % GLYPHS_PER_ROW) * 8;
    const cy = Math.floor(cell / GLYPHS_PER_ROW) * 8;
    const inked = (x, y) => (EXTRA[ch] ? EXTRA[ch][y][x] === '#' : SHEET.alpha(cx + x, cy + y) > 0);
    let [min, max] = [8, -1];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) if (inked(x, y)) [min, max] = [Math.min(min, x), Math.max(max, x)];
    }
    return [ch, { inked, min, advance: max < 0 ? 4 : max - min + 2 }];
  }),
);

const textWidth = (str, s) => [...str].reduce((w, ch) => w + GLYPH.get(ch).advance * s, 0) - s;

function text(img, str, x, y, s, hex) {
  let pen = x;
  for (const ch of str) {
    const g = GLYPH.get(ch);
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) if (g.inked(gx, gy)) img.fill(pen + (gx - g.min) * s, y + gy * s, s, s, hex);
    }
    pen += g.advance * s;
  }
  return pen - s - x;
}

// Square icon: the hero's inked pixels, centred at a whole-number scale.
function icon(size, scale, bg) {
  const hero = sprite('player_idle');
  const box = hero.ink();
  const img = new Raster(size, size, bg);
  img.draw(hero, Math.round((size - box.w * scale) / 2) - box.x * scale, Math.round((size - box.h * scale) / 2) - box.y * scale, scale);
  return img;
}

// Link preview (Open Graph, 1200x630): the title screen's terminal window and key art.
function card() {
  const [W, H] = [1200, 630];
  const img = new Raster(W, H, BG);
  const [x0, y0, w, h] = [28, 28, W - 56, H - 56];
  img.fill(x0, y0, w, h, ORANGE);
  img.fill(x0 + 3, y0 + 3, w - 6, h - 6, BG);
  img.fill(x0 + 3, y0 + 3, w - 6, 42, BAR);
  img.fill(x0 + 3, y0 + 45, w - 6, 3, ORANGE);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => img.disc(x0 + 30 + i * 28, y0 + 24, 8, c));
  const title = 'vibecoder@sf: ~/survive-coders - zsh';
  text(img, title, Math.round(W / 2 - textWidth(title, 2) / 2), y0 + 17, 2, GRAY);

  const left = 76;
  text(img, '$ claude "make one small change"', left, 108, 3, GRAY);
  const titleRight = left + Math.max(text(img, 'SURVIVE', left, 162, 12, ORANGE), text(img, 'CODERS', left, 274, 12, ORANGE));
  text(img, "a vibe coder's run from", left, 404, 3, WHITE);
  text(img, 'Daly City to Anthropic HQ', left, 440, 3, WHITE);
  text(img, '$ play in your browser_', left, 508, 3, GREEN);

  // Hero at 20x with the laptop at half his scale, placed as on the title screen (laptop
  // centre 9 hero px right of his, 0.8 up). Right-aligned inside the window.
  const S = 20;
  const hero = sprite('player_idle');
  const laptop = sprite('laptop');
  const heroBox = hero.ink();
  const lapBox = laptop.ink();
  const lapRight = (8 + 9) * S + (lapBox.x + lapBox.w - 8) * (S / 2); // laptop's right edge, from the hero's left
  const hx = x0 + w - 44 - lapRight;
  const hy = 150;
  img.draw(hero, hx, hy, S);
  img.draw(laptop, hx + (8 + 9) * S - 8 * (S / 2), hy + 8 * S - Math.round(0.8 * S) - 8 * (S / 2), S / 2);
  const heroLeft = hx + heroBox.x * S;
  if (heroLeft - titleRight < 24) throw new Error(`card: hero (x ${heroLeft}) crowds the title (ends x ${titleRight})`);
  console.log(`card: title ends x ${titleRight}, hero ink x ${heroLeft}-${hx + (heroBox.x + heroBox.w) * S}, y ${hy + heroBox.y * S}-${hy + (heroBox.y + heroBox.h) * S}`);
  return img;
}

writePng('favicon-16.png', icon(16, 1));
writePng('favicon-32.png', icon(32, 2));
writePng('apple-touch-icon.png', icon(180, 10, BG));
writePng('icon-192.png', icon(192, 10, BG));
writePng('icon-512.png', icon(512, 26, BG));
writePng('og.png', card());
