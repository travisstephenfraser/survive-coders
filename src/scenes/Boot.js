import Phaser from 'phaser';
import { buildTextures } from '../sprites.js';
import { buildBackdrops } from '../backdrops.js';
import { buildPixelFont } from '../font.js';
import { buildHQTextures } from '../hqArt.js';
import { buildParkTextures } from '../parkArt.js';
import { buildTowerTextures } from '../towerArt.js';

// Asset-pack art (Ninja Adventure, CC0). Missing files are fine: code-drawn sprites cover
// every key.
const SHEETS = [
  ['pack_slime', 'assets/ninja/slime.png'],
  ['pack_skull', 'assets/ninja/skull.png'],
];
const SFX = ['shoot', 'jump', 'hit', 'kill', 'hurt', 'star', 'ship', 'rollback', 'refactor', 'flood', 'gaslight', 'grow', 'headkill', 'start', 'split', 'win', 'lose'];
const MUSIC = ['music_level', 'music_boss'];

export default class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const bar = this.add.rectangle(330, 268, 0, 6, 0xd97757).setOrigin(0, 0.5);
    this.add.rectangle(330, 268, 300, 6).setOrigin(0, 0.5).setStrokeStyle(2, 0x6b3b2b);
    this.load.on('progress', (p) => (bar.width = 300 * p));
    this.load.image('font8_src', 'assets/ninja/font8x8.png');
    this.load.on('loaderror', (file) => console.info(`[assets] ${file.key} missing, using fallback`));
    for (const [key, url] of SHEETS) this.load.spritesheet(key, url, { frameWidth: 16, frameHeight: 16 });
    for (const k of SFX) this.load.audio(k, `assets/audio/${k}.wav`);
    for (const k of MUSIC) this.load.audio(k, `assets/audio/${k}.mp3`);
  }

  create() {
    buildPixelFont(this);
    buildTextures(this);
    buildBackdrops(this);
    buildHQTextures(this);
    buildParkTextures(this);
    buildTowerTextures(this);
    // Furbies: 32x16 canvases holding two 16x16 frames (open, blink).
    for (const k of ['furby_pink', 'furby_teal', 'furby_gold']) {
      const tex = this.textures.get(k);
      if (!tex.has(1)) {
        tex.add(0, 0, 0, 0, 16, 16);
        tex.add(1, 0, 16, 0, 16, 16);
      }
      this.anims.create({
        key: `${k}_blink`,
        frames: [
          { key: k, frame: 0, duration: 2400 },
          { key: k, frame: 1, duration: 140 },
        ],
        repeat: -1,
      });
    }
    this.scene.start('Title');
  }
}
