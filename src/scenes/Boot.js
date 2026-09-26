import Phaser from 'phaser';
import { buildTextures } from '../sprites.js';
import { buildBackdrops } from '../backdrops.js';
import { uiText } from '../util.js';

// Asset-pack art (Ninja Adventure CC0, Sci-Fi Starter by MarcoPG). Missing files are fine:
// code-drawn sprites cover every key.
const SHEETS = [
  ['pack_slime', 'assets/ninja/slime.png'],
  ['pack_skull', 'assets/ninja/skull.png'],
  ['pack_scifi_tiles', 'assets/scifi/tiles.png'],
  ['pack_scifi_props', 'assets/scifi/props.png'],
];
const SFX = ['shoot', 'jump', 'hit', 'kill', 'hurt', 'star', 'ship', 'rollback', 'refactor', 'flood', 'gaslight', 'grow', 'headkill', 'start', 'split', 'win', 'lose'];
const MUSIC = ['music_level', 'music_boss'];

export default class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const label = uiText(this, 480, 270, 'booting...', { size: 20, color: '#d97757', ox: 0.5, oy: 0.5 });
    this.load.on('progress', (p) => label.setText(`booting... ${Math.round(p * 100)}%`));
    this.load.on('loaderror', (file) => console.info(`[assets] ${file.key} missing, using fallback`));
    for (const [key, url] of SHEETS) this.load.spritesheet(key, url, { frameWidth: 16, frameHeight: 16 });
    this.load.image('pack_scifi_bg', 'assets/scifi/background.png');
    for (const k of SFX) this.load.audio(k, `assets/audio/${k}.wav`);
    for (const k of MUSIC) this.load.audio(k, `assets/audio/${k}.mp3`);
  }

  create() {
    buildTextures(this);
    buildBackdrops(this);
    this.scene.start('Title');
  }
}
