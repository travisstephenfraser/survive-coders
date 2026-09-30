import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { Raster } from '../../shared/pixelCard.js';

// PNG in and out for shared/pixelCard.js rasters: 8-bit RGBA, no dependencies. Used by the card
// function and by scripts/make-images.mjs.

export function decodePng(buf) {
  buf = Buffer.from(buf);
  const idat = [];
  let w;
  let h;
  for (let pos = 8; pos < buf.length; ) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      [w, h] = [body.readUInt32BE(0), body.readUInt32BE(4)];
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('PNG must be 8-bit RGBA, not interlaced');
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

// `level` trades time for size: 9 for the committed images, a faster level for cards drawn on
// request.
export function encodePng(img, { level = 9 } = {}) {
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
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
