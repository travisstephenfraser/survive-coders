import PlayScene from './PlayScene.js';
import Hydra from '../entities/Hydra.js';
import { MAX_HP } from '../util.js';

const ARENA = [
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#...===............#',
  '#..................#',
  '#.......===........#',
  '#..................#',
  '#==................#',
  '#.P................#',
  '####################',
  '####################',
];

export default class BossHQ extends PlayScene {
  constructor() {
    super('BossHQ');
  }

  create() {
    this.registry.set('level', '~/anthropic-hq');
    this.registry.set('hp', MAX_HP); // checkpoint heal before the boss
    if (this.registry.get('stars') === undefined) this.registry.set('stars', 0);

    if (this.textures.exists('pack_scifi_bg')) {
      this.add.tileSprite(0, 0, 320, 192, 'pack_scifi_bg').setOrigin(0).setTint(0x4a4e66).setDepth(-10);
    }

    this.buildWorld(ARENA, 'hq');
    if (this.textures.exists('pack_scifi_props')) {
      for (const [x, f] of [[40, 4], [60, 8], [76, 9], [132, 0], [148, 1], [196, 4]]) {
        this.add.image(x, 152, 'pack_scifi_props', f).setDepth(-4);
      }
    }
    this.hydra = new Hydra(this, 272, 160);
    this.playMusic('music_boss', 0.3);
  }

  update(time) {
    super.update(time);
    this.hydra.update();
  }

  win() {
    this.cameras.main.fadeOut(500);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('HUD');
      this.scene.start('End', { win: true });
    });
  }
}
