import Phaser from 'phaser';
import PlayScene from './PlayScene.js';
import { LAYERS, TROLLEYS } from '../backdrops.js';
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
  '............***.............*......S...................=====..*.......................B.....................................',
  '...........=====...........*.*..======....**.................*.*.....................###....................................',
  '..........................*...*..........####...............*...*.................######....................................',
  '..P..***.........B.......................####...B.B.B.B.............G.....S....#########.............B....G....S..***...D...',
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

    // Trolleys ride the near-layer street; they share its parallax plus their own motion.
    const near = LAYERS.find((l) => l.key === 'bg_near');
    this.trolleys = this.textures.exists('trolley')
      ? TROLLEYS.map((t) => ({
          ...t,
          f: near.f,
          img: this.add.image(0, 180 + 150, 'trolley').setOrigin(0.5, 1).setScrollFactor(0).setDepth(-10).setAlpha(near.alpha).setFlipX(t.dir < 0),
        }))
      : [];

    this.buildWorld(SUBURBS, 'suburbs');

    worldText(this, 60, 92, '$ claude "make one small change"', { color: '#d97757', size: 6, depth: 2 });
    this.sign(24, 118, 'DALY CITY');
    this.sign(520, 118, 'OUTER SUNSET');
    this.sign(1150, 118, 'TWIN PEAKS');
    this.sign(1610, 118, 'THE MISSION');

    const d = this.spawns.find((s) => s.ch === 'D');
    // Exit triggers on crossing the door's x at any height, so hopping over it still counts.
    this.door = this.add.image(d.x, d.y - 8, 'door');
    worldText(this, d.x, d.y - 32, 'SOMA: Anthropic HQ →', { color: '#3fb950', bg: '#0d0d0d', size: 6, depth: 2 });
    this.playMusic('music_level', 0.28);
    this.registry.set('toast', null);
    // x-position beats: [worldX, text, power to pulse]
    this.beats = [
      [70, 'SPACE fires prompts at bad prompts', null],
      [640, 'Swarmed? HOLD M, say "refactor" (or press 3)', 'refactor'],
      [1200, 'Low on HP? HOLD M, say "rollback" (or 2)', 'rollback'],
      [1760, 'Boss ahead. HOLD M, say "ship it" (or 1)', 'ship'],
    ];
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.leaving && !this.player.dead && this.player.x >= this.door.x - 4) this.exit();
    while (this.beats.length && this.player.x >= this.beats[0][0]) {
      const [, text, power] = this.beats.shift();
      this.toast(text, power);
    }
    const x = this.cameras.main.worldView.x;
    for (const l of this.parallax) l.ts.tilePositionX = x * l.f + (l.drift ? time * l.drift : 0);
    const span = 320 + 140; // wrap just outside the view on both sides
    for (const t of this.trolleys) {
      const vx = Phaser.Math.Wrap(t.x0 + t.dir * t.speed * time * 3 - x * t.f, -70, span - 70);
      t.img.x = 320 + vx; // scrollFactor-0 objects: x=320 is the view's left edge at 3x zoom
    }
  }

  exit() {
    if (this.leaving) return;
    this.leaving = true;
    this.player.body.enable = false;
    this.cameras.main.fadeOut(500);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('BossHQ'));
  }
}
