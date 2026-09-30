import Phaser from 'phaser';
import { voice } from '../voice.js';
import { ZOOM, freshKey } from '../util.js';
import { sfx as playSfx, toggleMute } from '../audio.js';
import { applyScreenFX, pop } from '../fx.js';
import { LAYERS, addParallax, panParallax } from '../backdrops.js';
import { FACADE } from '../hqArt.js';
import { placeLidar } from '../sprites.js';

// The drop-off at Anthropic HQ after the ride (Ride), letterboxed like the intro it answers: the
// Waymo pulls up with you in the back, you hop out, and you walk in through HQ's sliding doors
// while it waits at the kerb (it leaves on its own, after the cut). The ride's song ended with the
// ride, so this is quiet. Any key or a tap skips to the boss. Not a PlayScene: no HUD.

const SY = 160; // the street's surface
const HQ_X = 150; // the facade's left edge
const DOOR = HQ_X + FACADE.door;
const STOP = DOOR - 50; // where the Waymo pulls up, its nose clear of the doors when they open
const KERB = STOP + 18; // where you land, hopping out
const ARRIVAL_LAYERS = LAYERS.filter((l) => l.key !== 'bg_near');

export default class Arrival extends Phaser.Scene {
  constructor() {
    super('Arrival');
  }

  create() {
    this.scene.stop('HUD');
    voice.keysSuspended = true; // no powers here; M and 1-3 do nothing
    this.state = 'arriving'; // 'arriving' | 'out' | 'walking' | 'leaving'
    this.doorsOpen = false;

    const cam = this.cameras.main;
    cam.setZoom(ZOOM).centerOn(160, 96); // low enough that the kerb clears the letterbox
    cam.setBackgroundColor('#0d0d0d');
    applyScreenFX(cam);
    cam.fadeIn(500);

    this.parallax = addParallax(this, ARRIVAL_LAYERS);
    this.add.image(0, SY, 'soma_roofs').setOrigin(0, 1).setDepth(-4).setTint(0xc8c4d0);
    this.add.tileSprite(0, SY, 320, 30, 'street').setOrigin(0).setDepth(-2);
    this.add.image(HQ_X, SY, 'hq_facade').setOrigin(0, 1).setDepth(-1);
    this.panels = [-1, 1].map((side) => this.add.image(DOOR + side * 5, SY, 'hq_door').setOrigin(0.5, 1).setFlipX(side > 0).setAlpha(0.6).setDepth(-0.5));

    this.waymo = this.add.image(-40, SY, 'waymo_rider').setOrigin(0.5, 1).setDepth(3);
    this.lidar = this.add.image(0, 0, 'px_cyan').setDepth(3.5);
    this.player = this.add.sprite(0, 0, 'player_jump').setDepth(5).setVisible(false);
    this.laptop = this.add.image(0, 0, 'laptop').setDepth(6).setVisible(false);
    pop(this.player);
    pop(this.laptop);

    this.scene.launch('Cine');
    this.scene.bringToTop('Cine');
    const cine = this.scene.get('Cine');
    this.tweens.add({ targets: this.waymo, x: STOP, duration: 2200, ease: 'Cubic.out' });
    this.time.delayedCall(2400, () => this.hopOut(cine));
    this.time.delayedCall(3600, () => this.shutDoor());
    this.time.delayedCall(4300, () => this.state !== 'leaving' && cine.say('WAYMO', 'Rate your ride: ★★★★★?'));
    this.time.delayedCall(4700, () => this.walk());

    const skip = () => this.leave();
    for (const k of ['keydown-ENTER', 'keydown-SPACE', 'keydown-ESC']) this.input.keyboard.on(k, skip);
    this.input.on('pointerdown', skip);
    this.input.keyboard.on('keydown-N', freshKey(() => toggleMute(this.sound))); // the HUD, which owns N, sits this out
    this.events.once('shutdown', () => {
      voice.keysSuspended = false;
      this.scene.stop('Cine');
    });
  }

  sfx(key, volume = 0.5) {
    playSfx(this, key, volume);
  }

  update(time) {
    panParallax(this.parallax, this.cameras.main.worldView.x, time);
    for (const l of this.parallax) l.ts.y = 180 + (l.y ?? 0);
    placeLidar(this.lidar, this.waymo, time);
    const p = this.player;
    if (p.visible && this.state !== 'leaving') this.laptop.setPosition(p.x + 10, p.y - 1 + Math.sin(time / 250));
  }

  // The rear door opens and you hop out to the kerb.
  hopOut(cine) {
    if (this.state !== 'arriving') return;
    this.state = 'out';
    this.waymo.setTexture('waymo_open');
    cine.say('WAYMO', 'You have arrived at Anthropic HQ.');
    const p = this.player.setVisible(true).setPosition(this.waymo.x - 5, SY - 12);
    this.laptop.setVisible(true).setPosition(p.x + 10, p.y);
    this.sfx('jump', 0.4);
    this.tweens.add({ targets: p, x: KERB, duration: 360 });
    this.tweens.add({
      targets: p,
      y: SY - 20,
      duration: 160,
      ease: 'Sine.out',
      onComplete: () => this.tweens.add({ targets: p, y: SY - 8, duration: 200, ease: 'Sine.in', onComplete: () => p.setTexture('player_idle') }),
    });
  }

  // The door shuts behind you, and the car waits there, empty.
  shutDoor() {
    if (this.state !== 'out') return;
    this.waymo.setTexture('waymo');
    this.sfx('hit', 0.2);
  }

  // Up the sidewalk and in through the doors (PlayScene.exit's walk-in).
  walk() {
    if (this.state !== 'out') return;
    this.state = 'walking';
    const p = this.player;
    p.play('run', true);
    this.setDoors(true);
    this.tweens.add({ targets: p, x: DOOR - 1, duration: ((DOOR - 1 - p.x) / 95) * 1000, onComplete: () => this.walkIn() });
  }

  walkIn() {
    const p = this.player;
    for (const panel of this.panels) panel.setDepth(6.5); // over you (5) and the laptop (6)
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
    cam.once('camerafadeoutcomplete', () => {
      this.scene.stop('Cine');
      this.scene.start('BossHQ');
    });
  }
}
