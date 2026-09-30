import Phaser from 'phaser';
import { voice } from '../voice.js';
import { MAX_HP, ZOOM, worldText } from '../util.js';
import { run } from '../run.js';
import { applyScreenFX, pop, shake } from '../fx.js';
import { sfx as playSfx } from '../audio.js';
import { TOUCH } from '../touch.js';
import { LAYERS, addParallax, panParallax } from '../backdrops.js';
import { OHANA, ROOF, TOWER, towerHalf } from '../chuteArt.js';
import { wind } from '../noise.js';
import { loopSong } from './Songs.js';

// The fall from the Ohana Floor. You tumble down the Salesforce Tower's face while the altimeter
// counts down, and the only way out is to get a parachute out of Claude: three lines typed into
// the terminal (the Terminal overlay, which owns the typing). Claude keeps getting it wrong: a CRM
// dashboard shaped like a canopy, then a real chute behind a paywall. "ship it" deploys it anyway,
// the fall's song cuts to the landing's (the drop), and the cut goes to the landing (Landing). At
// 0 ft you meet the Transit Center's roof, and the retry restarts the fall. Not a PlayScene, so
// there's no HUD.

export const START_FT = 1070;
const FALL_MS = 24000; // floor 61 to the roof; god mode doubles it
const VIEW_Y = 56; // where you ride in the 180px view while the tower scrolls past
const OPEN_Y = 104; // ...after the opening, which starts on the crown and lets you drop into frame
const OPEN_MS = 2200;
const GAP = 16; // how far off the glass you fall
const START_Y = OHANA.top + OHANA.h - 8; // level with floor 61 and the pane you went through
const ROOF_Y = TOWER.h - 64; // the Transit Center's railing; the street is at TOWER.h
const END_Y = ROOF_Y - 8; // your centre when your feet reach it
const ROOF_X = TOWER.cx + TOWER.base + 2;
// Falling speeds up: from 60% of the average speed to 140%.
const ease = (p) => 0.6 * p + 0.4 * p * p;
// The city rises into view as you come down: each layer sits this much lower per px still to
// fall, so from floor 61 downtown is below the terminal and the far hills barely move.
const DROP = { bg_far: 0.08, bg_fog: 0.03, bg_mid: 0.11, bg_signs: 0.11 };
const FALL_LAYERS = LAYERS.filter((l) => l.key !== 'bg_near');

export default class Chute extends Phaser.Scene {
  constructor() {
    super('Chute');
  }

  create() {
    run.split('chute', this.registry.get('stars') ?? 0);
    this.scene.stop('HUD');
    voice.release(); // a hold of M from the Ohana Floor ends here
    voice.keysSuspended = true;
    // A checkpoint, like every level after the first: a retry restores what you brought.
    const reg = this.registry;
    reg.set({ hp: MAX_HP, checkpointStars: reg.get('stars') ?? 0, checkpointTokens: reg.get('maxTokens') ?? 0, boss: null, toast: null });
    // The scene clock only refreshes `now` in its first update (see PlayScene.buildWorld).
    this.time.now = this.game.loop.time;
    this.state = 'fall'; // 'fall' | 'open' (the chute's out) | 'splat'
    this.t0 = this.time.now;
    this.fallMs = FALL_MS * (reg.get('god') ? 2 : 1);
    this.alt = START_FT;
    this.deployedAt = null;
    this.y = START_Y; // where the fall has got to; the sprite adds the canopy's jolt
    this.jolt = 0;
    this.tumble = true;
    this.orbit = 0;
    this.canopy = null;
    this.pack = this.lock = this.wall = this.music = this.fallMusic = null;
    this.gear = []; // things riding along with you: [object, dx, dy]
    this.notes = [];

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBackgroundColor('#0d0d0d');
    applyScreenFX(cam);
    cam.fadeIn(500, 245, 245, 245); // out of the leap's white

    this.parallax = addParallax(this, FALL_LAYERS);
    this.add.image(0, 0, 'chute_tower').setOrigin(0).setDepth(-5);
    this.add.image(ROOF_X, ROOF_Y - ROOF, 'transit_roof').setOrigin(0).setDepth(-4);

    this.player = this.add.sprite(this.fallX(START_Y), START_Y, 'player_jump').setDepth(5);
    this.laptop = this.add.image(this.player.x + 10, START_Y, 'laptop').setDepth(6);
    pop(this.player);
    pop(this.laptop);
    this.cords = this.add.graphics().setDepth(4);
    // Speed lines rushing up past you, and the glass from floor 61 falling with you.
    this.streaks = this.add
      .particles(0, 0, 'streak', { x: { min: 90, max: 320 }, speedY: { min: -460, max: -320 }, lifespan: 500, alpha: { start: 0.3, end: 0 }, frequency: 45 })
      .setDepth(3);
    for (const tex of ['px_white', 'px_cyan']) {
      this.add
        .particles(this.player.x - 8, START_Y - 6, tex, { speedX: { min: -20, max: 40 }, speedY: { min: 0, max: 70 }, gravityY: 25, lifespan: 2600, alpha: { start: 1, end: 0 }, emitting: false })
        .setDepth(6)
        .explode(10);
    }
    this.wind = wind(this);
    // The fall's own song, under the wind, until "ship it" cuts it or the roof does.
    loopSong(this, 'music_fall', 0.28, (song) => (this.fallMusic = song), () => this.state === 'fall');

    this.scene.launch('Terminal');
    this.scene.bringToTop('Terminal');

    // A phone turned portrait (the rotate overlay covers the game) holds the fall.
    const portrait = matchMedia('(orientation: portrait)');
    const onTurn = () => {
      const verb = portrait.matches ? 'pause' : 'resume';
      this.scene[verb]();
      this.scene[verb]('Terminal');
    };
    if (TOUCH) portrait.addEventListener('change', onTurn);
    this.events.once('shutdown', () => {
      voice.keysSuspended = false;
      this.wind.stop(0.05);
      this.fallMusic?.destroy();
      this.music?.destroy(); // only if it wasn't handed to the landing
      this.scene.stop('Terminal');
      portrait.removeEventListener('change', onTurn);
    });
    this.place(this.time.now, 0);
  }

  // Your x at height y: just off the glass, which widens as you go down (the real silhouette).
  fallX(y) {
    return TOWER.cx + towerHalf(Math.min(TOWER.h - 1, y + 8)) + GAP;
  }

  sfx(key, volume = 0.5) {
    playSfx(this, key, volume);
  }

  update(time, delta) {
    const dt = delta / 1000;
    if (this.state === 'fall') {
      const p = Math.min(1, (time - this.t0) / this.fallMs);
      this.y = START_Y + ease(p) * (END_Y - START_Y);
      this.alt = Math.round(START_FT * (1 - ease(p)));
      this.wind.set(p);
      if (p >= 1) this.splat();
    } else if (this.state === 'open') this.y += 6 * dt; // hanging from it now
    this.place(time, dt);
  }

  // Everything that rides with you, and the camera, for the current height.
  place(time, dt) {
    const cam = this.cameras.main;
    const settle = Phaser.Math.Easing.Sine.InOut(Math.min(1, (time - this.t0) / OPEN_MS));
    const top = this.y - Phaser.Math.Linear(OPEN_Y, VIEW_Y, settle);
    cam.centerOn(160, top + 90);
    for (const l of this.parallax) l.ts.y = 180 + (l.y ?? 0) + (DROP[l.key] ?? 0) * (END_Y - this.y);
    panParallax(this.parallax, 0, time);
    this.streaks.setPosition(0, top + 190);

    const p = this.player;
    if (this.state !== 'splat') {
      p.setPosition(this.fallX(this.y), this.y + this.jolt);
      if (this.tumble) {
        p.angle += 330 * dt;
        this.orbit += 3.2 * dt;
        this.laptop.setPosition(p.x + Math.cos(this.orbit) * 12, p.y + Math.sin(this.orbit) * 8);
        this.laptop.angle += 160 * dt;
      } else {
        this.laptop.setPosition(p.x + 10, p.y - 1 + Math.sin(time / 250)).setAngle(0);
      }
    }
    for (const [obj, dx, dy] of this.gear) obj.setPosition(p.x + dx, this.y + dy);
    // The pack rides on your back, turning with you.
    if (this.pack) {
      const a = Phaser.Math.DegToRad(p.angle);
      for (const [obj, bx, by] of [[this.pack, -6, 1], [this.lock, -6, 2]]) {
        if (obj?.riding) obj.setPosition(p.x + bx * Math.cos(a) - by * Math.sin(a), p.y + bx * Math.sin(a) + by * Math.cos(a)).setAngle(p.angle);
      }
    }
    const c = this.canopy;
    this.cords.clear();
    if (c) {
      c.img.setPosition(p.x, p.y - c.dy);
      // Cords from the hem's corners and middle to your shoulders.
      const hem = p.y - c.dy + c.img.displayHeight / 2 - 2;
      this.cords.lineStyle(1, 0xd8d0c4, 0.9);
      for (const hx of [-c.hem, -c.hem / 3, c.hem / 3, c.hem]) this.cords.lineBetween(p.x + hx * c.img.scaleX, hem, p.x + Math.sign(hx) * 3, p.y - 4);
    }
    for (const n of this.notes) n.obj.setPosition(p.x + n.dx, this.y + n.dy - 14 * Math.min(1, (time - n.at) / 900));
  }

  // A word floating off you. Notes ride with the fall rather than drifting in the world, which
  // is scrolling past at 30px a second.
  note(text, dx, dy, color) {
    const obj = worldText(this, 0, 0, text, { color, bg: '#0d0d0d', depth: 50 });
    const n = { obj, dx, dy, at: this.time.now };
    this.notes.push(n);
    this.tweens.add({
      targets: obj,
      alpha: 0,
      delay: 900,
      duration: 500,
      onComplete: () => {
        obj.destroy();
        this.notes = this.notes.filter((m) => m !== n);
      },
    });
  }

  // The Terminal calls this as each line lands.
  onLine(i) {
    if (this.state !== 'fall') return;
    if (i === 0) this.dashboard();
    else if (i === 1) this.paywall();
    else this.deploy();
  }

  // Line 1: an Agentfarce dashboard in the shape of a canopy. It opens, reports on your altitude,
  // and does nothing else; then the cords let go and it's left behind.
  dashboard() {
    const p = this.player;
    this.tumble = false;
    this.tweens.add({ targets: p, angle: 0, duration: 180 });
    const img = this.add.image(p.x, p.y - 30, 'crm_canopy').setDepth(4).setScale(0.2);
    this.tweens.add({ targets: img, scale: 1, duration: 280, ease: 'Back.out' });
    this.canopy = { img, dy: 30, hem: 26 };
    this.sfx('start', 0.35);
    this.time.delayedCall(600, () => this.state === 'fall' && this.note('altitude: trending down', 58, 10, '#e5534b'));
    this.time.delayedCall(2200, () => this.canopy?.img === img && this.dropCanopy());
  }

  // Cut loose: left behind in the air, it slides up the view as you keep falling.
  dropCanopy() {
    const c = this.canopy;
    if (!c) return;
    this.canopy = null;
    this.tumble = this.state === 'fall';
    this.tweens.add({ targets: c.img, x: '+=26', y: '-=30', angle: 24, alpha: 0, duration: 1100, onComplete: () => c.img.destroy() });
    this.sfx('hit', 0.3);
  }

  // Line 2: Parachute Pro, strapped to your back and padlocked, with the chatbots' popup as the
  // paywall.
  paywall() {
    this.dropCanopy();
    this.pack = this.add.image(0, 0, 'chute_pack').setDepth(4.8);
    this.lock = this.add.image(0, 0, 'padlock').setDepth(4.9);
    this.pack.riding = this.lock.riding = true;
    const wall = this.add.image(0, 0, 'popup').setDepth(45);
    const text = (str, dx, dy, opts) => [worldText(this, 0, 0, str, { ox: 0, depth: 46, ...opts }), dx, dy];
    const DX = 62;
    const DY = 30;
    this.wall = [
      [wall, DX, DY],
      text('Parachute Pro', DX - 53, DY - 12, { tiny: true }),
      text('$150/seat/month', DX - 41, DY - 2, { color: '#0d0d0d' }),
      text('Enterprise tier only', DX - 41, DY + 7, { color: '#e5534b' }),
    ];
    this.gear.push(...this.wall);
    wall.setScale(0.6);
    this.tweens.add({ targets: wall, scale: 1, duration: 160, ease: 'Back.out' });
    this.sfx('hit', 0.3);
  }

  // Line 3, "ship it": the paywall shatters, the lock flies, the canopy blooms and yanks you up
  // under it, and the music drops. Then the cut to the landing.
  deploy() {
    this.state = 'open';
    this.deployedAt = this.alt;
    this.dropCanopy();
    this.wind.stop(0.3);
    this.streaks.stop();
    const p = this.player;
    this.tumble = false;
    this.tweens.killTweensOf(p);
    this.tweens.add({ targets: p, angle: 0, duration: 160 });
    if (this.wall) {
      const [wall] = this.wall[0];
      for (const [tex, n] of [['px_white', 18], ['px_cyan', 10]]) {
        this.add.particles(wall.x, wall.y, tex, { speed: { min: 40, max: 140 }, lifespan: 600, gravityY: 200, emitting: false }).setDepth(47).explode(n);
      }
      for (const [obj] of this.wall) obj.destroy();
      this.gear = this.gear.filter((g) => !this.wall.includes(g));
      this.wall = null;
    }
    if (this.lock) {
      this.lock.riding = false;
      this.tweens.add({ targets: this.lock, x: '-=18', y: '-=26', angle: -200, alpha: 0, duration: 700, ease: 'Quad.out' });
    }
    const img = this.add.image(p.x, p.y - 28, 'chute').setDepth(4).setScale(0.3, 0.15);
    this.tweens.add({ targets: img, scaleX: 1, scaleY: 1, duration: 320, ease: 'Back.out' });
    this.canopy = { img, dy: 28, hem: 26 };
    this.tweens.add({ targets: this, jolt: -12, duration: 160, ease: 'Quad.out', onComplete: () => this.tweens.add({ targets: this, jolt: -6, duration: 500, ease: 'Sine.inOut' }) });
    const cam = this.cameras.main;
    shake(cam, 180, 0.006);
    this.sfx('ship', 0.6);
    // The drop: the fall's song cuts to the landing's, which carries on into the landing.
    this.fallMusic?.stop();
    loopSong(this, 'music_landing', 0.32, (song) => (this.music = song));
    this.time.delayedCall(1400, () => {
      cam.fadeOut(220, 245, 245, 245);
      cam.once('camerafadeoutcomplete', () => {
        const { music } = this;
        this.music = null; // the landing has it now
        this.scene.start('Landing', { deployedAt: this.deployedAt, music });
      });
    });
  }

  // 0 ft, no parachute: flat on the Transit Center's roof, a 404 glowing under you.
  splat() {
    if (this.state !== 'fall') return;
    this.state = 'splat';
    this.alt = 0;
    this.wind.stop(0.05);
    this.fallMusic?.stop();
    this.streaks.stop();
    this.dropCanopy();
    this.tumble = false;
    const p = this.player;
    this.tweens.killTweensOf(p);
    p.setAngle(0).setOrigin(0.5, 1).setPosition(p.x, ROOF_Y).setScale(1.5, 0.45);
    this.tweens.add({ targets: this.laptop, x: p.x + 14, y: ROOF_Y - 4, angle: 90, duration: 160 });
    if (this.pack) this.pack.setVisible(false);
    if (this.lock) this.lock.setVisible(false);
    const glow = this.add.graphics().setDepth(4);
    for (let i = 0; i < 6; i++) glow.fillStyle(0xe5534b, 0.12 + i * 0.1).fillRect(p.x - 24, ROOF_Y - 17 + i * 3, 48, 3);
    worldText(this, p.x, ROOF_Y - 26, '404', { color: '#e5534b', depth: 50 });
    for (const [tex, n] of [['px_green', 14], ['px_white', 10]]) {
      this.add.particles(p.x, ROOF_Y - 2, tex, { speedX: { min: -90, max: 90 }, speedY: { min: -120, max: -30 }, gravityY: 320, lifespan: 800, emitting: false }).setDepth(7).explode(n);
    }
    shake(this.cameras.main, 320, 0.014);
    this.sfx('hurt', 0.7);
    this.sfx('lose', 0.6);
    this.scene.get('Terminal')?.crash?.();
    this.time.delayedCall(1900, () => {
      const cam = this.cameras.main;
      cam.fadeOut(400);
      cam.once('camerafadeoutcomplete', () => this.scene.start('End', { win: false, retry: 'Chute' }));
    });
  }
}
