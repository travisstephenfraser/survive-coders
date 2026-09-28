import Phaser from 'phaser';
import { inject } from '@vercel/analytics';
import Boot from './scenes/Boot.js';
import Songs from './scenes/Songs.js';
import Title from './scenes/Title.js';
import Level1 from './scenes/Level1.js';
import Park from './scenes/Park.js';
import Tower from './scenes/Tower.js';
import Elevator from './scenes/Elevator.js';
import Chute from './scenes/Chute.js';
import Landing from './scenes/Landing.js';
import Terminal from './scenes/Terminal.js';
import BossHQ from './scenes/BossHQ.js';
import HUD from './scenes/HUD.js';
import End from './scenes/End.js';
import Cine from './scenes/Cine.js';
import { params } from './util.js';
import { CRTPipeline } from './fx.js';
import { voice } from './voice.js';

inject();

// 960x540 canvas; world scenes zoom 3x onto a 320x180 16-bit-style view.
window.game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#0d0d0d',
  pixelArt: true,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 600 }, debug: params.has('debug') } },
  input: { activePointers: 3 }, // canvas taps (powers, talk, pause) alongside other fingers
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  pipeline: { CRTPipeline },
  scene: [Boot, Songs, Title, Level1, Park, Tower, Elevator, Chute, Landing, BossHQ, HUD, Cine, Terminal, End],
});

// Keep the canvas fitted after a phone turns. Phaser's orientation listener refits using the
// parent size from before the turn, then records the new size inside that same refresh
// (ScaleManager.updateScale re-reads the parent), so its own poll never sees a change and
// the canvas stays fitted to the old orientation. Reproduced in iPhone emulation with a
// landscape-portrait-landscape round trip. Refit whenever the canvas no longer fits.
setInterval(() => {
  const s = window.game.scale;
  s.getParentBounds();
  const { width: pw, height: ph } = s.parentSize;
  if (!pw || !ph) return;
  const fit = Math.min(pw / s.gameSize.width, ph / s.gameSize.height);
  if (Math.abs(s.displaySize.width - s.gameSize.width * fit) >= 1) s.refresh();
}, 250);

if (import.meta.env.DEV) window.voice = voice; // debugging hook for dev builds only
