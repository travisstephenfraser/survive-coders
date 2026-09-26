import Phaser from 'phaser';
import Player from '../entities/Player.js';
import { SPAWNERS } from '../entities/enemies.js';
import { T } from '../sprites.js';
import { voice } from '../voice.js';
import { TILE, ZOOM, floatText, worldText } from '../util.js';
import { applyScreenFX } from '../fx.js';

// Shared plumbing for playable scenes: tilemap from ASCII, player, bolts, enemies, hazards,
// stars, voice powers, HUD. Subclasses call buildWorld() and add their own content.
export default class PlayScene extends Phaser.Scene {
  buildWorld(rows, theme = 'suburbs') {
    const H = rows.length;
    const W = Math.max(...rows.map((r) => r.length));
    const hq = theme === 'hq';
    // Out-of-bounds counts as solid on the sides/bottom and open above.
    const at = (x, y) => (y < 0 ? '.' : y >= H || x < 0 || x >= W ? '#' : (rows[y][x] ?? '.'));
    const groundTile = (x, y) => {
      if (at(x, y - 1) !== '#') return hq ? T.HQ_TOP : T.TOP;
      if (!hq) return T.FILL;
      if (at(x + 1, y) !== '#') return T.HQ_WALL_L;
      if (at(x - 1, y) !== '#') return T.HQ_WALL_R;
      return T.HQ_FILL;
    };
    const platformTile = (x, y) => {
      const l = at(x - 1, y) === '=';
      const r = at(x + 1, y) === '=';
      if (hq && !l && !r) return T.HQ_BLOCK;
      if (!l) return hq ? T.HQ_PL : T.PLAT_L;
      if (!r) return hq ? T.HQ_PR : T.PLAT_R;
      return hq ? T.HQ_PM : T.PLAT_M;
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
    this.hazards = this.physics.add.group({ allowGravity: false });
    this.stars = this.physics.add.group({ allowGravity: false });

    const p = spawns.find((s) => s.ch === 'P') ?? { x: 32, y: 32 };
    this.player = new Player(this, p.x, p.y);

    for (const s of spawns) {
      if (SPAWNERS[s.ch]) new SPAWNERS[s.ch](this, s.x, s.y);
      else if (s.ch === '*') this.placeStar(s.x, s.y);
    }
    this.spawns = spawns;

    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.enemies, this.layer);
    this.physics.add.collider(this.bolts, this.layer, (b) => b.destroy());
    this.physics.add.collider(this.hazards, this.layer, (h) => h.destroy());
    this.physics.add.overlap(this.bolts, this.enemies, (b, e) => {
      if (!b.active || e.dying) return;
      b.destroy();
      e.hurt(1);
    });
    this.physics.add.overlap(this.blasts, this.enemies, (bl, e) => {
      if (e.dying || bl.hit.has(e)) return;
      bl.hit.add(e);
      e.hurt(6);
    });
    this.physics.add.overlap(this.player, this.enemies, (pl, e) => {
      if (!e.dying && pl.hurt(1, e.x)) e.recoil(pl.x);
    });
    this.physics.add.overlap(this.player, this.hazards, (pl, h) => {
      if (!h.active) return;
      if (pl.hurt(1, h.x)) h.onHitPlayer?.(pl);
      h.destroy();
    });
    this.physics.add.overlap(this.player, this.stars, (pl, s) => {
      if (!s.active) return;
      s.destroy();
      this.addStars(1, s.x, s.y - 6);
      this.sfx('star', 0.35);
    });

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setBackgroundColor('#0d0d0d');
    applyScreenFX(cam, { bloom: true });

    this.onPower = (name) => this.usePower(name);
    voice.on('power', this.onPower);
    this.events.once('shutdown', () => {
      voice.off('power', this.onPower);
      this.music?.stop();
    });

    if (!this.scene.isActive('HUD')) this.scene.launch('HUD');
    this.scene.bringToTop('HUD');
    cam.fadeIn(300);
  }

  sfx(key, volume = 0.5) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume });
  }

  playMusic(key, volume = 0.3) {
    if (!this.cache.audio.exists(key)) return;
    this.music = this.sound.add(key, { loop: true, volume });
    this.music.play();
  }

  update(time) {
    this.player.tick(time);
    if (this.player.y > this.worldH + 8 && !this.player.dead) this.player.fellInPit();
    for (const e of this.enemies.getChildren()) {
      if (e.y > this.worldH + 40 && !e.dying) e.destroy();
    }
  }

  placeStar(x, y) {
    const s = this.stars.create(x, y, 'star');
    this.tweens.add({ targets: s, y: y - 2, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    return s;
  }

  addStars(n, x, y) {
    this.registry.set('stars', (this.registry.get('stars') ?? 0) + n);
    floatText(this, x, y, `+${n}★`, '#e3b341');
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
    const SPEED = 230;
    const b = this.bolts.create(x + dir * 6, y + 1, 'bolt');
    let target = null;
    let best = Infinity;
    for (const e of this.enemies.getChildren()) {
      if (e.dying || !e.body) continue;
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
    if (pl.dead) return;
    if (name === 'ship') {
      this.shout('ship it');
      this.sfx('ship', 0.6);
      const bl = this.blasts.create(pl.x + pl.facing * 14, pl.y - 2, 'blast');
      bl.hit = new Set();
      bl.setFlipX(pl.facing < 0).setDepth(9).setVelocity(pl.facing * 260, 0);
      this.tweens.add({ targets: bl, scale: 1.4, duration: 250, yoyo: true, repeat: 2 });
      this.time.delayedCall(1200, () => bl.destroy());
      this.cameras.main.shake(200, 0.008);
    } else if (name === 'rollback') {
      this.shout('rollback', '#58a6ff');
      this.sfx('rollback', 0.6);
      pl.rollback();
      this.cameras.main.flash(200, 88, 166, 255);
    } else if (name === 'refactor') {
      this.shout('refactor', '#3fb950');
      this.sfx('refactor', 0.6);
      this.cameras.main.flash(250, 63, 185, 80);
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

  onPlayerDead() {
    this.music?.stop();
    this.sfx('lose', 0.6);
    this.time.delayedCall(900, () => {
      this.cameras.main.fadeOut(400);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.stop('HUD');
        this.scene.start('End', { win: false });
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
