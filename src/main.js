import Phaser from 'phaser';
import Boot from './scenes/Boot.js';
import Title from './scenes/Title.js';
import Level1 from './scenes/Level1.js';
import BossHQ from './scenes/BossHQ.js';
import HUD from './scenes/HUD.js';
import End from './scenes/End.js';
import Cine from './scenes/Cine.js';
import { params } from './util.js';
import { CRTPipeline } from './fx.js';
import { voice } from './voice.js';

// 960x540 canvas; world scenes zoom 3x onto a 320x180 NES-style view.
window.game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#0d0d0d',
  pixelArt: true,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 600 }, debug: params.has('debug') } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  pipeline: { CRTPipeline },
  scene: [Boot, Title, Level1, BossHQ, HUD, Cine, End],
});

if (import.meta.env.DEV) window.voice = voice; // debugging hook for dev builds only
