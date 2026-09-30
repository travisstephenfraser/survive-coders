import Phaser from 'phaser';
import { ZOOM, floatText, worldText, freshKey } from '../util.js';
import { sfx as playSfx, toggleMute } from '../audio.js';
import { applyScreenFX } from '../fx.js';
import { playElevatorSong } from '../elevatorSong.js';
import { TYPE_MS } from '../pacing.js'; // Cine's typewriter pace, so the ding lands on the last letter

// The ride between floors: a CRM agent pitches the whole way up over elevator music, and the
// ding cuts him off mid-sentence. About 6s, skippable (ENTER or a tap). Not a PlayScene, so the
// HUD sits it out.
const PITCHES = {
  59: ['While I have you... have you considered Agentfarce?', "It's agentic AND agentful.", "I'll let you get back to your day. Actually, one more th-"],
  60: ['Quick question: how are you managing customer relationships today?', 'Spreadsheets? Oh no. Oh no no no.', "Let me loop in my manager, he's on 61. We could ri-"],
};
const LINE_AT = [300, 2100, 3900]; // when each line starts, in ms
const CAR = { x: 160, y: 88 }; // the car's centre (elevator_car is 128x100)
const FLOOR_Y = CAR.y + 42; // where the riders stand
const SLAB_GAP = 90; // floors pass the car this far apart
const RISE = 70; // px/s up the shaft

export default class Elevator extends Phaser.Scene {
  constructor() {
    super('Elevator');
  }

  create({ floor }) {
    this.floor = floor;
    this.leaving = false;
    this.rising = true;
    this.rise = 0;
    this.scene.stop('HUD');
    const cam = this.cameras.main;
    cam.setZoom(ZOOM).centerOn(160, 90);
    cam.setBackgroundColor('#0e0e12');
    applyScreenFX(cam);
    cam.fadeIn(300);

    // The shaft: steel guide rails either side of the car, and floor slabs sliding down past it.
    const rails = this.add.graphics();
    rails.fillStyle(0x3a3d44).fillRect(84, 0, 3, 180).fillRect(233, 0, 3, 180);
    rails.fillStyle(0x5d636c).fillRect(84, 0, 1, 180).fillRect(233, 0, 1, 180);
    this.slabs = this.add.graphics();

    // Cables up out of frame, the car, and the two riders.
    this.add.graphics().fillStyle(0x5d636c).fillRect(156, 0, 1, CAR.y - 50).fillRect(163, 0, 1, CAR.y - 50).setDepth(2);
    this.add.image(CAR.x, CAR.y, 'elevator_car').setDepth(2);
    this.add.image(134, FLOOR_Y, 'player_idle').setOrigin(0.5, 1).setDepth(3);
    const laptop = this.add.image(145, FLOOR_Y - 9, 'laptop').setDepth(3);
    this.tweens.add({ targets: laptop, y: laptop.y - 2, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.agent = this.add.image(188, FLOOR_Y, 'agent0').setOrigin(0.5, 1).setFlipX(true).setDepth(3);
    this.display = worldText(this, CAR.x, CAR.y - 30, `${floor} ↑`, { color: '#ffb000', depth: 4 });

    this.scene.launch('Cine');
    this.scene.bringToTop('Cine');
    const cine = this.scene.get('Cine');
    const lines = PITCHES[floor];
    lines.forEach((text, i) =>
      this.time.delayedCall(LINE_AT[i], () => {
        cine.say('CHAD, AE', text);
        this.tweens.add({ targets: this.agent, y: FLOOR_Y - 2, duration: 90, yoyo: true }); // leans in
      }),
    );
    const ding = LINE_AT[2] + lines[2].length * TYPE_MS;
    this.time.delayedCall(ding, () => this.ding());
    this.time.delayedCall(ding + 900, () => this.leave());

    const skip = () => this.leave();
    for (const k of ['keydown-ENTER', 'keydown-SPACE', 'keydown-ESC']) this.input.keyboard.once(k, skip);
    this.input.once('pointerdown', skip);

    // The building's music, picking up where the last ride left off. N mutes here too, since
    // the HUD that owns it is stopped for the ride.
    this.song = playElevatorSong(this, { from: this.registry.get('elevatorSongAt') ?? 0 });
    this.input.keyboard.on('keydown-N', freshKey(() => toggleMute(this.sound)));
    this.events.once('shutdown', () => this.stopSong(0.05));
  }

  // Remembers how far the song got, for the next ride.
  stopSong(fade) {
    if (!this.song) return;
    this.registry.set('elevatorSongAt', this.song.at());
    this.song.stop(fade);
    this.song = null;
  }

  update(time, delta) {
    if (this.rising) this.rise += (RISE * delta) / 1000;
    const g = this.slabs.clear();
    for (let i = 0; i < 3; i++) {
      const y = Math.round(((this.rise + i * SLAB_GAP) % (3 * SLAB_GAP)) - 50);
      g.fillStyle(0x2a2b30).fillRect(60, y, 200, 8);
      g.fillStyle(0x3d3f46).fillRect(60, y, 200, 1);
      for (let x = 62; x < 258; x += 12) g.fillStyle(0xb38a2a).fillRect(x, y + 3, 6, 2); // hazard stripe
    }
  }

  ding() {
    this.rising = false;
    this.display.setText(`${this.floor + 1}`);
    playSfx(this, 'star', 0.5);
    floatText(this, CAR.x, CAR.y - 40, 'DING', '#ffb000');
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    const cam = this.cameras.main;
    cam.fadeOut(400);
    this.stopSong(0.4);
    cam.once('camerafadeoutcomplete', () => {
      this.scene.stop('Cine');
      this.scene.start('Tower', { floor: this.floor + 1 });
    });
  }
}
