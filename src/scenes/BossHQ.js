import Phaser from 'phaser';
import PlayScene from './PlayScene.js';
import Hydra from '../entities/Hydra.js';
import { MAX_HP, floatText, worldText } from '../util.js';

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

    this.buildWorld(ARENA, 'hq');
    this.decorate();
    this.hydra = new Hydra(this, 272, 160);
    this.playMusic('music_boss', 0.3);
  }

  // Anthropic HQ interior (art from hqArt.js), plus the Furbies in Dario's office.
  decorate() {
    const has = (k) => this.textures.exists(k);
    if (has('hq_wall')) this.add.image(0, 0, 'hq_wall').setOrigin(0).setDepth(-10);
    else this.add.rectangle(0, 0, 320, 192, 0x2a1c14).setOrigin(0).setDepth(-10);

    const FLOOR = 160;
    const prop = (key, x, y = FLOOR, depth = -4) => (has(key) ? this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(depth) : null);
    prop('rug', 108, FLOOR, -5);
    prop('round_table', 100);
    prop('womb_chair', 180);
    prop('plant', 208);

    worldText(this, 100, 118, "dario's office", { color: '#e3b341', bg: '#1a120c', depth: -3 });

    const TABLETOP = FLOOR - 13; // round_table surface (local y ~11) on a 24px-tall prop
    this.furbies = [
      ['furby_gold', 92, TABLETOP],
      ['furby_pink', 110, TABLETOP],
      ['furby_teal', 148, FLOOR],
    ]
      .filter(([k]) => has(k))
      .map(([k, x, y], i) => {
        const f = this.add.sprite(x, y, k, 0).setOrigin(0.5, 1).setDepth(-3);
        f.play({ key: `${k}_blink`, delay: i * 700 });
        return f;
      });
    if (this.furbies.length) {
      this.time.addEvent({ delay: 5200, loop: true, callback: () => this.furbyChatter() });
    }
  }

  furbyChatter() {
    const f = Phaser.Utils.Array.GetRandom(this.furbies);
    const phrase = Phaser.Utils.Array.GetRandom(['kah may-may!', 'u-nye loo-lay doo?', 'dah a-loh u-tye!', 'wee-tah-kah-loo-loo', 'kah dah boh-bay!']);
    floatText(this, f.x, f.y - 20, phrase, '#ff9ecf');
    this.tweens.add({ targets: f, y: f.y - 3, duration: 120, yoyo: true, repeat: 1 });
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
