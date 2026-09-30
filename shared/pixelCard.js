import { paintSprite, spriteSize } from '../src/sprites.js';
import { ASCII, EXTRA, GLYPHS_PER_ROW } from '../src/glyphs.js';
import { MAX_STARS, formatTime } from './leaderboard.js';
import { place } from './share.js';

// Pixel art at card size, drawn from the game's own sprites (src/sprites.js) and 8x8 font: the
// link-preview card (og.png) and a shared run's card. Every scale is a whole number, so pixels
// stay square. Pure JS: the PNG encoding is the caller's (node:zlib in scripts/make-images.mjs
// and the card function, a canvas in the game).

const BG = '#0d0d0d';
const ORANGE = '#d97757';
const BAR = '#1c1c1f';
const GRAY = '#8b8b8b';
const WHITE = '#f5f5f5';
const GREEN = '#3fb950';
const RED = '#e5534b';
const YELLOW = '#e3b341';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);

// RGBA raster with the three 2D-context calls the sprite painters use.
export class Raster {
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

  // Multiply every pixel by a colour, as Phaser's setTint does (the hero's red when he dies).
  tint(hex) {
    const c = rgb(hex);
    for (let i = 0; i < this.data.length; i += 4) for (let k = 0; k < 3; k++) this.data[i + k] = (this.data[i + k] * c[k]) / 255;
    return this;
  }
}

export function sprite(key) {
  const { w, h } = spriteSize(key);
  const r = new Raster(w, h);
  paintSprite(r, key);
  return r;
}

// The game's bitmap font from its 8x8 sheet (anything with width and alpha(x, y): a decoded PNG
// here, or the loaded texture's pixels in the browser), with its proportional spacing
// (font.js): advance = inked width + 1, space = 4.
export function createFont(sheet) {
  const glyphs = new Map(
    [...ASCII, ...Object.keys(EXTRA)].map((ch, cell) => {
      const cx = (cell % GLYPHS_PER_ROW) * 8;
      const cy = Math.floor(cell / GLYPHS_PER_ROW) * 8;
      const inked = (x, y) => (EXTRA[ch] ? EXTRA[ch][y][x] === '#' : sheet.alpha(cx + x, cy + y) > 0);
      let [min, max] = [8, -1];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) if (inked(x, y)) [min, max] = [Math.min(min, x), Math.max(max, x)];
      }
      return [ch, { inked, min, advance: max < 0 ? 4 : max - min + 2 }];
    }),
  );
  const glyph = (ch) => glyphs.get(ch) ?? glyphs.get('?');
  return {
    width: (str, s) => [...str].reduce((w, ch) => w + glyph(ch).advance * s, 0) - s,
    text(img, str, x, y, s, hex) {
      let pen = x;
      for (const ch of str) {
        const g = glyph(ch);
        for (let gy = 0; gy < 8; gy++) {
          for (let gx = 0; gx < 8; gx++) if (g.inked(gx, gy)) img.fill(pen + (gx - g.min) * s, y + gy * s, s, s, hex);
        }
        pen += g.advance * s;
      }
      return pen - s - x;
    },
  };
}

const [W, H] = [1200, 630];
const FRAME = { x0: 28, y0: 28, w: W - 56, h: H - 56 };

// The title screen's terminal window: orange frame, title bar, traffic lights, title.
function terminal(font, title) {
  const img = new Raster(W, H, BG);
  const { x0, y0, w, h } = FRAME;
  img.fill(x0, y0, w, h, ORANGE);
  img.fill(x0 + 3, y0 + 3, w - 6, h - 6, BG);
  img.fill(x0 + 3, y0 + 3, w - 6, 42, BAR);
  img.fill(x0 + 3, y0 + 45, w - 6, 3, ORANGE);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => img.disc(x0 + 30 + i * 28, y0 + 24, 8, c));
  font.text(img, title, Math.round(W / 2 - font.width(title, 2) / 2), y0 + 17, 2, GRAY);
  return img;
}

// Hero at scale S with the laptop at half his scale, placed as on the title screen (laptop
// centre 9 hero px right of his, 0.8 up), right-aligned inside the window. Returns his ink's
// left edge, so text can be checked against it.
function hero(img, S, hy, { dead = false } = {}) {
  const { x0, w } = FRAME;
  const body = sprite('player_idle');
  if (dead) body.tint(RED);
  const laptop = sprite('laptop');
  const lapBox = laptop.ink();
  const lapRight = (8 + 9) * S + (lapBox.x + lapBox.w - 8) * (S / 2); // laptop's right edge, from the hero's left
  const hx = x0 + w - 44 - lapRight;
  img.draw(body, hx, hy, S);
  img.draw(laptop, hx + (8 + 9) * S - 8 * (S / 2), hy + 8 * S - Math.round(0.8 * S) - 8 * (S / 2), S / 2);
  return hx + body.ink().x * S;
}

// Link preview (Open Graph, 1200x630): the title screen's terminal window and key art.
export function ogCard(font) {
  const img = terminal(font, 'vibecoder@sf: ~/survive-coders - zsh');
  const left = 76;
  font.text(img, '$ claude "make one small change"', left, 108, 3, GRAY);
  const titleRight = left + Math.max(font.text(img, 'SURVIVE', left, 162, 12, ORANGE), font.text(img, 'CODERS', left, 274, 12, ORANGE));
  font.text(img, "a vibe coder's run from", left, 404, 3, WHITE);
  font.text(img, 'Daly City to Anthropic HQ', left, 440, 3, WHITE);
  font.text(img, '$ play in your browser_', left, 508, 3, GREEN);
  const heroLeft = hero(img, 20, 150);
  if (heroLeft - titleRight < 24) throw new Error(`card: hero (x ${heroLeft}) crowds the title (ends x ${titleRight})`);
  return img;
}

// The largest whole scale (from `max` down to `min`) at which `str` fits in `room` pixels.
const fit = (font, str, room, max, min) => {
  for (let s = max; s > min; s--) if (font.width(str, s) <= room) return s;
  return min;
};

// A shared run (1200x630): the End screen's story in the same window. `run` is
// { placeKey, stars, timeMs } plus, for a posted win, { name, rank, total }.
export function runCard(font, run) {
  const win = run.placeKey === 'hq';
  const p = place(run.placeKey);
  const posted = win && Number.isInteger(run.rank);
  const img = terminal(font, win ? 'git push origin main - success' : 'process exited with code 1');
  const left = 76;
  const heroLeft = hero(img, 16, 190, { dead: !win });
  const room = heroLeft - 40 - left;

  font.text(img, win ? (posted ? '$ git push --board' : '$ git push origin main') : '$ npm run survive', left, 100, 3, GRAY);
  const headline = win ? (posted ? `#${run.rank} of ${run.total}` : 'SHIPPED.') : run.placeKey === 'chute' ? '404: PARACHUTE NOT FOUND' : 'CONTEXT EXHAUSTED';
  const hs = fit(font, headline, room, 10, 4);
  font.text(img, headline, left, 150, hs, win ? (posted ? ORANGE : GREEN) : RED);

  let y = 150 + 8 * hs + 36;
  const line = (str, hex) => {
    font.text(img, str, left, y, fit(font, str, room, 3, 2), hex);
    y += 38;
  };
  if (win) {
    if (run.name) line(run.name, ORANGE);
    line('Daly City to Anthropic HQ', WHITE);
    line(`in ${formatTime(run.timeMs)}`, GRAY);
  } else {
    line(p.where, WHITE);
    line(p.miles > 0 ? `${p.miles} miles from Anthropic HQ, after ${formatTime(run.timeMs)}` : `after ${formatTime(run.timeMs)}`, GRAY);
  }
  font.text(img, win ? `★ ${run.stars}/${MAX_STARS}` : `★ ${run.stars}`, left, Math.max(y + 10, 410), 7, YELLOW);
  font.text(img, win ? '$ your turn_' : '$ can you get further?_', left, 530, 3, GREEN);
  const site = 'survive-coders.vercel.app';
  font.text(img, site, FRAME.x0 + FRAME.w - 24 - font.width(site, 2), 548, 2, GRAY);
  return img;
}
