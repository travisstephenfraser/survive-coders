import { uiText } from './util.js';

// A macOS-style terminal window frame: full-screen for UI scenes by default, or any rect (the
// Chute's typing pane). `parts` are its game objects, for sliding the window in and out.
export function terminalWindow(scene, title, { x = 40, y = 30, w = 880, h = 480 } = {}) {
  const parts = [
    scene.add.rectangle(x, y, w, h, 0x0d0d0d).setOrigin(0).setStrokeStyle(2, 0xd97757),
    scene.add.rectangle(x, y, w, 30, 0x1c1c1f).setOrigin(0),
    scene.add.rectangle(x, y + 30, w, 2, 0xd97757).setOrigin(0),
    ...[0xff5f57, 0xfebc2e, 0x28c840].map((c, i) => scene.add.circle(x + 20 + i * 20, y + 15, 6, c)),
    uiText(scene, x + w / 2, y + 15, title, { size: 16, color: '#8b8b8b', ox: 0.5, oy: 0.5 }),
  ];
  return { x, y, w, h, parts };
}

export const CREDITS = 'art/audio: Ninja Adventure by Pixel-boy & AAA (CC0)';

// Slack-style notification card (screen space). Returns { show(text), hide() }.
export function phoneCard(scene, x, y, w, title) {
  const g = scene.add.graphics().setDepth(20);
  const head = uiText(scene, x + 14, y + 12, title, { size: 16, color: '#e3b341' }).setDepth(21);
  const body = uiText(scene, x + 14, y + 38, '', { size: 16, color: '#f5f5f5', wrap: w - 28 }).setDepth(21);
  const parts = [g, head, body];
  // The card grows with the message so wrapped lines never spill out.
  const draw = () => {
    const h = 38 + body.height + 14;
    g.clear();
    g.fillStyle(0x444c56).fillRect(x, y, w, h);
    g.fillStyle(0x1a1d21).fillRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle(0x4a154b).fillRect(x + 3, y + 3, 6, h - 6); // unread stripe
  };
  parts.forEach((o) => o.setVisible(false));
  return {
    show(text) {
      body.setText(text);
      draw();
      parts.forEach((o) => o.setVisible(true).setAlpha(1));
      scene.tweens.add({ targets: parts, x: '-=12', duration: 90, yoyo: true, repeat: 1 }); // buzz
      if (scene.cache.audio.exists('hit')) scene.sound.play('hit', { volume: 0.25 });
    },
    hide() {
      scene.tweens.add({ targets: parts, alpha: 0, duration: 250, onComplete: () => parts.forEach((o) => o.setVisible(false)) });
    },
  };
}
