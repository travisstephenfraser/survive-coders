import Phaser from 'phaser';
import Player from '../entities/Player.js';
import { SPAWNERS } from '../entities/enemies.js';
import { T } from '../sprites.js';
import { FACADE } from '../hqArt.js';
import { addParallax, panParallax } from '../backdrops.js';
import { voice } from '../voice.js';
import { MAX_HP, MAX_TOKENS, TILE, ZOOM, floatText, jokeText, worldText } from '../util.js';
import { applyScreenFX, flash, shake } from '../fx.js';
import { sfx as playSfx } from '../audio.js';
import { TOUCH } from '../touch.js';
import { loopSong } from './Songs.js';

// MAX stream: random alphanumerics, mostly white with syntax-highlight accents.
const STREAM_CHARS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'];
const STREAM_COLORS = ['#f5f5f5', '#f5f5f5', '#f5f5f5', '#d97757', '#3fb950'];
const DONE_LINGER_MS = 800; // a tip you just acted on stays this long, so the change registers

// Outdoor tile sets per theme (the HQ interior has its own wall/shelf logic in buildWorld).
const TILESETS = {
  suburbs: { top: T.TOP, fill: T.FILL, pl: T.PLAT_L, pm: T.PLAT_M, pr: T.PLAT_R },
  park: { top: T.PARK_TOP, fill: T.PARK_FILL, pl: T.PARK_PL, pm: T.PARK_PM, pr: T.PARK_PR },
  tower: { top: T.TOWER_TOP, fill: T.TOWER_FILL, pl: T.TOWER_PL, pm: T.TOWER_PM, pr: T.TOWER_PR },
};

// Shared plumbing for playable scenes: tilemap from ASCII, player, bolts, enemies, hazards,
// stars, voice powers, HUD. Subclasses call buildWorld() and add their own content.
export default class PlayScene extends Phaser.Scene {
  buildWorld(rows, theme = 'suburbs') {
    // Phaser reuses scene instances: reset per-run state so a second run behaves like the first.
    // The scene clock only refreshes `now` in its first update, so during create() it is stale
    // (0 on a first run); sync it or every "now + delay" scheduled here is already in the past.
    this.time.now = this.game.loop.time;
    this.outcome = null; // 'win' | 'lose', decided once per encounter
    this.cutscene = false;
    this.stopping = false;
    this.leaving = false;
    this.shots = 0; // prompts and MAX characters fired in this level (the SPACE tip waits on one)
    this.lastPower = null; // the last power that ran here (the refactor tip waits on it)
    this.tipDone = null;
    this.registry.set('toast', null); // a tip waiting on you never follows you out of a level
    this.exitDoor = null;
    this.physics.world.resume(); // a shutdown mid hit-stop would otherwise leave physics paused
    const H = rows.length;
    const W = Math.max(...rows.map((r) => r.length));
    const hq = theme === 'hq';
    const set = TILESETS[theme] ?? TILESETS.suburbs;
    // Out-of-bounds counts as solid on the sides/bottom and open above.
    const at = (x, y) => (y < 0 ? '.' : y >= H || x < 0 || x >= W ? '#' : (rows[y][x] ?? '.'));
    const groundTile = (x, y) => {
      if (at(x, y - 1) !== '#') return hq ? T.HQ_TOP : set.top;
      if (!hq) return set.fill;
      if (at(x + 1, y) !== '#') return T.HQ_WALL_L;
      if (at(x - 1, y) !== '#') return T.HQ_WALL_R;
      return T.HQ_FILL;
    };
    const platformTile = (x, y) => {
      const l = at(x - 1, y) === '=';
      const r = at(x + 1, y) === '=';
      if (hq && !l && !r) return T.HQ_BLOCK;
      if (!l) return hq ? T.HQ_PL : set.pl;
      if (!r) return hq ? T.HQ_PR : set.pr;
      return hq ? T.HQ_PM : set.pm;
    };
    const data = [];
    const spawns = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        const ch = rows[y][x] ?? '.';
        if (ch === '#') row.push(groundTile(x, y));
        else if (ch === '=') row.push(platformTile(x, y));
        else {
          row.push(-1);
          if (ch !== '.') spawns.push({ ch, x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
        }
      }
      data.push(row);
    }
    this.worldW = W * TILE;
    this.worldH = H * TILE;

    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
    this.layer = map.createLayer(0, tiles, 0, 0);
    this.layer.setCollisionByExclusion([-1]);

    // Tall world bounds so pits read as falls; fellInPit() catches the player first.
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH + 400);

    this.bolts = this.physics.add.group({ allowGravity: false });
    this.blasts = this.physics.add.group({ allowGravity: false });
    this.enemies = this.physics.add.group({ runChildUpdate: true });
    // Enemies hold still during cutscenes (their AI would otherwise walk up to a frozen player).
    const runChildren = this.enemies.preUpdate.bind(this.enemies);
    this.enemies.preUpdate = (time, delta) => {
      if (this.cutscene) {
        for (const e of this.enemies.getChildren()) if (e.body?.blocked.down) e.setVelocityX(0);
        return;
      }
      runChildren(time, delta);
    };
    this.hazards = this.physics.add.group({ allowGravity: false });
    this.stars = this.physics.add.group({ allowGravity: false });
    this.maxChips = this.physics.add.group({ allowGravity: false });

    const p = spawns.find((s) => s.ch === 'P') ?? { x: 32, y: 32 };
    this.player = new Player(this, p.x, p.y);

    for (const s of spawns) {
      if (SPAWNERS[s.ch]) new SPAWNERS[s.ch](this, s.x, s.y);
      else if (s.ch === '*') this.placeStar(s.x, s.y);
      else if (s.ch === 'M') this.placeMax(s.x, s.y);
    }
    this.spawns = spawns;

    this.physics.add.collider(this.player, this.layer);
    // Ghost enemies (follow-up emails) drift through the terrain.
    this.physics.add.collider(this.enemies, this.layer, null, (e) => !e.ghost);
    this.physics.add.collider(this.bolts, this.layer, (b) => b.destroy());
    // Ghost hazards (the gaslight orb) pass through platforms instead of breaking on them; a
    // hazard can leave something where it lands (onLand).
    this.physics.add.collider(
      this.hazards,
      this.layer,
      (h) => {
        h.onLand?.();
        h.destroy();
      },
      (h) => !h.ghost,
    );
    this.physics.add.overlap(this.bolts, this.enemies, (b, e) => {
      if (!b.active || e.dying) return;
      const dmg = b.dmg ?? 1; // MAX stream characters carry 0.5
      this.burst(b.x, b.y, 'px_white', dmg < 1 ? 2 : 4);
      b.destroy();
      e.hurt(dmg);
    });
    this.physics.add.overlap(this.blasts, this.enemies, (bl, e) => {
      if (e.dying || bl.hit.has(e)) return;
      bl.hit.add(e);
      e.hurt(6);
    });
    // An enemy can answer contact itself (a founder's demo grab, a jogger's bump); otherwise it hurts.
    this.physics.add.overlap(this.player, this.enemies, (pl, e) => {
      if (e.dying || e.onTouchPlayer?.(pl)) return;
      if (pl.hurt(1, e.x)) e.recoil(pl.x);
    });
    this.physics.add.overlap(this.player, this.hazards, (pl, h) => {
      if (!h.active) return;
      if (!h.harmless) pl.hurt(1, h.x); // a contract locks you in instead (its onHitPlayer)
      // A hit's effect (the gaslight reversal) lands even when god mode or i-frames block the damage.
      if (pl.targetable) h.onHitPlayer?.(pl);
      h.destroy();
    });
    this.physics.add.overlap(this.player, this.stars, (pl, s) => {
      if (!s.active) return;
      s.destroy();
      this.addStars(1, s.x, s.y - 6);
      this.sfx('star', 0.35);
    });
    this.physics.add.overlap(this.player, this.maxChips, (pl, c) => {
      if (!c.active) return;
      c.destroy();
      this.grantMax(c.x, c.y);
    });

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.startFollow(this.player, true, 0.15, 0.06); // vertical follows slower (Eiserloh)
    cam.setBackgroundColor('#0d0d0d');
    this.lookahead = 0;
    this.markPits(data, W, H);
    if (theme === 'suburbs') this.markBlocks(at, W, H);
    applyScreenFX(cam);

    this.onPower = (name) => this.usePower(name);
    this.powerGate = () => this.inputLocked;
    voice.on('power', this.onPower);
    voice.gate = this.powerGate; // powers held during intros (1/2/3 used to fire under the Waymo's)
    this.events.once('shutdown', () => {
      voice.off('power', this.onPower);
      if (voice.gate === this.powerGate) voice.gate = null;
      this.music?.destroy();
    });

    if (!this.scene.isActive('HUD')) this.scene.launch('HUD');
    this.scene.bringToTop('HUD');
    cam.fadeIn(300);
  }

  // Whether an intro owns the controls. BossHQ adds its entrance and title card.
  get inputLocked() {
    return this.cutscene;
  }

  // One-shot contextual tip in the HUD; `power` pulses that power's slot (teach at the moment
  // of need, like Mario 1-1, instead of a wall of text on the title screen). With `done`, the tip
  // stays until done() is true (you did the thing), then lingers DONE_LINGER_MS.
  toast(text, power, ms = 4200, done = null) {
    this.tipDone = done;
    this.registry.set('toast', { text, power, until: done ? Infinity : this.time.now + ms, at: this.time.now });
  }

  // Rollback is taught at the first real damage (a hit or a pit; god mode takes none), once per
  // run, and waits for any other tip, or a full context, to clear. Using it first counts as learned.
  teachRollback() {
    const r = this.registry;
    const tip = r.get('toast');
    if (r.get('rollbackTaught') || this.player.dead || this.player.hp >= MAX_HP || (tip && this.time.now < tip.until) || r.get('boss')?.overflow) return;
    r.set('rollbackTaught', true);
    this.toast(TOUCH ? 'Took a hit? Tap "rollback" below' : 'Took a hit? HOLD M, say "rollback" (or 2)', 'rollback');
  }

  sfx(key, volume = 0.5) {
    // One play per key per 60ms, so a MAX stream's hits don't stack into noise.
    this.lastSfx ??= {};
    if (this.time.now - (this.lastSfx[key] ?? -Infinity) < 60) return;
    this.lastSfx[key] = this.time.now;
    playSfx(this, key, volume);
  }

  playMusic(key, volume = 0.3) {
    this.music = null;
    loopSong(this, key, volume, (song) => (this.music = song), () => !this.outcome);
  }

  update(time) {
    if (this.cutscene) this.player.swallowEdges(); // presses during an intro don't fire after it
    if (this.cutscene || this.leaving) return; // an intro or the walk-in owns the player
    this.player.tick(time);
    if (this.tipDone?.()) {
      this.tipDone = null;
      const tip = this.registry.get('toast');
      if (tip) this.registry.set('toast', { ...tip, until: this.time.now + DONE_LINGER_MS });
    }
    this.teachRollback();
    // Camera lookahead: show more of what's ahead of the player (Itay Keren, "Scroll Back").
    this.lookahead = Phaser.Math.Linear(this.lookahead, -this.player.facing * 48, 0.04);
    this.cameras.main.setFollowOffset(this.lookahead, 0);
    if (this.player.y > this.worldH + 8 && !this.player.dead) this.player.fellInPit();
    for (const e of this.enemies.getChildren()) {
      if (e.y > this.worldH + 40 && !e.dying) e.destroy();
    }
    this.updateExit();
  }

  // Each level after the first is a checkpoint: heal, and remember what a retry restores.
  checkpoint() {
    this.registry.set('hp', MAX_HP);
    if (this.registry.get('stars') === undefined) this.registry.set('stars', 0);
    this.registry.set('checkpointStars', this.registry.get('stars'));
    this.registry.set('checkpointTokens', this.registry.get('maxTokens') ?? 0);
  }

  // Camera-pinned parallax layers (backdrops.js).
  buildParallax(layers) {
    this.parallax = addParallax(this, layers);
  }

  scrollParallax(time) {
    panParallax(this.parallax, this.cameras.main.worldView.x, time);
  }

  // A building on the map's exit (D): the facade runs past the camera's top and right edges;
  // two door panels (glass by default, steel for an elevator) slide open as the player nears,
  // and crossing the threshold walks in. `data` goes to the next scene.
  buildExit(facadeKey, next, { data, panel = 'hq_door', panelAlpha = 0.6 } = {}) {
    const d = this.spawns.find((s) => s.ch === 'D');
    const ground = d.y + TILE / 2;
    this.add.image(d.x - FACADE.door, ground, facadeKey).setOrigin(0, 1).setDepth(-1);
    // Behind everyone on the pavement; the walk-in brings them in front.
    const panels = [-1, 1].map((side) =>
      this.add.image(d.x + side * 5, ground, panel).setOrigin(0.5, 1).setFlipX(side > 0).setAlpha(panelAlpha).setDepth(-0.5),
    );
    this.exitDoor = { x: d.x, ground, panels, open: false, next, data };
    return this.exitDoor;
  }

  updateExit() {
    const door = this.exitDoor;
    const p = this.player;
    if (!door || this.leaving) return;
    // The doors open within 40px. The exit is crossing the threshold at any height, so
    // hopping over it still counts.
    this.setDoors(!p.dead && Math.abs(p.x - door.x) < 40);
    if (!p.dead && p.x >= door.x - 4) this.exit();
  }

  setDoors(open) {
    const door = this.exitDoor;
    if (door.open === open) return;
    door.open = open;
    door.panels.forEach((panel, i) => {
      const x = door.x + (i ? 1 : -1) * (open ? 15 : 5);
      this.tweens.killTweensOf(panel);
      this.tweens.add({ targets: panel, x, duration: Math.max(16, 26 * Math.abs(x - panel.x)), ease: 'Sine.inOut' });
    });
  }

  // Walk in: into the doorway, the doors slide shut in front, then the player shrinks and fades
  // into the lobby light (walking away from the camera) before the fade to the next scene.
  exit() {
    if (this.leaving) return;
    this.leaving = true;
    const p = this.player;
    const { x, ground, panels, next, data } = this.exitDoor;
    p.release?.();
    p.unlock?.();
    p.body.enable = false;
    this.tweens.killTweensOf([p, p.laptop]); // a landing squash would fight the walk-in's scale
    p.facing = 1;
    p.setFlipX(false).setScale(1).setAlpha(1).play('run', true);
    p.laptop.setFlipX(false);
    for (const panel of panels) panel.setDepth(6.5); // over the player (5) and laptop (6)
    this.setDoors(true);
    this.tweens.add({ targets: p, x: x - 1, y: ground - 8, duration: 220, ease: 'Sine.out' });
    this.tweens.add({ targets: p.laptop, x: x + 2, y: ground - 9, duration: 220, ease: 'Sine.out' });
    this.time.delayedCall(220, () => this.setDoors(false));
    this.tweens.add({ targets: [p, p.laptop], alpha: 0, scale: 0.8, y: ground - 11, delay: 220, duration: 480, ease: 'Sine.in' });
    this.time.delayedCall(620, () => {
      this.cameras.main.fadeOut(500);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(next, data));
    });
  }

  // Pits read as hazards: a red "404" glow at the bottom of every gap in the ground.
  markPits(data, W, H) {
    const ground = H - 1;
    let start = -1;
    for (let x = 0; x <= W; x++) {
      const gap = x < W && data[ground][x] === -1;
      if (gap && start < 0) start = x;
      if (!gap && start >= 0) {
        const px = start * TILE;
        const w = (x - start) * TILE;
        const glow = this.add.graphics().setDepth(-1);
        for (let i = 0; i < 6; i++) {
          glow.fillStyle(0xe5534b, 0.08 + i * 0.07);
          glow.fillRect(px, this.worldH - 18 + i * 3, w, 3);
        }
        worldText(this, px + w / 2, this.worldH - 26, '404', { color: '#e5534b', depth: -1 });
        start = -1;
      }
    }
  }

  // Blocks read as foreground against the equally dark city: a warm orange wash over all
  // terrain, then a dim neon edge on the exposed side faces of ground blocks.
  markBlocks(at, W, H) {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0xd97757, 0.3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; ) {
        const ch = at(x, y);
        let end = x + 1;
        while (end < W && at(end, y) === ch) end++;
        // Neon slabs only fill their top 12px (see slab() in sprites.js).
        if (ch === '#' || ch === '=') g.fillRect(x * TILE, y * TILE, (end - x) * TILE, ch === '=' ? 12 : TILE);
        x = end;
      }
    }
    g.fillStyle(0xb8603f);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (at(x, y) !== '#') continue;
        if (at(x - 1, y) !== '#' && x > 0) g.fillRect(x * TILE, y * TILE, 1, TILE);
        if (at(x + 1, y) !== '#' && x < W - 1) g.fillRect(x * TILE + TILE - 1, y * TILE, 1, TILE);
      }
    }
  }

  // Landing dust.
  dust(x, y) {
    const em = this.add.particles(x, y - 1, 'px_white', {
      speedX: { min: -40, max: 40 },
      speedY: { min: -18, max: -4 },
      lifespan: 260,
      alpha: { start: 0.7, end: 0 },
      scale: { start: 1, end: 0.5 },
      emitting: false,
    });
    em.setDepth(6);
    em.explode(6);
    this.time.delayedCall(400, () => em.destroy());
  }

  // Hit stop: freeze physics for a beat so impacts land (Vlambeer, "The Art of Screenshake").
  hitStop(ms = 50) {
    if (this.stopping) return;
    this.stopping = true;
    this.physics.world.pause();
    this.time.delayedCall(ms, () => {
      this.physics.world.resume();
      this.stopping = false;
    });
  }

  placeStar(x, y) {
    const s = this.stars.create(x, y, 'star');
    this.tweens.add({ targets: s, y: y - 2, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    return s;
  }

  // A kill's reward (hold) holds and rises with the kill's line, so the two never cross; a
  // pickup's pops at once.
  addStars(n, x, y, hold = false) {
    this.registry.set('stars', (this.registry.get('stars') ?? 0) + n);
    (hold ? jokeText : floatText)(this, x, y, `+${n}★`, '#e3b341');
  }

  // MAX power-up: a token budget that turns held fire into a character stream.
  placeMax(x, y) {
    const c = this.maxChips.create(x, y, 'max_chip');
    if (c.preFX && this.game.renderer.type === Phaser.WEBGL) c.preFX.addGlow(0xf59a70, 2, 0, false, 0.1, 8);
    this.tweens.add({ targets: c, y: y - 3, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  grantMax(x, y) {
    this.registry.set('maxTokens', MAX_TOKENS);
    floatText(this, x, y - 10, 'MAX', '#f59a70');
    this.burst(x, y, 'px_orange', 14);
    this.sfx('start', 0.5);
    this.toast(`MAX: hold ${TOUCH ? '>_' : 'SPACE'} to stream tokens`);
  }

  // Spend one MAX token on one character.
  fireStream(x, y, dir) {
    this.shots++;
    const left = this.registry.get('maxTokens') - 1;
    this.registry.set('maxTokens', left);
    const ch = Phaser.Utils.Array.GetRandom(STREAM_CHARS);
    const t = worldText(this, x + dir * 6, y + Phaser.Math.Between(-3, 3), ch, {
      color: Phaser.Utils.Array.GetRandom(STREAM_COLORS),
      depth: 7,
    });
    this.bolts.add(t);
    t.dmg = 0.5;
    t.body.setVelocity(dir * 260, Phaser.Math.Between(-14, 14));
    this.time.delayedCall(600, () => t.destroy());
    if (left === 0) this.toast('Usage limit reached. Resets in 5 hours.');
  }

  burst(x, y, tex = 'px_orange', count = 10) {
    const em = this.add.particles(x, y, tex, {
      speed: { min: 30, max: 110 },
      lifespan: 450,
      scale: { start: 1, end: 0 },
      gravityY: 200,
      emitting: false,
    });
    em.setDepth(20);
    em.explode(count);
    this.time.delayedCall(700, () => em.destroy());
  }

  // Prompts get light "autocomplete" aim: they bend toward the nearest enemy ahead that is
  // within 30px vertically, so small blobs and low Hydra heads are hittable from the floor.
  firePrompt(x, y, dir) {
    this.shots++;
    const SPEED = 230;
    const b = this.bolts.create(x + dir * 6, y + 1, 'bolt');
    let target = null;
    let best = Infinity;
    for (const e of this.enemies.getChildren()) {
      if (e.dying || !e.body || e.asleep) continue; // a sleeping Hydra head can't be hurt
      const dx = (e.body.center.x - b.x) * dir;
      const dy = e.body.center.y - b.y;
      if (dx < 6 || dx > 200 || Math.abs(dy) > 30) continue;
      const score = dx + Math.abs(dy) * 3;
      if (score < best) {
        best = score;
        target = { dx, dy };
      }
    }
    const vy = target ? Phaser.Math.Clamp(target.dy / (target.dx / SPEED), -110, 110) : 0;
    b.setFlipX(dir < 0);
    b.setVelocity(dir * SPEED, vy);
    b.setRotation(dir * Math.atan(vy / SPEED));
    b.setDepth(7);
    this.time.delayedCall(900, () => b.destroy());
  }

  spawnHazard(x, y, key, vx, vy, gravity = false, onHitPlayer) {
    const h = this.hazards.create(x, y, key);
    h.body.setAllowGravity(gravity);
    h.setVelocity(vx, vy);
    h.setDepth(8);
    h.onHitPlayer = onHitPlayer;
    this.time.delayedCall(5000, () => h.destroy());
    return h;
  }

  inView(obj) {
    return Phaser.Geom.Rectangle.Overlaps(this.cameras.main.worldView, obj.getBounds());
  }

  shout(str, color = '#d97757') {
    floatText(this, this.player.x, this.player.y - 22, `$ ${str}`, color, 7);
  }

  usePower(name) {
    const pl = this.player;
    if (pl.dead || this.leaving) return; // a rollback mid walk-in would teleport the player
    this.lastPower = name;
    if (name === 'ship') {
      this.shout('ship it');
      this.sfx('ship', 0.6);
      this.hitStop(120);
      const bl = this.blasts.create(pl.x + pl.facing * 14, pl.y - 2, 'blast');
      bl.hit = new Set();
      bl.setFlipX(pl.facing < 0).setDepth(9).setVelocity(pl.facing * 260, 0);
      this.tweens.add({ targets: bl, scale: 1.4, duration: 250, yoyo: true, repeat: 2 });
      this.time.delayedCall(1200, () => bl.destroy());
      shake(this.cameras.main, 200, 0.008);
    } else if (name === 'rollback') {
      this.shout('rollback', '#58a6ff');
      this.registry.set('rollbackTaught', true);
      this.sfx('rollback', 0.6);
      pl.rollback();
      flash(this.cameras.main, 200, 88, 166, 255);
    } else if (name === 'refactor') {
      this.shout('refactor', '#3fb950');
      this.sfx('refactor', 0.6);
      flash(this.cameras.main, 250, 63, 185, 80);
      if (pl.unlock()) floatText(this, pl.x, pl.y - 32, 'contract voided: loophole!', '#3fb950');
      for (const e of [...this.enemies.getChildren()]) {
        if (!this.inView(e) || e.dying) continue;
        if (e.refactorable) {
          this.burst(e.x, e.y, 'px_green', 12);
          e.refactored = true;
          e.die();
        } else e.onRefactor?.();
      }
      for (const h of [...this.hazards.getChildren()]) {
        this.burst(h.x, h.y, 'px_green', 4);
        h.destroy();
      }
      this.onRefactor?.();
    }
  }

  // First result wins; later callbacks (a death during the boss collapse, a queued victory
  // after a death) are ignored.
  endEncounter(result) {
    if (this.outcome) return false;
    this.outcome = result;
    return true;
  }

  onPlayerDead() {
    if (!this.endEncounter('lose')) return;
    this.music?.stop();
    this.sfx('lose', 0.6);
    this.time.delayedCall(900, () => {
      this.cameras.main.fadeOut(400);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.stop('HUD');
        this.scene.start('End', { win: false, retry: this.scene.key });
      });
    });
  }

  // Neon street sign on a pole.
  sign(x, y, str, color = '#39c5cf') {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x34343c).fillRect(x - 1, y + 4, 2, 160 - (y + 4));
    return worldText(this, x, y, str, { color, bg: '#0d0d0d', size: 6, depth: 2 });
  }
}
