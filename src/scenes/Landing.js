import Phaser from 'phaser';
import { voice } from '../voice.js';
import { ZOOM, floatText, worldText } from '../util.js';
import { applyScreenFX, pop } from '../fx.js';
import { TOUCH, showPad, touch } from '../touch.js';
import { LAYERS, addParallax, panParallax } from '../backdrops.js';
import { FACADE } from '../hqArt.js';
import { placeLidar } from '../sprites.js';
import { loopSong } from './Songs.js';

// Under the canopy over SoMa, after the Chute: steer through the stars on the way down and land on
// the Waymo that has come for you. "Rider detected on roof. Adjusting route." It drives you to
// Anthropic HQ, and you walk in through the same sliding doors as every building. Not a
// PlayScene: no HUD, and nothing here can hurt you.

const W = 900; // world width
const SY = 300; // the street's surface
const H = SY + 30;
const HQ_X = 740; // the HQ facade's left edge
const DOOR = HQ_X + FACADE.door;
const STOP = DOOR - 46; // where the Waymo pulls up, its nose short of the doors
const START = { x: 110, y: 40 };
const DESCENT = 24; // px/s under the canopy
const WIND = 16; // px/s, always east
const STEER = 56; // px/s either way, on top of the wind
const DOME = SY - 30; // the top of the Waymo's sensor dome, where you land
const CATCH = 18; // how far off the dome still counts as landing on it
// Stars in three arcs, each along a line the canopy can fly: the first on the wind alone, the
// second at full steer east, the third on the wind again once you let go. All twelve take a
// route (a sim of this drift: no steering gets 4, a mid-course steer 8).
const STARS = [
  [124, 58], [130, 67], [136, 76], [142, 85],
  [200, 112], [224, 120], [248, 128], [272, 136],
  [330, 170], [336, 179], [342, 188], [348, 197],
];
// The skyline from street level, the Salesforce Tower behind you as you come down.
const LANDING_LAYERS = LAYERS.filter((l) => l.key !== 'bg_near').map((l) => (l.key === 'bg_mid' || l.key === 'bg_signs' ? { ...l, ox: 570 } : l));
const DROP = { bg_far: 0.1, bg_fog: 0.05, bg_mid: 0.16, bg_signs: 0.16 }; // per px the camera is above the street's view

export default class Landing extends Phaser.Scene {
  constructor() {
    super('Landing');
  }

  create({ music } = {}) {
    this.scene.stop('HUD');
    voice.keysSuspended = true; // no powers here; M and 1-3 do nothing
    this.state = 'drift'; // 'drift' | 'street' (missed the car) | 'landed' | 'drive' | 'arrive' | 'leaving'
    this.vx = WIND;
    this.speed = 0;
    this.bubble = null;
    this.hopping = false;

    const cam = this.cameras.main;
    cam.setZoom(ZOOM).setBounds(0, 0, W, H);
    cam.setBackgroundColor('#0d0d0d');
    applyScreenFX(cam);
    cam.fadeIn(450, 245, 245, 245);

    this.parallax = addParallax(this, LANDING_LAYERS);
    this.add.image(0, SY, 'soma_roofs').setOrigin(0, 1).setDepth(-4).setTint(0xc8c4d0);
    this.add.tileSprite(0, SY, W, H - SY, 'street').setOrigin(0).setDepth(-2);
    this.add.image(HQ_X, SY, 'hq_facade').setOrigin(0, 1).setDepth(-1);
    this.panels = [-1, 1].map((side) => this.add.image(DOOR + side * 5, SY, 'hq_door').setOrigin(0.5, 1).setFlipX(side > 0).setAlpha(0.6).setDepth(-0.5));
    this.doorsOpen = false;

    this.stars = STARS.map(([x, y]) => {
      const s = this.add.image(x, y, 'star').setDepth(2);
      this.tweens.add({ targets: s, y: y - 2, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      return s;
    });

    // The Waymo comes in from the west, lidar spinning, to line up under you.
    this.waymo = this.add.image(-40, SY, 'waymo').setOrigin(0.5, 1).setDepth(3);
    this.lidar = this.add.image(0, 0, 'px_cyan').setDepth(3.5);

    this.player = this.add.sprite(START.x, START.y, 'player_jump').setDepth(5);
    this.laptop = this.add.image(START.x + 10, START.y, 'laptop').setDepth(6);
    pop(this.player);
    pop(this.laptop);
    this.canopy = this.add.image(START.x, START.y - 27, 'chute').setDepth(4);
    this.cords = this.add.graphics().setDepth(4);
    cam.startFollow(this.player, true, 0.12, 0.12);

    this.keys = this.input.keyboard.addKeys({ left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D' });
    showPad(true, { steerOnly: true }); // touch: the D-pad steers
    const hint = worldText(this, 320 + 160, 180 + 14, TOUCH ? 'hold ← → to steer · land on the Waymo' : '← → steer · land on the Waymo', {
      color: '#f5f5f5',
      bg: '#0d0d0d',
      depth: 60,
    }).setScrollFactor(0, 0, true);
    this.tweens.add({ targets: hint, alpha: 0, delay: 4200, duration: 500, onComplete: () => hint.destroy() });
    this.badge = worldText(this, 320 + 312, 180 + 6, '★ 000', { color: '#e3b341', size: 12, bg: '#0d0d0d', ox: 1, oy: 0, depth: 60 }).setScrollFactor(0, 0, true);

    // The landing's song dropped when the chute opened (the Chute hands it over); started here
    // when the landing is played on its own.
    this.music = music ?? null;
    if (!music) loopSong(this, 'music_landing', 0.32, (song) => (this.music = song));
    else if (!music.isPlaying) music.play();

    const skip = () => this.state !== 'drift' && this.state !== 'street' && this.leave();
    for (const k of ['keydown-ENTER', 'keydown-SPACE', 'keydown-ESC']) this.input.keyboard.on(k, skip);
    this.input.on('pointerdown', skip);
    this.input.keyboard.on('keydown-N', () => (this.sound.mute = !this.sound.mute)); // the HUD, which owns N, sits this out
    this.events.once('shutdown', () => {
      voice.keysSuspended = false;
      showPad(false);
      this.music?.stop();
      this.music?.destroy();
    });
  }

  sfx(key, volume = 0.5) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume });
  }

  update(time, delta) {
    const dt = delta / 1000;
    const cam = this.cameras.main;
    panParallax(this.parallax, cam.worldView.x, time);
    const above = Math.max(0, H - 180 - cam.worldView.y);
    for (const l of this.parallax) l.ts.y = 180 + (l.y ?? 0) + (DROP[l.key] ?? 0) * above;
    this.badge.textObj.setText(`★ ${this.registry.get('stars') ?? 0}`);
    placeLidar(this.lidar, this.waymo, time);

    const p = this.player;
    if (this.state === 'drift') this.drift(time, dt);
    else if (this.state === 'street') this.pickUp(dt);
    else if (this.state === 'drive') this.drive(dt);
    if (this.state === 'landed' || this.state === 'drive') p.setPosition(this.waymo.x, DOME - 8);
    if (this.state !== 'arrive' && this.state !== 'leaving') this.laptop.setPosition(p.x + 10, p.y - 1 + Math.sin(time / 250));
    if (this.bubble) this.bubble.setPosition(this.waymo.x, SY - 52);
  }

  // Steering down through the stars, the Waymo lining up underneath.
  drift(time, dt) {
    const p = this.player;
    const k = this.keys;
    const dir = (k.right.isDown || k.d.isDown || touch.right ? 1 : 0) - (k.left.isDown || k.a.isDown || touch.left ? 1 : 0);
    this.vx = Phaser.Math.Linear(this.vx, WIND + dir * STEER, 0.08);
    p.x = Phaser.Math.Clamp(p.x + this.vx * dt, 24, STOP - 30);
    p.y += DESCENT * dt;
    // The canopy leans into a turn and sways; you hang under it.
    const tilt = Phaser.Math.Clamp((this.vx - WIND) / STEER, -1, 1) * 8 + Math.sin(time / 700) * 3;
    const a = Phaser.Math.DegToRad(tilt);
    this.canopy.setPosition(p.x + Math.sin(a) * 27, p.y - Math.cos(a) * 27).setAngle(tilt);
    p.setAngle(tilt * 0.3);
    this.drawCords();
    for (const s of this.stars) {
      if (s.active && Phaser.Math.Distance.Between(s.x, s.y, p.x, p.y) < 14) {
        s.destroy();
        this.registry.set('stars', (this.registry.get('stars') ?? 0) + 1);
        floatText(this, s.x, s.y - 6, '+1★', '#e3b341');
        this.sfx('star', 0.35);
      }
    }
    this.track(p.x, dt);
    if (p.y + 8 >= DOME && Math.abs(p.x - this.waymo.x) <= CATCH) this.onRoof();
    else if (p.y + 8 >= SY) this.onStreet();
  }

  // The car closes on a target: fast from far off, easing in, never past its stop.
  track(x, dt) {
    const dx = Phaser.Math.Clamp(x, 30, STOP) - this.waymo.x;
    const step = Math.min(170, 40 + Math.abs(dx) * 3) * dt;
    this.waymo.x += Phaser.Math.Clamp(dx, -step, step);
  }

  drawCords() {
    const p = this.player;
    const c = this.canopy;
    const a = Phaser.Math.DegToRad(c.angle);
    const g = this.cords.clear().lineStyle(1, 0xd8d0c4, 0.9);
    for (const hx of [-26, -9, 9, 26]) {
      const hy = 9; // the hem, below the canopy's centre
      g.lineBetween(c.x + hx * Math.cos(a) - hy * Math.sin(a), c.y + hx * Math.sin(a) + hy * Math.cos(a), p.x + Math.sign(hx) * 3, p.y - 4);
    }
  }

  // Missed the car: down on the street, and it pulls up for you.
  onStreet() {
    const p = this.player;
    p.y = SY - 8;
    this.state = 'street';
    this.dropCanopy();
    p.setTexture('player_idle').setAngle(0);
    this.sfx('jump', 0.4);
  }

  pickUp(dt) {
    const p = this.player;
    const side = this.waymo.x < p.x ? -1 : 1;
    this.track(p.x + side * 34, dt);
    if (Math.abs(this.waymo.x - (p.x + side * 34)) < 1 && !this.hopping) {
      this.hopping = true;
      p.setTexture('player_jump');
      this.tweens.add({ targets: p, x: this.waymo.x, duration: 380 });
      this.tweens.add({ targets: p, y: DOME - 26, duration: 190, ease: 'Sine.out', yoyo: false, onComplete: () => this.tweens.add({ targets: p, y: DOME - 8, duration: 190, ease: 'Sine.in', onComplete: () => this.onRoof() }) });
    }
  }

  dropCanopy() {
    this.cords.clear();
    // It sags and blows away east.
    this.tweens.add({ targets: this.canopy, x: '+=70', y: '-=24', angle: 40, scaleY: 0.4, alpha: 0, duration: 1400, onComplete: () => this.canopy.destroy() });
  }

  // On the roof: the car notices.
  onRoof() {
    const p = this.player;
    if (this.state === 'drift') this.dropCanopy();
    this.state = 'landed';
    p.setTexture('player_idle').setAngle(0).setPosition(this.waymo.x, DOME - 8);
    this.sfx('jump', 0.4);
    this.say('Rider detected on roof. Adjusting route.');
    this.time.delayedCall(1500, () => this.state === 'landed' && (this.state = 'drive'));
    this.time.delayedCall(3400, () => this.state === 'drive' && this.say('Please keep your laptop inside the vehicle.'));
  }

  say(text) {
    this.bubble?.destroy();
    this.bubble = worldText(this, this.waymo.x, SY - 52, text, { color: '#39c5cf', bg: '#0d0d0d', depth: 60 });
    this.sfx('start', 0.3);
  }

  // To HQ: speed up, then brake into the stop by the doors.
  drive(dt) {
    const left = STOP - this.waymo.x;
    this.speed = Math.min(170, this.speed + 150 * dt, Math.sqrt(2 * 150 * Math.max(0, left)) + 8);
    this.waymo.x = Math.min(STOP, this.waymo.x + this.speed * dt);
    if (this.waymo.x >= STOP) this.arrive();
  }

  // Off the roof and in through the doors (PlayScene.exit's walk-in, from the kerb).
  arrive() {
    this.state = 'arrive';
    const p = this.player;
    this.tweens.add({ targets: this.bubble, alpha: 0, delay: 400, duration: 300 });
    p.setTexture('player_jump');
    const kerb = STOP + 36;
    this.tweens.add({ targets: p, x: kerb, duration: 360 });
    this.tweens.add({
      targets: p,
      y: DOME - 22,
      duration: 160,
      ease: 'Sine.out',
      onComplete: () =>
        this.tweens.add({
          targets: p,
          y: SY - 8,
          duration: 200,
          ease: 'Sine.in',
          onComplete: () => {
            p.play('run', true);
            this.setDoors(true);
            this.tweens.add({ targets: p, x: DOOR - 1, duration: ((DOOR - 1 - kerb) / 95) * 1000, onComplete: () => this.walkIn() });
          },
        }),
    });
    this.tweens.add({ targets: this.laptop, x: kerb + 10, y: SY - 9, duration: 360 });
  }

  walkIn() {
    const p = this.player;
    for (const panel of this.panels) panel.setDepth(6.5); // over you (5) and the laptop (6)
    this.tweens.add({ targets: p, y: SY - 8, duration: 220, ease: 'Sine.out' });
    this.tweens.add({ targets: this.laptop, x: DOOR + 2, y: SY - 9, duration: 220, ease: 'Sine.out' });
    this.time.delayedCall(220, () => this.setDoors(false));
    this.tweens.add({ targets: [p, this.laptop], alpha: 0, scale: 0.8, y: SY - 11, delay: 220, duration: 480, ease: 'Sine.in' });
    this.time.delayedCall(620, () => this.leave());
  }

  setDoors(open) {
    if (this.doorsOpen === open) return;
    this.doorsOpen = open;
    this.panels.forEach((panel, i) => {
      const x = DOOR + (i ? 1 : -1) * (open ? 15 : 5);
      this.tweens.killTweensOf(panel);
      this.tweens.add({ targets: panel, x, duration: Math.max(16, 26 * Math.abs(x - panel.x)), ease: 'Sine.inOut' });
    });
  }

  leave() {
    if (this.state === 'leaving') return;
    this.state = 'leaving';
    const cam = this.cameras.main;
    cam.fadeOut(500);
    cam.once('camerafadeoutcomplete', () => this.scene.start('BossHQ'));
  }
}
