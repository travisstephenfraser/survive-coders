import Phaser from 'phaser';
import PlayScene from './PlayScene.js';
import { PARK_LAYERS } from '../backdrops.js';
import { Founder, VestedBro } from '../entities/enemies.js';
import { TILE, floatText, worldText } from '../util.js';
import { TOUCH } from '../touch.js';

// Legend: # ground (lawn over the Transit Center roof), = planter, P player, * star, F founder,
// V vested bro, J Zone 2 jogger, W bus fountain jet, [ ] the amphitheater's walls (demo day
// locks you in), D the Salesforce Tower lobby doors.
const PARK = [
  '....................................................................................................................................',
  '....................................................................................................................................',
  '....................................................................................................................................',
  '..................................................................................*.................................................',
  '...........................................................................****.............**......................................',
  '...........................................................................====...*.........##............=====.....................',
  '........................****..................................***...........................##......................................',
  '........................====..................................===.................*.........##......====.........====...............',
  '............................................................................................##......................................',
  '...P..***.........F...............F.....***...V.............J.............W....V..W.......W.##..[........................]..**..D...',
  '####################################################...###############################...###########################################',
  '####################################################...###############################...###########################################',
];

// Bus fountain: the real one (Ned Kahn's, 247 geysers in a line) fires as buses pass through
// the terminal underneath, so each bus sets the jets off in a wave along the path.
const JET_H = 92;
const JET_LAUNCH = -440; // ~6 tiles up, more than a jump
const BUS_STEP_MS = 400; // the wave's pace: one jet to the next as the bus drives under

// Demo day: waves of [column, enemy] (dropped in clear of the judges' stage), and what the judges think of each one you take out.
const WAVES = [
  [[101, Founder], [113, Founder], [118, Founder]],
  [[99, Founder], [114, VestedBro], [119, Founder]],
];
const JUDGE_CARDS = ['pre-revenue', "where's the moat?", 'is it AI?', '10/10 if agents', 'pass', 'love the energy', 'too early for us'];

export default class Park extends PlayScene {
  constructor() {
    super('Park');
  }

  create() {
    this.registry.set('level', '~/sf/salesforce-park → salesforce-tower');
    this.registry.set('boss', null);
    this.checkpoint();

    this.buildParallax(PARK_LAYERS);
    this.buildWorld(PARK, 'park');

    this.buildLandmarks();
    this.sign(88, 112, 'SALESFORCE PARK', '#3fb950');
    this.sign(244, 118, 'NO PITCHING', '#e5534b');
    this.sign(520, 118, 'ZONE 4: SERIES A FERNS', '#3fb950');
    this.sign(690, 118, 'PLAY AREA: FOUNDERS WELCOME', '#e3b341');
    this.sign(1130, 110, 'NEXT BUS: 2 MIN (PROBABLY)', '#e3b341');
    this.buildJets();
    this.buildArena();
    // The tower's floors come next; until then its lobby leads to the Hydra.
    const door = this.buildExit('tower_lobby', 'BossHQ');
    worldText(this, door.x - 16, door.ground - 66, 'SALESFORCE TOWER', { color: '#f5f5f5', bg: '#0d0d0d', depth: 0 });

    this.playMusic('music_level', 0.28);
    this.registry.set('toast', null);
    // x-position beats: [worldX, keyboard text, touch text (if different), power to pulse]
    this.beats = [
      [13 * TILE, 'Founders grab you for a demo. Mash JUMP to get out', 'Founders grab you for a demo. Mash to get out', null],
      [40 * TILE, "Vested bros can't be hurt until they hit the cliff", null, null],
      [55 * TILE, "Joggers won't hurt you. They just lap you", null, null],
      [70 * TILE, 'Buses below fire the fountains. Ride one up', null, null],
    ];
    if (!this.registry.get('parkIntroSeen')) this.playIntro();
  }

  update(time, delta) {
    super.update(time, delta);
    this.scrollParallax(time);
    if (this.cutscene) {
      this.updateIntro(time);
      return;
    }
    this.updateJets(time);
    this.updateArena(time);
    while (this.beats.length && this.player.x >= this.beats[0][0]) {
      const [, keys, taps, power] = this.beats.shift();
      this.toast(TOUCH && taps ? taps : keys, power);
    }
  }

  // ---- The real park, walking west from the gondola (the layouts in feed/sfpark): the Light
  // Column's Oculus on its glass floor, the Main Plaza and its cafe, the children's play area,
  // picnics on the Central Lawn, the West Skylight behind the bus fountain, and the
  // amphitheater's terracotta wall and lawn chairs. ----
  buildLandmarks() {
    const ground = 10 * TILE; // the lawn's top edge
    const prop = (key, x, depth = -2) => this.add.image(x, ground, key).setOrigin(0.5, 1).setDepth(depth);
    // The gondola's station: its cable climbs out of Mission & Fremont, off the map's left edge.
    const station = this.add.graphics().setDepth(-1);
    station.lineStyle(1, 0x5a5a62).lineBetween(-120, ground + 122, 44, ground - 40);
    station.fillStyle(0x34343c).fillRect(43, ground - 42, 3, 42);
    station.fillStyle(0xdfe3dc).fillRect(36, ground - 44, 18, 2);
    // Paving over the lawn's grass: glass panels around the Oculus, stone across the Main Plaza.
    const floor = this.add.graphics().setDepth(0.5);
    for (let x = 128; x < 232; x += 8) {
      floor.fillStyle(0x8fc6de).fillRect(x, ground, 8, 6);
      floor.fillStyle(0xd6f1fc).fillRect(x, ground, 7, 1);
      floor.fillStyle(0x5f7c8a).fillRect(x + 7, ground, 1, 6);
    }
    for (let x = 232; x < 528; x += 8) {
      floor.fillStyle(0xa9a497).fillRect(x, ground, 8, 6);
      floor.fillStyle(0xcfcabd).fillRect(x, ground, 7, 1);
      floor.fillStyle(0x7d786d).fillRect(x + 7, ground, 1, 6).fillRect(x, ground + 3, 8, 1);
    }
    prop('oculus', 180);
    prop('cafe', 336);
    worldText(this, 336, ground - 29, 'OAT MILK ONLY', { color: '#a8905e', bg: '#0d0d0d', depth: -1.5 });
    prop('play_frame', 668);
    // Picnic blankets on the Central Lawn.
    const picnic = this.add.graphics().setDepth(0.5);
    for (const [x, color] of [[912, 0xe5534b], [1014, 0x3b6fd8], [1090, 0xe5534b]]) {
      for (let i = 0; i < 12; i++) picnic.fillStyle(i % 2 ? 0xf5f5f5 : color).fillRect(x + i, ground - 1, 1, 2);
      picnic.fillStyle(0xa8703e).fillRect(x + 8, ground - 4, 4, 3); // a basket
    }
    prop('skylight', 1256);
    prop('amphi_wall', 1736, -3);
    for (const x of [1600, 1822, 1918]) prop('chairs', x);
  }

  // ---- Bus fountain jets: idle, a rumble under the grate, then a column that launches you. ----
  buildJets() {
    this.jets = this.spawns
      .filter((s) => s.ch === 'W')
      .map((s, i) => {
        const ground = s.y + TILE / 2;
        const grate = this.add.graphics().setDepth(2);
        grate.fillStyle(0x1a1a1e).fillRect(s.x - 7, ground - 1, 14, 3);
        grate.fillStyle(0x5a5a62);
        for (let x = -6; x < 7; x += 3) grate.fillRect(s.x + x, ground - 1, 1, 3);
        return { x: s.x, ground, g: this.add.graphics().setDepth(3), state: 'idle', until: Infinity, since: 0 };
      })
      .sort((a, b) => a.x - b.x);
    this.nextBus = this.time.now + 1200;
  }

  updateJets(time) {
    const p = this.player;
    const cam = this.cameras.main;
    if (time > this.nextBus) {
      this.jets.forEach((j, i) => {
        j.state = 'idle';
        j.until = time + i * BUS_STEP_MS;
      });
      this.nextBus = time + Phaser.Math.Between(4800, 6800); // the schedule is a suggestion
    }
    for (const j of this.jets) {
      if (time > j.until) {
        j.since = time;
        if (j.state === 'idle') {
          j.state = 'rumble';
          j.until = time + 800;
        } else if (j.state === 'rumble') {
          j.state = 'fire';
          j.until = time + 1500;
          if (Math.abs(j.x - cam.midPoint.x) < 200) this.sfx('flood', 0.25);
        } else {
          j.state = 'idle';
          j.until = Infinity; // until the next bus
        }
      }
      const g = j.g.clear();
      if (j.state === 'rumble') {
        g.fillStyle(0x9fd8ff);
        for (let i = 0; i < 4; i++) g.fillRect(j.x - 5 + ((time / 60 + i * 3) % 10), j.ground - 2 - ((time / 40 + i * 5) % 6), 1, 1);
      } else if (j.state === 'fire') {
        const h = Math.round(JET_H * Math.min(1, (time - j.since) / 160) * (0.94 + 0.06 * Math.sin(time / 40)));
        g.fillStyle(0x58a6ff, 0.55).fillRect(j.x - 5, j.ground - h, 10, h);
        g.fillStyle(0x9fd8ff, 0.8).fillRect(j.x - 3, j.ground - h, 6, h);
        g.fillStyle(0xf5f5f5, 0.9).fillRect(j.x - 1, j.ground - h, 2, h);
        for (let i = 0; i < 5; i++) {
          const a = time / 90 + i * 1.3;
          g.fillRect(Math.round(j.x + Math.sin(a) * 7), Math.round(j.ground - h - 2 + Math.cos(a * 1.7) * 2), 2, 2);
        }
        // Launches from the grate only (standing on it, or coming back down onto it), so
        // falling through the column's top doesn't compound into a second launch.
        if (!p.dead && Math.abs(p.x - j.x) < 8 && p.body.bottom > j.ground - 20 && p.body.bottom <= j.ground + 2) p.launch(JET_LAUNCH);
      }
    }
  }

  // ---- The amphitheater: demo day locks you in until every pitch is dealt with. ----
  buildArena() {
    const l = this.spawns.find((s) => s.ch === '[');
    const r = this.spawns.find((s) => s.ch === ']');
    const a = { x0: l.x - TILE / 2, x1: r.x + TILE / 2, state: 'open', wave: 0, foes: [], nextWaveAt: 0 };
    this.arena = a;
    worldText(this, (a.x0 + a.x1) / 2 - 64, 48, 'DEMO DAY', { color: '#d97757', size: 14, bg: '#0d0d0d', depth: 0 });
    // Judges behind a table at the back of the stage.
    const stageTop = 5 * TILE;
    this.judges = [107, 108, 109].map((col) => this.add.image(col * TILE + TILE / 2, stageTop - 12, 'judge').setDepth(1));
    const table = this.add.graphics().setDepth(2);
    table.fillStyle(0xe8e4dc).fillRect(106 * TILE + 8, stageTop - 6, 3 * TILE + 16, 2);
    table.fillStyle(0x5e3b21).fillRect(106 * TILE + 8, stageTop - 4, 3 * TILE + 16, 4);
    this.ropes = this.add.graphics().setDepth(2);
  }

  updateArena(time) {
    const a = this.arena;
    const p = this.player;
    if (a.state === 'open' && !p.dead && p.x > a.x0 + 24) this.lockArena(time);
    if (a.state !== 'locked') return;
    // Laser-rope walls, flickering.
    this.ropes.clear();
    this.ropes.fillStyle(0xe5534b, 0.35 + 0.2 * Math.sin(time / 90));
    for (const x of [a.x0, a.x1 - 2]) for (let y = 0; y < this.worldH; y += 6) this.ropes.fillRect(x, y, 2, 3);
    for (const f of a.foes) {
      if (!f.active && !f.scored) {
        f.scored = true;
        this.judgeCard();
      }
    }
    if (a.foes.every((f) => !f.active) && time > a.nextWaveAt) {
      if (a.wave < WAVES.length) this.spawnWave(time);
      else this.clearArena();
    }
  }

  lockArena(time) {
    const a = this.arena;
    a.state = 'locked';
    a.nextWaveAt = time + 700;
    a.walls = [a.x0, a.x1].map((x) => {
      const z = this.add.zone(x, this.worldH / 2, 6, this.worldH * 2);
      this.physics.add.existing(z, true);
      return z;
    });
    a.collider = this.physics.add.collider([this.player, this.enemies], a.walls);
    this.toast(TOUCH ? 'Demo day! Clear the stage. Tap "ship it"' : 'Demo day! Clear the stage. "ship it" helps (1)', 'ship');
  }

  spawnWave(time) {
    const a = this.arena;
    const wave = WAVES[a.wave++];
    a.foes = wave.map(([col, E]) => new E(this, col * TILE + TILE / 2, 24));
    a.nextWaveAt = time + 900;
    if (a.wave > 1) this.toast('Round 2: the vest round');
  }

  judgeCard() {
    const j = Phaser.Utils.Array.GetRandom(this.judges);
    const card = worldText(this, j.x, j.y - 14, Phaser.Utils.Array.GetRandom(JUDGE_CARDS), { color: '#0d0d0d', bg: '#f5f5f5', depth: 46 });
    this.tweens.add({ targets: card, y: card.y - 4, alpha: 0, delay: 1200, duration: 400, onComplete: () => card.destroy() });
  }

  clearArena() {
    const a = this.arena;
    a.state = 'done';
    this.physics.world.removeCollider(a.collider);
    for (const z of a.walls) z.destroy();
    this.ropes.clear();
    this.sfx('start', 0.5);
    this.addStars(5, this.player.x, this.player.y - 14);
    floatText(this, this.player.x, this.player.y - 24, 'accepted!', '#3fb950');
    this.toast('Congrats, you got into YC. (Your Coffee)');
  }

  // ---- Intro: the gondola up from Mission St, sharing the cabin with a founder. ----
  playIntro() {
    this.registry.set({ parkIntroSeen: true, cutscene: true });
    this.cutscene = true;
    const p = this.player;
    p.setVisible(false).body.enable = false;
    p.laptop.setVisible(false);
    this.scene.setVisible(false, 'HUD');
    this.scene.launch('Cine');
    this.scene.bringToTop('Cine');
    const cine = this.scene.get('Cine');

    // The cabin rides its cable up from Mission & Fremont, at the park's east end, and docks
    // at the station on the lawn.
    const DOCK = { x: 30, y: 160 - 14 };
    const FROM = { x: DOCK.x - 120, y: DOCK.y + 120 }; // the grip (14px above centre) stays on the cable
    this.gondola = this.add.image(FROM.x, FROM.y, 'gondola').setDepth(6);
    this.tweens.add({ targets: this.gondola, x: DOCK.x, y: DOCK.y, duration: 4200, ease: 'Sine.out' });

    const at = (ms, fn) => this.introEvents.push(this.time.delayedCall(ms, fn));
    this.introEvents = [];
    at(400, () => cine.say('FOUNDER', "Since we're stuck in this gondola for 90 seconds..."));
    at(2700, () => cine.say('FOUNDER', 'ever heard of Uber for gondolas?'));
    at(4400, () => {
      this.sfx('start', 0.4);
      p.setPosition(DOCK.x + 12, 150).setVisible(true);
      p.body.enable = true;
      p.setVelocity(40, -140);
      p.laptop.setPosition(p.x, p.y + 6).setVisible(true);
    });
    at(5000, () => cine.say('FOUNDER', "We're pre-revenue but post-vibes. I'll circle back!"));
    at(6900, () => {
      cine.say(null, null);
      this.tweens.add({ targets: this.gondola, x: FROM.x, y: FROM.y, duration: 2400, ease: 'Sine.in' });
    });
    at(7300, () => cine.phone('are you close?? demo is in 20 min'));
    at(9200, () => this.endIntro());

    this.skipIntro = () => this.endIntro();
    for (const k of ['keydown-ENTER', 'keydown-SPACE', 'keydown-ESC']) this.input.keyboard.once(k, this.skipIntro);
    this.input.once('pointerdown', this.skipIntro);
  }

  updateIntro(time) {
    // HUD launch is queued and starting a scene makes it visible again; keep it hidden.
    if (this.scene.isVisible('HUD')) this.scene.setVisible(false, 'HUD');
    if (this.player.visible) this.player.laptop.follow(time);
  }

  endIntro() {
    if (!this.cutscene) return;
    this.cutscene = false;
    this.registry.set('cutscene', false);
    for (const e of this.introEvents) e.remove(false);
    for (const k of ['keydown-ENTER', 'keydown-SPACE', 'keydown-ESC']) this.input.keyboard.off(k, this.skipIntro);
    this.input.off('pointerdown', this.skipIntro);
    this.tweens.killTweensOf(this.gondola);
    this.gondola.destroy();
    const p = this.player;
    if (!p.visible) {
      const spawn = this.spawns.find((sp) => sp.ch === 'P');
      p.setPosition(spawn.x, spawn.y);
    }
    p.setVisible(true).body.enable = true;
    p.laptop.setVisible(true);
    this.scene.setVisible(true, 'HUD');
    const cine = this.scene.get('Cine');
    if (cine?.top) cine.close();
    else this.scene.stop('Cine'); // skipped before the overlay finished starting
  }
}
