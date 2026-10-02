import Phaser from 'phaser';
import PlayScene from './PlayScene.js';
import { LAYERS, TROLLEYS } from '../backdrops.js';
import { placeLidar } from '../sprites.js';
import { worldText } from '../util.js';
import { TOUCH } from '../touch.js';
import { keymap } from '../keymap.js';
import { howTo } from '../voice.js';
import { cardMs, lineMs, sequence } from '../pacing.js';

// Legend: # ground, = neon platform, P player, * star, M MAX power-up, B Bad Prompt Blob,
// G Keyboard Goblin, H H100 GPU, D the doors into the Transit Center, up to Salesforce Park.
const SUBURBS = [
  '............................................................................................................................',
  '............................................................................................................................',
  '............................................................................................................................',
  '..........................................................................................****..............................',
  '.........................................................................................======.............................',
  '.................................**.*...................***.................................................................',
  '............***.............*......H...................=====..*.......................B.....................................',
  '...........=====...........*.*..======....**.................*.*.....................###...*.*.*.*..........................',
  '..........................*...*..........####...............*...*.................######....................................',
  '..P..***.........B.......................####...B.B.B.B..........M..G.....H....#########.............B....G....H..***...D...',
  '###########################...###############################...#########################...........########################',
  '###########################...###############################...#########################...........########################',
];

// Neighborhood signs, in travel order.
const HOODS = [
  [24, 'DALY CITY'],
  [520, 'OUTER SUNSET'],
  [1150, 'TWIN PEAKS'],
  [1398, 'POWELL ST', '#e3b341'],
  [1610, 'THE MISSION'],
  [1812, 'SOMA'],
];
const SWARM_PAST_X = 920; // just past the first swarm's last blob (x 776-872): the refactor tip gives up here
const slug = (name) => name.toLowerCase().replace(/ /g, '-');
const DEST = slug(HOODS.at(-1)[1]);

// HUD path: the last sign passed, as a cwd (rollback and pit respawns can walk it back),
// pointing to SoMa until the player gets there.
function routeLabel(x) {
  const here = slug((HOODS.findLast(([hx]) => x >= hx) ?? HOODS[0])[1]);
  return here === DEST ? `~/sf/${here}` : `~/sf/${here} → ${DEST}`;
}

export default class Level1 extends PlayScene {
  constructor() {
    super('Level1');
  }

  create() {
    this.registry.set('level', routeLabel(0));
    this.registry.set('boss', null);
    this.registry.set('maxTokens', 0); // MAX's chip is in this level; unspent tokens carry into the boss

    this.buildParallax(LAYERS);

    // Trolleys ride the near-layer street; they share its parallax plus their own motion.
    const near = LAYERS.find((l) => l.key === 'bg_near');
    this.trolleys = this.textures.exists('trolley')
      ? TROLLEYS.map((t) => ({
          ...t,
          f: near.f,
          // Background trolleys take the street's tint (solid, dimmed) so the rideable car reads as foreground.
          img: this.add.image(0, 180 + 150, 'trolley').setOrigin(0.5, 1).setScrollFactor(0).setDepth(-10).setTint(near.tint).setFlipX(t.dir < 0),
        }))
      : [];

    this.buildWorld(SUBURBS, 'suburbs');

    worldText(this, 60, 92, '$ claude "make one small change"', { color: '#d97757', size: 6, depth: 2 });
    for (const [x, name, color] of HOODS) this.sign(x, 118, name, color);
    this.buildCableCar();
    const door = this.buildExit('transit_facade', 'Park');
    worldText(this, door.x - 16, door.ground - 108, 'TRANSIT CENTER · PARK ↑', { color: '#39c5cf', bg: '#0d0d0d', depth: 0 });
    this.playMusic('music_level', 0.28);
    if (!this.registry.get('introSeen')) this.playIntro();
    // x-position beats: [worldX, keyboard text, touch text (if different), power to pulse, done].
    // With `done`, the tip stays until you've done it (the first two), not for a fixed time.
    const key = (action) => keymap.name(action);
    this.beats = [
      [70, `${key('fire')} fires prompts at bad prompts`, '>_ fires prompts at bad prompts', null, () => this.shots > 0],
      [640, `Swarmed? ${howTo('refactor', { first: true })}`, 'Swarmed? Tap "refactor" below', 'refactor', () => this.lastPower === 'refactor' || this.player.x > SWARM_PAST_X],
      [1372, 'Too far to jump. Hop on the cable car roof', null, null],
      [1760, `Save a big one for the park: ${howTo('ship', { short: true })}`, 'Save a big one for the park: tap "ship it"', 'ship'],
    ];
  }

  update(time, delta) {
    super.update(time, delta);
    if (this.cutscene) {
      this.updateIntro(time);
      return;
    }
    const p = this.player;
    this.updateCableCar(time);
    const label = routeLabel(p.x);
    if (label !== this.registry.get('level')) this.registry.set('level', label);
    while (this.beats.length && this.player.x >= this.beats[0][0]) {
      const [, keys, taps, power, done] = this.beats.shift();
      this.toast(TOUCH && taps ? taps : keys, power, undefined, done);
    }
    this.scrollParallax(time);
    const x = this.cameras.main.worldView.x;
    const span = 320 + 140; // wrap just outside the view on both sides
    for (const t of this.trolleys) {
      const vx = Phaser.Math.Wrap(t.x0 + t.dir * t.speed * time * 3 - x * t.f, -70, span - 70);
      t.img.x = 320 + vx; // scrollFactor-0 objects: x=320 is the view's left edge at 3x zoom
    }
  }

  // ---- Intro cutscene: a robotaxi drops the vibe coder at the edge of its service area. ----
  playIntro() {
    this.registry.set({ introSeen: true, cutscene: true });
    this.cutscene = true;
    const p = this.player;
    p.setVisible(false).body.enable = false;
    p.laptop.setVisible(false);
    this.scene.setVisible(false, 'HUD');
    this.scene.launch('Cine');
    this.scene.bringToTop('Cine');
    const cine = this.scene.get('Cine');

    const STOP_X = 64;
    this.waymo = this.add.image(-40, 145, 'waymo').setDepth(4);
    this.lidar = this.add.image(0, 0, 'px_cyan').setDepth(5);
    this.tweens.add({ targets: this.waymo, x: STOP_X, duration: 2200, ease: 'Cubic.out' });

    // Every ping and line stays up long enough to read (pacing.js), so they take turns; the
    // beats hang off the lines, so the choreography holds: he hops out a beat into the second
    // line, and the car drives off still asking for a rating. About 17s, skippable.
    const PINGS = ["can you make one small change before the demo? it's literally one line", 'also maybe dark mode'];
    const LINES = ['You have arrived at the edge of my service area.', 'Anthropic HQ is 9.4 miles away. Please take your belongings.', 'Rate your ride: ★★★★★?'];
    const LAST_PING = 'btw the office AI has been acting weird today';
    const pings = sequence(600, PINGS.map(cardMs));
    const lines = sequence(pings.end, LINES.map(lineMs));
    const at = (ms, fn) => this.introEvents.push(this.time.delayedCall(ms, fn));
    this.introEvents = [];
    pings.starts.forEach((ms, i) => at(ms, () => cine.phone(PINGS[i])));
    at(lines.starts[0], () => {
      cine.hidePhone();
      cine.say('WAYMO', LINES[0]);
      this.sfx('start', 0.4);
    });
    at(lines.starts[1], () => cine.say('WAYMO', LINES[1]));
    at(lines.starts[1] + 900, () => {
      this.waymo.setTexture('waymo_open');
      p.setPosition(this.waymo.x - 5, 150).setVisible(true);
      p.body.enable = true;
      p.setVelocityY(-120);
      p.laptop.setPosition(p.x, p.y + 6).setVisible(true);
    });
    at(lines.starts[2], () => cine.say('WAYMO', LINES[2]));
    at(lines.starts[2] + 600, () => {
      this.waymo.setTexture('waymo');
      this.tweens.add({ targets: this.waymo, x: -80, duration: 1800, ease: 'Cubic.in' });
    });
    at(lines.end, () => {
      cine.say(null, null);
      cine.phone(LAST_PING);
    });
    at(lines.end + cardMs(LAST_PING), () => this.endIntro());

    // A skip key stops here: the HUD also binds ESC (pause) further down the scene list, and
    // would pause the level the moment the skip clears the cutscene flag.
    this.skipIntro = (e) => {
      e?.stopPropagation?.();
      this.endIntro();
    };
    for (const k of ['keydown-ENTER', 'keydown-SPACE', 'keydown-ESC']) this.input.keyboard.once(k, this.skipIntro);
    this.input.once('pointerdown', this.skipIntro);
  }

  updateIntro(time) {
    // HUD launch is queued and starting a scene makes it visible again; keep it hidden.
    if (this.scene.isVisible('HUD')) this.scene.setVisible(false, 'HUD');
    if (this.waymo?.active) placeLidar(this.lidar, this.waymo, time);
    if (this.player.visible) this.player.laptop.follow(time);
  }

  endIntro() {
    if (!this.cutscene) return;
    this.cutscene = false;
    this.registry.set('cutscene', false);
    for (const e of this.introEvents) e.remove(false);
    for (const k of ['keydown-ENTER', 'keydown-SPACE', 'keydown-ESC']) this.input.keyboard.off(k, this.skipIntro);
    this.input.off('pointerdown', this.skipIntro);
    this.tweens.killTweensOf(this.waymo);
    this.waymo.destroy();
    this.lidar.destroy();
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

  // Powell St cable car over the widened gap: waits at the left station until someone lands
  // on the roof, carries them across (Arcade carries riders on immovable moving bodies),
  // waits, then returns so a missed jump is never a dead end.
  buildCableCar() {
    const X0 = 89 * 16;
    const X1 = 100 * 16;
    const RAIL_Y = 160;
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x34343c).fillRect(X0, RAIL_Y, X1 - X0, 2);
    g.fillStyle(0xb8603f).fillRect(X0, RAIL_Y, X1 - X0, 1);
    for (let x = X0 + 24; x < X1; x += 48) g.fillStyle(0x2a2a30).fillRect(x, RAIL_Y + 2, 2, 30);

    const car = this.physics.add.image(X0 + 30, RAIL_Y - 16, 'trolley').setDepth(3);
    if (car.preFX && this.game.renderer.type === Phaser.WEBGL) car.preFX.addGlow(0xe3b341, 2, 0, false, 0.1, 8);
    car.body.setAllowGravity(false).setImmovable(true);
    car.body.setSize(46, 6).setOffset(5, 0); // the roof is the platform
    car.body.checkCollision.down = car.body.checkCollision.left = car.body.checkCollision.right = false;
    this.physics.add.collider(this.player, car, () => {
      if (this.player.body.touching.down) this.carRiddenAt = this.time.now;
    });
    this.car = { img: car, xL: X0 + 30, xR: X1 - 30, state: 'waitL', since: 0 };
  }

  updateCableCar(time) {
    const c = this.car;
    const ridden = time - (this.carRiddenAt ?? -1e9) < 120;
    const SPEED = 46;
    if (c.state === 'waitL' && ridden) {
      c.state = 'goR';
      this.sfx('start', 0.35); // ding ding
    } else if (c.state === 'goR' && c.img.x >= c.xR) {
      c.state = 'waitR';
      c.since = time;
    } else if (c.state === 'waitR' && time - c.since > 1500 && !ridden) c.state = 'goL';
    else if (c.state === 'goL' && c.img.x <= c.xL) c.state = 'waitL';
    c.img.setVelocityX(c.state === 'goR' ? SPEED : c.state === 'goL' ? -SPEED : 0);
    if (c.state === 'waitL' || c.state === 'waitR') c.img.x = Phaser.Math.Clamp(c.img.x, c.xL, c.xR);
  }
}
