import Phaser from 'phaser';
import PlayScene from './PlayScene.js';
import { TOWER_VIEW } from '../backdrops.js';
import { CEILING } from '../towerArt.js';
import { ChatbotAgent, CrmAgent } from '../entities/enemies.js';
import { TILE, floatText, worldText } from '../util.js';
import { TOUCH } from '../touch.js';

// Legend: # floor slab (carpet on top), = standing desk, P player, * star, A CRM agent,
// C chatbot, D the elevator (floors 59 and 60; the Ohana Floor has no way out but the glass).
const FLOORS = {
  59: {
    title: 'FLOOR 59 · SDR BULLPEN',
    map: [
      '....................................................................',
      '....................................................................',
      '....................................................................',
      '....................................................................',
      '..............................***...................................',
      '..............................===...................................',
      '...........****................................****.................',
      '...........====.........====........====.......====.................',
      '....................................................................',
      '..P...***.......A.............A...........A..........A..........D...',
      '####################################################################',
      '####################################################################',
    ],
  },
  60: {
    title: 'FLOOR 60 · DREAMFARCE DEMO CENTER',
    map: [
      '........................................................................',
      '........................................................................',
      '........................................................................',
      '........................................................................',
      '.................................***....................................',
      '....................C............===....................C...............',
      '............****........................C.........****..................',
      '............====............====..................====..................',
      '........................................................................',
      '..P........................A..................A...........A...**....D...',
      '########################################################################',
      '########################################################################',
    ],
  },
  61: {
    title: 'FLOOR 61 · OHANA',
    map: [
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............***..............***............',
      '............===..............===............',
      '............................................',
      '...P........................................',
      '############################################',
      '############################################',
    ],
  },
};

// The Ohana Floor's all-hands: waves of [column, enemy], then the sales team closes in.
const OHANA_WAVES = [
  [[30, CrmAgent], [18, ChatbotAgent]],
  [[8, CrmAgent], [36, CrmAgent], [24, ChatbotAgent]],
];
// Until the parachute level lands, the leap out of the Ohana Floor comes down at HQ.
const AFTER_LEAP = 'BossHQ';

// Salesforce Tower, one floor per run of the scene: 59 and 60 end at the elevator, whose ride
// (the Elevator scene) starts the next floor; 61 ends in a leap through the glass. Each floor is
// a checkpoint, and a retry restarts the floor you died on.
export default class Tower extends PlayScene {
  constructor() {
    super('Tower');
  }

  create(data) {
    const floor = data?.floor ?? this.registry.get('towerFloor') ?? 59;
    this.floor = floor;
    // Phaser reuses the scene instance from floor to floor: nothing carries over.
    this.ohana = null;
    this.gong = null;
    this.glass = null;
    this.arrow = null;
    this.registry.set('towerFloor', floor);
    this.registry.set('level', floor < 61 ? `~/sf/salesforce-tower/${floor} → 61` : '~/sf/salesforce-tower/61-ohana');
    this.registry.set('boss', null);
    this.checkpoint();

    this.buildParallax(TOWER_VIEW);
    const { title, map } = FLOORS[floor];
    this.buildWorld(map, 'tower');
    // The window wall (the city shows through its glass), then each floor's own dressing.
    this.add.tileSprite(0, 0, this.worldW, this.worldH, floor === 61 ? 'ohana_wall' : 'tower_wall').setOrigin(0).setDepth(-5);
    worldText(this, 96, CEILING + 14, title, { color: '#e3b341', bg: '#0d0d0d', depth: -1 });
    if (floor === 59) this.dressBullpen();
    else if (floor === 60) this.dressDemoCenter();
    else this.dressOhana();
    if (floor < 61) {
      const door = this.buildExit('elevator_bank', 'Elevator', { data: { floor }, panel: 'elev_door', panelAlpha: 1 });
      worldText(this, door.x - 24, door.ground - 84, `ELEVATORS · ${floor + 1}-61 ↑`, { color: '#e3b341', bg: '#0d0d0d', depth: 0 });
    }

    this.playMusic('music_level', 0.28);
    this.registry.set('toast', null);
    // x-position beats: [worldX, keyboard text, touch text (if different), power to pulse]
    this.beats = {
      59: [[9 * TILE, 'CRM agents throw contracts. Jump them or get locked in', null, null]],
      60: [[8 * TILE, 'Chatbots open popups. Shoot them closed', null, null]],
      61: [],
    }[floor];
    if (floor === 61) this.startOhana();
  }

  update(time, delta) {
    super.update(time, delta);
    this.scrollParallax(time);
    if (this.ohana) this.updateOhana(time);
    if (this.ohana?.state === 'leaping') this.player.laptop.setPosition(this.player.x + 6, this.player.y - 4);
    while (this.beats.length && this.player.x >= this.beats[0][0]) {
      const [, keys, taps, power] = this.beats.shift();
      this.toast(TOUCH && taps ? taps : keys, power);
    }
  }

  // A contract landed: the bullpen's gong rings every time, and the way out is taught once a run.
  onLocked() {
    if (this.gong) {
      this.sfx('headkill', 0.3);
      floatText(this, this.gong.x, this.gong.y - 34, 'GONG!', '#e3b341');
      this.tweens.killTweensOf(this.gong);
      this.gong.setAngle(0);
      this.tweens.add({ targets: this.gong, angle: { from: -6, to: 6 }, duration: 70, yoyo: true, repeat: 3, onComplete: () => this.gong.setAngle(0) });
    }
    if (this.registry.get('lockTaught')) return;
    this.registry.set('lockTaught', true);
    this.toast(TOUCH ? 'Locked in? Tap "refactor" to void the contract' : 'Locked in? "refactor" voids the contract (or 3)', 'refactor');
  }

  // ---- Floor 59: the SDR bullpen, a gong, a leaderboard, a motivational poster. ----
  dressBullpen() {
    const ground = 10 * TILE;
    this.add.tileSprite(0, ground, 59 * TILE, 28, 'bullpen').setOrigin(0, 1).setDepth(-3);
    this.gong = this.add.image(120, ground, 'gong').setOrigin(0.5, 1).setDepth(-2);
    worldText(this, 312, 64, 'ALWAYS BE CLOSING (TICKETS)', { color: '#e5534b', bg: '#f5f5f5', depth: -4 });
    const screen = this.add.image(696, 96, 'screen').setDepth(-4); // between two desks, below the tips
    worldText(this, screen.x, screen.y - 14, 'LEADERBOARD', { tiny: true, color: '#f5f5f5', depth: -3 });
    ['1. CHAD', '2. CHAD', '3. YOU?'].forEach((row, i) => worldText(this, screen.x - 20, screen.y - 5 + i * 8, row, { color: i === 2 ? '#e3b341' : '#f5f5f5', ox: 0, depth: -3 }));
  }

  // ---- Floor 60: Dreamfarce's demo center, booth after booth. ----
  dressDemoCenter() {
    const ground = 10 * TILE;
    worldText(this, 520, 44, 'DREAMFARCE', { color: '#f5f5f5', bg: '#1f6fb5', size: 14, depth: -4 });
    for (const [x, name] of [[104, 'AGENTFARCE'], [380, 'FREE TOTES'], [700, 'CUSTOMER 360']]) {
      this.add.image(x, ground, 'booth').setOrigin(0.5, 1).setDepth(-3);
      worldText(this, x, ground - 51, name, { color: '#1f6fb5', depth: -2 });
    }
    // The totes are already gone.
    worldText(this, 380, ground - 12, 'OUT OF STOCK', { tiny: true, color: '#e5534b', depth: -2 });
  }

  // ---- Floor 61: the Ohana Floor, after the photos: living green columns, blue sofas, a
  // mottled rug, orange chairs, glass to the ceiling, and the bay beyond. ----
  dressOhana() {
    const ground = 10 * TILE;
    for (let x = 40; x < this.worldW - 60; x += 160) this.add.image(x, ground, 'green_wall').setOrigin(0.5, 1).setDepth(-4);
    this.add.image(300, ground, 'ohana_rug').setOrigin(0.5, 1).setDepth(-3);
    for (const x of [130, 470]) this.add.image(x, ground, 'sofa').setOrigin(0.5, 1).setDepth(-2);
    for (const x of [250, 600]) this.add.image(x, ground, 'lounge_chair').setOrigin(0.5, 1).setDepth(-2);
    worldText(this, this.worldW / 2, CEILING + 30, 'OHANA MEANS FAMILY (& MULTI-YEAR CONTRACTS)', { color: '#f5f5f5', bg: '#1f6fb5', depth: -4 });
    // The right-hand glass wall, floor to ceiling: the finale cracks it.
    this.glass = this.add.graphics().setDepth(3);
    this.drawGlass(false);
  }

  drawGlass(cracked) {
    const g = this.glass.clear();
    const x = this.worldW - 6;
    const ground = 10 * TILE;
    g.fillStyle(0xbfe6f5, 0.3).fillRect(x, CEILING, 6, ground - CEILING);
    g.fillStyle(0x3a3f47).fillRect(x - 1, CEILING, 1, ground - CEILING);
    if (!cracked) return;
    // Cracks radiating from the impact, pixel by pixel.
    g.fillStyle(0xf5f5f5);
    const cx = x + 3;
    const cy = 112;
    for (const [dx, dy] of [[-3, -40], [2, -30], [-2, 34], [3, 44], [-3, -8], [2, 12]]) {
      const n = Math.max(Math.abs(dx), Math.abs(dy));
      for (let i = 0; i <= n; i++) g.fillRect(Math.round(cx + (dx * i) / n + Math.sin(i / 3)), Math.round(cy + (dy * i) / n), 1, 1);
    }
  }

  // ---- The Ohana finale: two waves, then the sales team walks you to the glass. ----
  startOhana() {
    this.ohana = { state: 'waves', wave: 0, foes: [], nextAt: this.time.now + 1600 };
    this.toast('All hands on the Ohana Floor. Clear the lounge', null, 3000);
  }

  updateOhana(time) {
    const o = this.ohana;
    const p = this.player;
    if (o.state === 'waves' && o.foes.every((f) => !f.active) && time > o.nextAt) {
      if (o.wave < OHANA_WAVES.length) this.spawnOhanaWave(time);
      else this.closeIn();
    } else if (o.state === 'cracked' && !p.dead && p.x > this.worldW - 28) this.leap();
  }

  spawnOhanaWave(time) {
    const o = this.ohana;
    const wave = OHANA_WAVES[o.wave++];
    o.foes = wave.map(([col, E]) => new E(this, col * TILE + TILE / 2, E === ChatbotAgent ? 64 : 40));
    o.nextAt = time + 900;
    if (o.wave > 1) this.toast('Round 2: they looped in their manager');
  }

  closeIn() {
    const o = this.ohana;
    o.state = 'closing';
    this.toast('No exit. Only one thing left to do.', null, 6000);
    this.time.delayedCall(1200, () => {
      for (let i = 0; i < 5; i++) new CrmAgent(this, 12 + i * 16, 9 * TILE, true);
    });
    this.time.delayedCall(2800, () => {
      o.state = 'cracked';
      this.drawGlass(true);
      this.cameras.main.shake(260, 0.006);
      this.sfx('hit', 0.6);
      floatText(this, this.worldW - 20, 96, '*crack*', '#bfe6f5');
      this.arrow = worldText(this, this.worldW - 22, 128, '→', { color: '#e3b341', size: 14, depth: 4 });
      this.tweens.add({ targets: this.arrow, x: this.worldW - 16, duration: 300, yoyo: true, repeat: -1 });
    });
  }

  // Out through the glass: an arc, shards, a flash, then down to whatever's below.
  leap() {
    const o = this.ohana;
    o.state = 'leaping';
    this.leaving = true; // PlayScene stops driving the player
    const p = this.player;
    p.release();
    p.unlock();
    p.body.enable = false;
    this.tweens.killTweensOf([p, p.laptop, this.arrow].filter(Boolean));
    p.stop();
    p.setTexture('player_jump').setFlipX(false).setScale(1).setAlpha(1);
    this.arrow?.destroy();
    this.glass.clear();
    this.sfx('hit', 0.7);
    this.sfx('flood', 0.4);
    const cam = this.cameras.main;
    cam.flash(260, 255, 255, 255);
    cam.shake(260, 0.01);
    cam.setBounds(0, 0, this.worldW + 160, this.worldH); // follow them out past the glass
    // Glass everywhere, some of it back into the lounge.
    for (const [tex, n] of [['px_white', 24], ['px_cyan', 16]]) {
      this.add
        .particles(this.worldW - 3, p.y - 8, tex, {
          speedX: { min: -70, max: 170 },
          speedY: { min: -170, max: 40 },
          gravityY: 520,
          lifespan: 1300,
          scale: { start: 1, end: 0.5 },
          emitting: false,
        })
        .setDepth(20)
        .explode(n);
    }
    this.tweens.add({ targets: p, x: this.worldW + 70, duration: 1200 });
    this.tweens.add({ targets: p, angle: 300, duration: 1200 });
    this.tweens.add({
      targets: p,
      y: p.y - 34,
      duration: 380,
      ease: 'Sine.out',
      onComplete: () => this.tweens.add({ targets: p, y: p.y + 220, duration: 820, ease: 'Sine.in' }),
    });
    this.time.delayedCall(1000, () => {
      this.cameras.main.fadeOut(600, 245, 245, 245);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(AFTER_LEAP));
    });
  }
}
