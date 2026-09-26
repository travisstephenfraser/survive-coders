import { uiText } from './util.js';

// A macOS-style terminal window frame for full-screen UI scenes.
export function terminalWindow(scene, title) {
  const x = 40;
  const y = 30;
  const w = 880;
  const h = 480;
  scene.add.rectangle(x, y, w, h, 0x0d0d0d).setOrigin(0).setStrokeStyle(2, 0xd97757);
  scene.add.rectangle(x, y, w, 30, 0x1c1c1f).setOrigin(0);
  scene.add.rectangle(x, y + 30, w, 2, 0xd97757).setOrigin(0);
  [0xff5f57, 0xfebc2e, 0x28c840].forEach((c, i) => scene.add.circle(x + 20 + i * 20, y + 15, 6, c));
  uiText(scene, x + w / 2, y + 15, title, { size: 16, color: '#8b8b8b', ox: 0.5, oy: 0.5 });
  return { x, y, w, h };
}

export const CREDITS = 'art/audio: Ninja Adventure by Pixel-boy & AAA (CC0)';
