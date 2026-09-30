import Phaser from 'phaser';
import { voice } from '../voice.js';
import { ZOOM, worldText, freshKey } from '../util.js';
import { sfx as playSfx, toggleMute } from '../audio.js';
import { applyScreenFX } from '../fx.js';
import { TOUCH } from '../touch.js';
import { hex } from '../palette.js';
import { mix } from '../hqArt.js';
import { CAB } from '../rideArt.js';
import { playElevatorSong } from '../elevatorSong.js';
import { cardMs, sequence } from '../pacing.js';
import { keyClick } from '../noise.js';

// The ride to Anthropic HQ from the Waymo's back seat (the Landing put you there): both front
// seats empty, the wheel turning itself, the street streaming at you through the windshield and
// the city past the side windows, and the elevator's bossa nova on the car's speakers. The rider
// screen between the seats is live: START RIDE, then the route, with an ETA that races from 47
// minutes to 1 while Slack buzzes, and a skip button that renames the same song. Then the drop-off
// (Arrival). ESC, or a tap off the screen, skips to the boss. Not a PlayScene: no HUD.

const ETA = 47; // minutes on the screen as the ride starts...
const RIDE_MS = 12000; // ...and 1 minute this much later (room for the last Slack card to be read)
const AUTO_START_MS = 3500; // the car starts the ride itself if you don't
// Each card stays up as long as it did (3s) or long enough to read, whichever is longer.
const SLACK_TEXT = [
  'also can the one line do dark mode',
  "the office AI keeps forgetting what we tell it. that's not your change right?",
  'demo got moved up. you have 15 min',
];
const SLACK_AT = sequence(1600, SLACK_TEXT.map((t) => Math.max(3000, cardMs(t)))).starts;
const SLACK = SLACK_TEXT.map((t, i) => [SLACK_AT[i], t]);
const TRACKS = ['Elevator Bossa', 'Elevator Bossa 2', 'Elevator Bossa (Live)', 'Bossa (Extended)'];

// The street in road units (a car is about 1.7 wide), seen from 1.2 up in the right lane. A thing
// d units ahead is F/d pixels per unit, standing on the row HZ + CAM_H * F/d.
const F = 60;
const CAM_H = 1.2;
const HZ = 57; // the horizon's row
const SHIELD = { x0: 88, x1: 232, y0: 41, y1: 81 };
const CURB_L = -4.3;
const CURB_R = 0.9;
const DASH_LAT = -0.75; // the lane line to your left
const WALLS = [
  { lat: -6.2, h: 6.0, color: 0x1c1f33, dim: 0.7 },
  { lat: 2.1, h: 5.2, color: 0x22263d, dim: 1 },
];
const FLOORS = [1.7, 2.5, 3.3, 4.1, 4.9]; // window rows, in units above the street
const POLES = [
  { lat: 1.5, glow: 1 },
  { lat: -5.4, glow: 0.6 },
];
const POLE_GAP = 7;
const ROAD = 0x2a2a31;
const SIDEWALK = 0x3a3a45;
const SKY = Array.from({ length: HZ - SHIELD.y0 }, (_, i) => hex(mix('#141a36', '#3d2d52', i / (HZ - SHIELD.y0))));
const lit = (...k) => (k.reduce((a, v) => a * 31 + v, 7) >>> 0) % 97 < 40;

export default class Ride extends Phaser.Scene {
  constructor() {
    super('Ride');
  }

  create() {
    this.scene.stop('HUD');
    voice.release();
    voice.keysSuspended = true; // no powers in the car
    this.time.now = this.game.loop.time; // stale until the first update (see PlayScene.buildWorld)
    this.state = 'boarding'; // 'boarding' | 'starting' | 'riding' | 'leaving'
    this.rideAt = null;
    this.travel = 0;
    this.speed = 0;
    this.bend = 0;
    this.eta = ETA;
    this.track = 0;
    this.song = null;
    this.flash = -Infinity; // when the skip button was last pressed

    const cam = this.cameras.main;
    cam.setZoom(ZOOM).centerOn(160, 90);
    cam.setBackgroundColor('#0d0d0d');
    applyScreenFX(cam);
    cam.fadeIn(500);

    this.outside = this.add.graphics().setDepth(0);
    this.add.image(0, 0, 'ride_cabin').setOrigin(0).setDepth(1);
    this.wheel = this.add.image(CAB.wheel.x, CAB.wheel.y, 'ride_wheel').setDepth(2);
    this.add.image(0, 0, 'ride_seats').setOrigin(0).setDepth(3);
    worldText(this, 234, 143.5, 'Hello!', { tiny: true, depth: 3.5 });
    this.screen = this.add.graphics().setDepth(4);
    const S = CAB.screen;
    const text = (x, y, str, opts) => worldText(this, x, y, str, { depth: 5, ...opts });
    this.boardingText = [
      text(160, S.y + 5, 'Good evening', { tiny: true, color: '#5b6070' }),
      text(160, S.y + 11, 'to Anthropic HQ', { tiny: true, color: '#8b8f99' }),
      text(160, CAB.button.y + 6, 'START RIDE'),
      text(160, S.y + S.h - 3, TOUCH ? 'tap' : 'ENTER', { tiny: true, color: '#8b8f99' }),
    ];
    this.etaText = text(S.x + S.w - 2, S.y + 27, `${ETA} MIN`, { color: '#15181f', ox: 1 });
    this.songText = text(S.x + 8, S.y + 34, TRACKS[0], { tiny: true, color: '#5b6070', ox: 0 });
    this.ridingText = [text(S.x + 3, S.y + 27, 'ANTHROPIC HQ', { tiny: true, color: '#5b6070', ox: 0 }), this.etaText, this.songText];
    for (const t of this.ridingText) t.setVisible(false);

    this.scene.launch('Cine', { bars: false, skip: TOUCH ? 'tap off the screen to skip' : 'ESC skip' });
    this.scene.bringToTop('Cine');
    this.cine = this.scene.get('Cine');

    for (const k of ['keydown-ENTER', 'keydown-SPACE']) this.input.keyboard.on(k, () => this.press());
    this.input.keyboard.on('keydown-ESC', () => this.leave('BossHQ', 300));
    this.input.keyboard.on('keydown-N', freshKey(() => toggleMute(this.sound))); // the HUD, which owns N, sits this out
    this.input.on('pointerdown', (p) => this.tap(p));
    this.time.delayedCall(AUTO_START_MS, () => this.startRide());
    this.events.once('shutdown', () => {
      voice.keysSuspended = false;
      this.stopSong(0.05);
      this.scene.stop('Cine');
    });
  }

  sfx(key, volume = 0.5) {
    playSfx(this, key, volume);
  }

  press() {
    if (this.state === 'boarding') this.startRide();
    else if (this.state === 'riding') this.nextTrack();
  }

  // On the screen: START RIDE, or (riding) its bottom row's skip button. Anywhere else skips.
  tap(pointer) {
    const S = CAB.screen;
    const x = pointer.worldX;
    const y = pointer.worldY;
    if (x < S.x || x >= S.x + S.w || y < S.y || y >= S.y + S.h) this.leave('BossHQ', 300);
    else if (this.state === 'boarding') this.startRide();
    else if (this.state === 'riding' && y >= S.y + 30) this.nextTrack();
  }

  startRide() {
    if (this.state !== 'boarding') return;
    this.state = 'starting';
    this.sfx('start', 0.35);
    this.time.delayedCall(260, () => {
      if (this.state !== 'starting') return;
      this.state = 'riding';
      this.rideAt = this.time.now;
      for (const t of this.boardingText) t.setVisible(false);
      for (const t of this.ridingText) t.setVisible(true);
      // The car's speakers: the song from the elevator, where the last ride up left it.
      this.song = playElevatorSong(this, { from: this.registry.get('elevatorSongAt') ?? 0 });
      for (const [ms, msg] of SLACK) this.time.delayedCall(ms, () => this.state === 'riding' && this.cine.phone(msg));
      this.time.delayedCall(RIDE_MS - 500, () => this.cine.hidePhone());
      this.time.delayedCall(RIDE_MS + 700, () => this.leave('Arrival', 500));
    });
  }

  // Next track: a new title, the same bossa nova.
  nextTrack() {
    this.track = (this.track + 1) % TRACKS.length;
    this.songText.setText(TRACKS[this.track]);
    this.flash = this.time.now;
    keyClick(this, true);
  }

  // Remembers how far the song got, for the drop-off.
  stopSong(fade) {
    if (!this.song) return;
    this.registry.set('elevatorSongAt', this.song.at());
    this.song.stop(fade);
    this.song = null;
  }

  leave(next, ms) {
    if (this.state === 'leaving') return;
    this.state = 'leaving';
    this.stopSong(ms / 1000);
    const cam = this.cameras.main;
    cam.fadeOut(ms);
    cam.once('camerafadeoutcomplete', () => {
      this.scene.stop('Cine');
      this.scene.start(next);
    });
  }

  update(_time, delta) {
    const now = this.time.now;
    const dt = delta / 1000;
    const t = this.rideAt === null ? 0 : (now - this.rideAt) / 1000;
    const p = this.rideAt === null ? 0 : Math.min(1, (t * 1000) / RIDE_MS);
    // Pull away, hold a time-lapse pace, and ease off as the ETA runs out.
    const target = this.rideAt === null ? 0 : p < 0.88 ? 26 : 6;
    this.speed = Phaser.Math.Linear(this.speed, target, Math.min(1, dt * 1.3));
    this.travel += this.speed * dt;
    const moving = Math.min(1, this.speed / 10);
    this.bend = moving * (0.7 * Math.sin(t * 0.55) + 0.3 * Math.sin(t * 1.4 + 1));
    this.wheel.setAngle(this.bend * 50);
    if (this.rideAt !== null) {
      const eta = Math.max(1, Math.round(ETA - (ETA - 1) * p));
      if (eta !== this.eta) {
        this.eta = eta;
        this.etaText.setText(`${eta} MIN`);
      }
    }
    this.drawOutside(now);
    this.drawScreen(now);
  }

  // The street through the windshield, one pixel row at a time: sky, the walls of the street, its
  // sidewalks and road, then everything that streams at you (lit windows, streetlights, the lane
  // line, the car ahead). The city past the side windows, and streetlights over the roof glass.
  drawOutside(now) {
    const g = this.outside.clear();
    const span = (x0, x1, y, color, alpha = 1) => {
      const a = Math.max(SHIELD.x0, Math.round(x0));
      const b = Math.min(SHIELD.x1, Math.round(x1));
      if (b > a && y >= SHIELD.y0 && y < SHIELD.y1) g.fillStyle(color, alpha).fillRect(a, y, b - a, 1);
    };
    const s = (d) => F / d;
    const cx = (d) => 160 + this.bend * 14 * (1 - Math.exp(-d / 25)); // the road bends away from you
    const X = (d, lat) => cx(d) + lat * s(d);

    for (let y = SHIELD.y0; y < SHIELD.y1; y++) {
      if (y < HZ) {
        // Above the horizon: sky, and each wall up to where its top edge crosses this row.
        span(SHIELD.x0, SHIELD.x1, y, SKY[y - SHIELD.y0]);
        for (const w of WALLS) {
          const k = (HZ - y) / (w.h - CAM_H);
          const x = cx(F / k) + w.lat * k;
          if (w.lat < 0) span(SHIELD.x0, x, y, w.color);
          else span(x, SHIELD.x1, y, w.color);
        }
      } else {
        const k = (y - HZ + 0.5) / CAM_H;
        const c = cx(F / k);
        const [wl, wr] = WALLS.map((w) => c + w.lat * k);
        span(SHIELD.x0, wl, y, WALLS[0].color);
        span(wl, c + CURB_L * k, y, SIDEWALK);
        span(c + CURB_L * k, c + CURB_R * k, y, ROAD);
        span(c + CURB_R * k, wr, y, SIDEWALK);
        span(wr, SHIELD.x1, y, WALLS[1].color);
      }
    }
    span(SHIELD.x0, SHIELD.x1, HZ, 0x4a3656, 0.6); // the city's glow at the end of the street

    // Lit windows, a column every 1.6 units, three floors up, streaming out toward the edges.
    const pitch = 1.6;
    const first = Math.floor(this.travel / pitch);
    for (const [wi, w] of WALLS.entries()) {
      for (let i = 1; i < 30; i++) {
        const d = (first + i) * pitch - this.travel + 1;
        const sd = s(d);
        const x = X(d, w.lat);
        const ww = Math.max(1, Math.round((Math.abs(w.lat) * F * 0.5) / (d * d)));
        const wh = Math.max(1, Math.round(0.45 * sd));
        for (const [row, hgt] of FLOORS.entries()) {
          if (hgt > w.h - 0.3 || !lit(first + i, row, wi)) continue;
          const y = Math.round(HZ - (hgt - CAM_H) * sd);
          const x0 = w.lat < 0 ? x - ww : x;
          for (let j = 0; j < wh; j++) span(x0, x0 + ww, y + j, 0xffd9a0, w.dim);
        }
      }
    }

    // The lane line to your left.
    const gap = 3;
    for (let i = 0; i < 14; i++) {
      const near = 2 + i * gap - (this.travel % gap);
      if (near < 1) continue;
      const y0 = Math.round(HZ + CAM_H * s(near + 1.2));
      const y1 = Math.min(SHIELD.y1 - 1, Math.round(HZ + CAM_H * s(near)));
      for (let y = Math.max(y0, HZ + 1); y <= y1; y++) {
        const k = (y - HZ) / CAM_H;
        const x = cx(F / k) + DASH_LAT * k;
        span(x, x + Math.max(1, Math.round(0.12 * k)), y, 0xd8d2b8);
      }
    }

    // The car ahead, keeping its distance, brake lights up as you slow for HQ.
    const dc = 10 + 1.2 * Math.sin(now / 2300);
    const sc = s(dc);
    const xc = cx(dc);
    const cw = 1.7 * sc;
    const ch = 1.15 * sc;
    const yb = Math.round(HZ + CAM_H * sc);
    const braking = this.speed > 8 && this.rideAt !== null && now - this.rideAt > RIDE_MS * 0.88;
    for (let y = Math.round(yb - ch); y < yb; y++) span(xc - cw / 2, xc + cw / 2, y, y < yb - ch * 0.55 ? 0x151922 : 0x2f3542);
    const ty = Math.round(yb - ch * 0.4);
    const tw = Math.max(1, Math.round(0.28 * sc));
    span(xc - cw / 2, xc - cw / 2 + tw, ty, braking ? 0xff7a6b : 0xe5534b);
    span(xc + cw / 2 - tw, xc + cw / 2, ty, braking ? 0xff7a6b : 0xe5534b);

    // Streetlights on both sidewalks: poles growing as they come, lamps and their glow.
    const firstPole = Math.floor(this.travel / POLE_GAP);
    const overhead = [];
    for (let i = 0; i < 7; i++) {
      const d = (firstPole + i + 1) * POLE_GAP - this.travel;
      if (d < 0.2) continue;
      for (const pole of POLES) {
        if (d < 3.5) overhead.push([d, pole]);
        const sd = s(d);
        const x = X(d, pole.lat);
        const top = HZ - (3.4 - CAM_H) * sd;
        const pw = Math.max(1, Math.round(0.12 * sd));
        const foot = Math.min(SHIELD.y1, Math.round(HZ + CAM_H * sd));
        for (let y = Math.max(SHIELD.y0, Math.round(top)); y < foot; y++) span(x, x + pw, y, 0x4a4a55);
        const lx = pole.lat < 0 ? x : x - Math.max(2, Math.round(0.6 * sd)) + pw;
        const lw = Math.max(2, Math.round(0.6 * sd));
        span(lx - lw / 2, lx + lw * 1.5, Math.round(top) - 1, 0xffc46b, 0.35 * pole.glow);
        span(lx, lx + lw, Math.round(top), 0xffc46b, pole.glow);
      }
    }

    // Past the side windows: the near side's offices streaming back, the far side slower.
    for (const [side, x0, x1, cell, rate, wall] of [[1, 262, 306, 6, 9, WALLS[1]], [-1, 14, 58, 4, 4, WALLS[0]]]) {
      g.fillStyle(wall.color).fillRect(x0, 34, x1 - x0, 38);
      g.fillStyle(SIDEWALK).fillRect(x0, 72, x1 - x0, 5);
      g.fillStyle(ROAD).fillRect(x0, 77, x1 - x0, 4);
      const u = this.travel * rate;
      for (let c = Math.floor((u - (x1 - x0)) / cell) - 1; c <= Math.ceil(u / cell) + 1; c++) {
        const run = u - c * cell; // how far this column has come in from the window's front edge
        const x = side > 0 ? x0 + run : x1 - run - cell; // outward, toward the back of the car
        if (x + cell <= x0 || x >= x1) continue;
        for (let r = 0; r < 5; r++) {
          if (!lit(c, r, side)) continue;
          const a = Math.max(x0, x + 1);
          const b = Math.min(x1, x + cell - 1);
          if (b > a) g.fillStyle(0xffd9a0, wall.dim * 0.9).fillRect(a, 38 + r * (cell + 1), b - a, cell - 2);
        }
      }
      const poleU = this.travel * rate;
      const period = POLE_GAP * rate;
      const px = side > 0 ? x0 + ((poleU + 20) % period) : x1 - ((poleU + 20) % period);
      if (px > x0 && px < x1 - 2) {
        g.fillStyle(0x4a4a55).fillRect(Math.round(px), 34, 2, 43);
        g.fillStyle(0xffc46b, 0.5).fillRect(Math.round(px) - 3, 34, 8, 3);
      }
    }

    // The roof glass: night sky, and each streetlight's glow sweeping over you as you pass under.
    g.fillStyle(0x0b0e1a).fillRect(34, 0, 252, 28);
    for (const [d, pole] of overhead) {
      const k = d / 3.5;
      g.fillStyle(0xffb35c, 0.3 * (1 - k) * pole.glow).fillRect(pole.lat > 0 ? 176 : 40, Math.round(26 * k), 104, 2);
    }
  }

  // The rider screen: the white and pink START RIDE page from the photos, then the car's view of
  // the road ahead over the trip and the music.
  drawScreen(now) {
    const S = CAB.screen;
    const B = CAB.button;
    const g = this.screen.clear();
    if (this.state === 'boarding' || this.state === 'starting' || this.rideAt === null) {
      for (let j = 0; j < S.h; j++) g.fillStyle(hex(mix('#f7f4f8', '#f1d5e1', j / S.h))).fillRect(S.x, S.y + j, S.w, 1);
      const pulse = 0.5 + 0.5 * Math.sin(now / 170);
      const blue = this.state === 'starting' ? '#2a4fb8' : mix('#3b6ff5', '#6a93ff', pulse);
      g.fillStyle(hex(blue)).fillRect(B.x + 1, B.y, B.w - 2, B.h).fillRect(B.x, B.y + 1, B.w, B.h - 2);
      return;
    }
    // The map: the road ahead as the car sees it, the lane lines rolling toward you, the car
    // ahead as a white box, and you as the teal chevron.
    const M = 22;
    g.fillStyle(0x16203a).fillRect(S.x, S.y, S.w, M);
    const vx = 160 + this.bend * 6;
    for (let j = 0; j < M; j++) {
      const k = (j + 1) / M;
      const half = 3 + k * 16;
      const x = Phaser.Math.Linear(vx, 160, k);
      g.fillStyle(0x2b3a5e).fillRect(Math.round(x - half), S.y + j, Math.round(half * 2), 1);
      if ((((Math.floor(j * 0.6 - this.travel * 1.5) % 3) + 3) % 3) === 0) g.fillStyle(0x6f86b8).fillRect(Math.round(x - half * 0.33), S.y + j, 1, 1);
    }
    const carK = 0.45;
    const carX = Phaser.Math.Linear(vx, 160, carK);
    g.fillStyle(0xdfe6f2).fillRect(Math.round(carX - 2), S.y + Math.round(carK * M) - 1, 4, 3);
    g.fillStyle(0x39c5cf).fillRect(158, S.y + M - 4, 4, 1).fillRect(157, S.y + M - 3, 2, 1).fillRect(161, S.y + M - 3, 2, 1);
    // The trip and the music.
    g.fillStyle(0xf4f5f8).fillRect(S.x, S.y + M, S.w, S.h - M);
    g.fillStyle(0xe1e4ea).fillRect(S.x, S.y + 30, S.w, 1);
    g.fillStyle(0x7a4fbf).fillRect(S.x + 3, S.y + 33, 1, 3).fillRect(S.x + 4, S.y + 32, 2, 1).fillRect(S.x + 2, S.y + 35, 2, 2); // a note
    const pressed = now - this.flash < 160;
    const bx = S.x + S.w - 13;
    const by = S.y + 31;
    g.fillStyle(pressed ? 0x2a4fb8 : 0x3b6ff5).fillRect(bx, by, 11, 7);
    g.fillStyle(0xffffff); // skip: two triangles and a bar
    for (const x of [bx + 2, bx + 5]) g.fillRect(x, by + 1, 1, 5).fillRect(x + 1, by + 2, 1, 3).fillRect(x + 2, by + 3, 1, 1);
    g.fillRect(bx + 8, by + 1, 1, 5);
  }
}
