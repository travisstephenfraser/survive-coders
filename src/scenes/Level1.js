import PlayScene from './PlayScene.js';
import { LAYERS } from '../backdrops.js';
import { worldText } from '../util.js';

// Legend: # ground, = neon platform, P player, * star, B Bad Prompt Blob,
// G Keyboard Goblin, S Skullops, D exit door to Anthropic HQ.
const SUBURBS = [
  '............................................................................................................................',
  '............................................................................................................................',
  '............................................................................................................................',
  '..........................................................................................****..............................',
  '.........................................................................................======.............................',
  '.................................**.*...................***.................................................................',
  '............***....................S...................=====..........................B.....................................',
  '...........=====................======....**.........................................###....................................',
  '.........................................####.....................................######....................................',
  '..P..***.........B.....G.................####...B....B..............G.....S....#########.............B....G....S..***...D...',
  '###########################...###############################...################################..##########################',
  '###########################...###############################...################################..##########################',
];

export default class Level1 extends PlayScene {
  constructor() {
    super('Level1');
  }

  create() {
    this.registry.set('level', '~/sf/daly-city → soma');
    this.registry.set('boss', null);

    // Camera-pinned parallax layers; with a 3x zoom, (320,180) is the view's top-left.
    this.parallax = LAYERS.map((l) => ({
      ...l,
      ts: this.add
        .tileSprite(320, 180 + (l.y ?? 0), 320, l.h ?? 180, l.key)
        .setOrigin(0)
        .setScrollFactor(0)
        .setAlpha(l.alpha ?? 1)
        .setDepth(-10),
    }));

    this.buildWorld(SUBURBS, 'suburbs');

    worldText(this, 60, 92, '$ claude "make one small change"', { color: '#d97757', size: 6, depth: 2 });
    this.sign(24, 118, 'DALY CITY');
    this.sign(520, 118, 'OUTER SUNSET');
    this.sign(1150, 118, 'TWIN PEAKS');
    this.sign(1610, 118, 'THE MISSION');

    const d = this.spawns.find((s) => s.ch === 'D');
    this.door = this.physics.add.staticImage(d.x, d.y - 8, 'door');
    worldText(this, d.x, d.y - 32, 'SOMA: Anthropic HQ →', { color: '#3fb950', bg: '#0d0d0d', size: 6, depth: 2 });
    this.physics.add.overlap(this.player, this.door, () => this.exit());
    this.playMusic('music_level', 0.28);
  }

  update(time, delta) {
    super.update(time, delta);
    const x = this.cameras.main.worldView.x;
    for (const l of this.parallax) l.ts.tilePositionX = x * l.f + (l.drift ? time * l.drift : 0);
  }

  exit() {
    if (this.leaving) return;
    this.leaving = true;
    this.player.body.enable = false;
    this.cameras.main.fadeOut(500);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('BossHQ'));
  }
}
