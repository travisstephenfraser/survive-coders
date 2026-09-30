import Phaser from 'phaser';
import PlayScene from './PlayScene.js';
import Hydra from '../entities/Hydra.js';
import { floatText, jokeText, worldText } from '../util.js';
import { run } from '../run.js';
import { shake } from '../fx.js';

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
    run.split('boss', this.registry.get('stars') ?? 0);
    this.leaving = false;
    this.registry.set('level', '~/anthropic-hq');
    this.checkpoint(); // heal before the boss; a retry restores the stars and MAX carried in

    this.buildWorld(ARENA, 'hq');
    this.decorate();
    this.hydra = new Hydra(this, 272, 160);
    if (this.registry.get('bossIntroSeen')) {
      this.playMusic('music_boss', 0.3);
      this.introCard(1100); // retries: short card only
    } else {
      this.registry.set('bossIntroSeen', true);
      this.stagedEntrance();
    }
  }

  // First attempt only: the office goes quiet, the terminal asks for one small change, and
  // each head answers in character before the fight starts.
  stagedEntrance() {
    const REPLIES = [
      ['flood', 'Sure! Rewriting the whole repo.'],
      ['gaslight', "You're absolutely right!"],
      ['spawn', 'Also added 14 features ✓'],
    ];
    const TYPE_MS = 34;
    const cmd = '$ claude "make one small change"';
    const typedAt = 300 + cmd.length * TYPE_MS;
    const cardAt = typedAt + 500 + REPLIES.length * 650;
    this.hydra.dormantUntil = this.time.now + cardAt + 2600;

    const hush = this.add.rectangle(0, 0, 320, 192, 0x0d0d0d, 0.6).setOrigin(0).setDepth(55);
    const line = worldText(this, 24, 64, '', { color: '#d97757', ox: 0, depth: 60 });
    let n = 0;
    this.time.addEvent({
      delay: TYPE_MS,
      startAt: 0,
      repeat: cmd.length - 1,
      callback: () => line.setText(cmd.slice(0, ++n) + (n < cmd.length ? '_' : '')),
    });
    this.time.delayedCall(300, () => this.sfx('start', 0.4));

    REPLIES.forEach(([role, text], i) => {
      this.time.delayedCall(typedAt + 500 + i * 650, () => {
        const h = this.hydra.heads.find((x) => x.role === role && x.active);
        if (!h) return;
        const b = worldText(this, Phaser.Math.Clamp(h.x, 70, 250), this.hydra.bubbleY(h), text, { color: '#0d0d0d', bg: '#f5f5f5', depth: 61 });
        this.sfx('hit', 0.25);
        this.time.delayedCall(cardAt - (typedAt + 500 + i * 650) + 200, () => b.destroy());
      });
    });

    this.time.delayedCall(cardAt, () => {
      this.tweens.add({ targets: [hush, line], alpha: 0, duration: 400, onComplete: () => (hush.destroy(), line.destroy()) });
      this.playMusic('music_boss', 0.3);
      this.introCard(2600);
    });
  }

  // Boss title card; the Hydra holds its attacks until it clears.
  introCard(INTRO_MS) {
    this.hydra.dormantUntil = Math.max(this.hydra.dormantUntil, this.time.now + INTRO_MS);
    const card = worldText(this, 160, 84, 'CONTEXT ROT HYDRA', { color: '#e5534b', size: 14, bg: '#0d0d0d', depth: 60 });
    const sub = worldText(this, 160, 104, 'it remembers everything. wrongly.', { color: '#f5f5f5', bg: '#0d0d0d', depth: 60 });
    shake(this.cameras.main, 300, 0.004);
    this.sfx('grow', 0.5);
    this.tweens.add({
      targets: [card, sub],
      alpha: 0,
      delay: INTRO_MS - 500,
      duration: 500,
      onComplete: () => {
        card.destroy();
        sub.destroy();
        this.toast('Heads grow every turn. "refactor" shrinks them', 'refactor', 4500);
      },
    });
  }

  // Refactor on the boss: heads shrink back (Head.onRefactor); say so, truthfully. The growth
  // schedule itself is not reset, so the HUD countdown keeps running.
  onRefactor() {
    if (!this.hydra?.alive.length) return;
    floatText(this, 200, 72, 'context compacted', '#3fb950');
    this.hydra.publish();
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

  furbyChatter(f = Phaser.Utils.Array.GetRandom(this.furbies)) {
    const phrase = Phaser.Utils.Array.GetRandom(['kah may-may!', 'u-nye loo-lay doo?', 'dah a-loh u-tye!', 'wee-tah-kah-loo-loo', 'kah dah boh-bay!']);
    jokeText(this, f.x, f.y - 20, phrase, '#ff9ecf');
    this.tweens.add({ targets: f, y: f.y - 3, duration: 120, yoyo: true, repeat: 1 });
  }

  update(time) {
    super.update(time);
    this.hydra.update();
    const p = this.player;
    for (const f of this.furbies) {
      if (!f.petted && Math.abs(f.x - p.x) < 10 && Math.abs(f.y - 8 - p.y) < 16) {
        f.petted = true;
        this.addStars(5, f.x, f.y - 20);
        this.sfx('star', 0.4);
        this.furbyChatter(f);
      }
    }
  }

  // The run clock stops the moment the Hydra falls; its stars keep landing for a moment after,
  // and End reads them there.
  endEncounter(result) {
    if (!super.endEncounter(result)) return false;
    if (result === 'win') run.finish();
    return true;
  }

  win() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(500);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('HUD');
      this.scene.start('End', { win: true });
    });
  }
}
