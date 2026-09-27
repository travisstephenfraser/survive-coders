import Phaser from 'phaser';
import { FONT_KEY } from './util.js';
import { ASCII, EXTRA, GLYPHS_PER_ROW } from './glyphs.js';

// 8x8 pixel font from the Ninja Adventure sheet (layout in glyphs.js). Glyphs are whitened so
// BitmapText tint can color them. Extra symbols the game needs are drawn into the unused
// cells right after '~'.

export function buildPixelFont(scene) {
  if (scene.cache.bitmapFont.exists(FONT_KEY)) return;
  const src = scene.textures.get('font8_src').getSourceImage();
  const tex = scene.textures.createCanvas('font8', src.width, src.height);
  const ctx = tex.getContext();
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] > 0) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const extras = Object.entries(EXTRA);
  ctx.fillStyle = '#ffffff';
  extras.forEach(([, rows], k) => {
    const cell = ASCII.length + k;
    const cx = (cell % GLYPHS_PER_ROW) * 8;
    const cy = Math.floor(cell / GLYPHS_PER_ROW) * 8;
    ctx.clearRect(cx, cy, 8, 8);
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && ctx.fillRect(cx + x, cy + y, 1, 1)));
  });
  tex.refresh();
  const chars = ASCII + extras.map(([c]) => c).join('');
  const font = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: 'font8',
    width: 8,
    height: 8,
    chars,
    charsPerRow: GLYPHS_PER_ROW,
    spacing: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    lineSpacing: 3,
  });
  // Proportional spacing: advance by each glyph's inked width + 1px instead of a fixed 8.
  const px = ctx.getImageData(0, 0, src.width, src.height).data;
  [...chars].forEach((ch, cell) => {
    const glyph = font.data.chars[ch.charCodeAt(0)];
    if (!glyph) return;
    const cx = (cell % GLYPHS_PER_ROW) * 8;
    const cy = Math.floor(cell / GLYPHS_PER_ROW) * 8;
    let min = 8;
    let max = -1;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (px[((cy + y) * src.width + cx + x) * 4 + 3] > 0) {
          min = Math.min(min, x);
          max = Math.max(max, x);
        }
      }
    }
    if (max < 0) glyph.xAdvance = 4; // space
    else {
      glyph.xOffset = -min;
      glyph.xAdvance = max - min + 2;
    }
  });
  scene.cache.bitmapFont.add(FONT_KEY, font);
}
