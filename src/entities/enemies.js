import Phaser from 'phaser';
import { floatText, worldText } from '../util.js';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, key, hp, reward) {
    super(scene, x, y, key);
    scene.add.existing(this);
    scene.enemies.add(this); // group defaults applied here; configure the body after
    this.hp = hp;
    this.reward = reward;
    this.dir = -1;
    this.homeX = x;
    this.leash = 56; // patrol range around spawn, so nothing wanders onto the player spawn
    this.stunUntil = 0;
    this.refactorable = true;
    this.setDepth(4);
    // Red rim glow separates enemies from the busy neon background.
    if (this.preFX && scene.game.renderer.type === Phaser.WEBGL) this.preFX.addGlow(0xe5534b, 2, 0, false, 0.1, 8);
  }

  // Called after this enemy damages the player on contact: bounce off and pause.
  recoil(fromX) {
    const away = this.x < fromX ? -1 : 1;
    this.stunUntil = this.scene.time.now + 700;
    if (this.body.moves) this.setVelocity(away * 90, this.body.blocked.down ? -90 : this.body.velocity.y);
  }

  get stunned() {
    return this.scene.time.now < this.stunUntil;
  }

  hurt(dmg) {
    if (this.dying) return;
    this.hp -= dmg;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (!this.active) return;
      if (this.baseTint !== undefined) this.setTint(this.baseTint);
      else this.clearTint();
    });
    if (this.hp <= 0) this.die();
    else this.scene.sfx?.('hit', 0.3);
  }

  die() {
    if (this.dying) return;
    this.dying = true;
    this.scene.hitStop?.(45);
    this.scene.sfx?.('kill', 0.35);
    this.scene.addStars(this.reward, this.x, this.y - 10);
    this.scene.burst(this.x, this.y, 'px_orange');
    this.onDie?.();
    this.destroy();
  }

  // Walk back and forth, turning at walls and ledges.
  patrol(speed) {
    const b = this.body;
    if (!b.blocked.down) return;
    if (b.blocked.left) this.dir = 1;
    else if (b.blocked.right) this.dir = -1;
    else if (!this.groundAhead()) this.dir *= -1;
    else if (Math.abs(this.x + this.dir * 2 - this.homeX) > this.leash) this.dir = this.x < this.homeX ? 1 : -1;
    this.setVelocityX(this.dir * speed);
    this.setFlipX(this.dir < 0);
  }

  groundAhead() {
    const layer = this.scene.layer;
    return Boolean(layer.getTileAtWorldXY(this.x + this.dir * (this.body.halfWidth + 2), this.body.bottom + 2));
  }
}

const BAD_PROMPTS = ['make it better', 'fix', 'idk just do it', 'pls', 'no bugs this time', 'u know what i mean'];
const GLYPHS = '#$%&@!?;{}<>~^*=+/|';
const scramble = (n) => Array.from({ length: n }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('');

// Slime of scrambled text. Hops at you; splits into two letter-blobs on its first death.
export class BadPromptBlob extends Enemy {
  constructor(scene, x, y, small = false) {
    const pack = scene.textures.exists('pack_slime');
    super(scene, x, y, pack ? 'pack_slime' : small ? 'blob_small' : 'blob0', small ? 1 : 3, small ? 1 : 3);
    this.small = small;
    if (pack) {
      this.play('slime_hop');
      this.baseTint = 0xc9a0ff;
      this.setTint(this.baseTint);
      this.body.setSize(12, 9).setOffset(2, 7);
      if (small) this.setScale(0.6);
    } else if (small) this.body.setSize(8, 7).setOffset(0, 1);
    else {
      this.body.setSize(14, 9).setOffset(1, 5);
      this.play('blob');
    }
    // Body made of scrambled text.
    this.glyphs = worldText(scene, x, y, scramble(small ? 1 : 3), { tiny: true, color: '#f5f5f5', depth: 5 });
    this.nextScramble = 0;
    this.once('destroy', () => this.glyphs.destroy());
    this.nextHop = scene.time.now + Phaser.Math.Between(300, 900);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    this.glyphs.setPosition(this.x, this.body.bottom - (this.small ? 3 : 4));
    if (time > this.nextScramble) {
      this.nextScramble = time + 140;
      this.glyphs.setText(scramble(this.small ? 1 : 3));
    }
  }

  update(time) {
    if (this.dying || this.stunned) return;
    const p = this.scene.player;
    if (this.body.blocked.down) {
      this.setVelocityX(0);
      if (time > this.nextHop && Math.abs(p.x - this.x) < 170) {
        const dir = Math.sign(p.x - this.x) || 1;
        this.setVelocity(dir * (this.small ? 70 : 55), this.small ? -150 : -200);
        this.setFlipX(dir < 0);
        this.nextHop = time + Phaser.Math.Between(900, 1400);
      }
    }
  }

  onDie() {
    const { scene, x, y } = this;
    if (this.small) return;
    floatText(scene, x, y - 18, `"${Phaser.Utils.Array.GetRandom(BAD_PROMPTS)}"`, '#bc8cff', 6);
    if (this.refactored) return; // refactor clears the screen; no split
    scene.sfx?.('split', 0.4);
    // Spawn after the current physics step so we don't mutate the group mid-overlap.
    scene.time.delayedCall(0, () => {
      for (const d of [-1, 1]) {
        const s = new BadPromptBlob(scene, x + d * 4, y, true);
        s.setVelocity(d * 80, -160);
        s.nextHop = scene.time.now + 700;
      }
    });
  }
}

// Keycap-toothed goblin: patrols, charges when it sees you, spits keycaps.
export class KeyboardGoblin extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'goblin0', 4, 5);
    this.body.setSize(10, 15).setOffset(3, 1);
    this.play('goblin');
    this.nextSpit = 0;
  }

  update(time) {
    if (this.dying || this.stunned) return;
    const p = this.scene.player;
    const dx = p.x - this.x;
    const sees = Math.abs(dx) < 130 && Math.abs(p.y - this.y) < 28 && !p.dead;
    if (!sees) {
      this.patrol(28);
      return;
    }
    this.dir = Math.sign(dx) || 1;
    this.setFlipX(this.dir < 0);
    const tooFar = Math.abs(this.x + this.dir * 2 - this.homeX) > 110; // charge leash
    if (this.body.blocked.down) this.setVelocityX(this.groundAhead() && !tooFar ? this.dir * 70 : 0);
    if (time > this.nextSpit) {
      this.nextSpit = time + 1600;
      this.scene.spawnHazard(this.x + this.dir * 8, this.y - 3, 'keycap', this.dir * 130, 0);
    }
  }
}

// Flaming skull (Ninja Adventure pack, CC0): patrol filler, and the Hydra's spawn.
export class Skullops extends Enemy {
  constructor(scene, x, y) {
    const pack = scene.textures.exists('pack_skull');
    super(scene, x, y, pack ? 'pack_skull' : 'skullops', 2, 2);
    if (pack) {
      this.play('skull_walk');
      this.body.setSize(12, 12).setOffset(2, 4);
    } else this.body.setSize(12, 14).setOffset(2, 2);
  }

  update() {
    if (this.dying || this.stunned) return;
    this.patrol(26);
  }
}

export const SPAWNERS = { B: BadPromptBlob, G: KeyboardGoblin, S: Skullops };
