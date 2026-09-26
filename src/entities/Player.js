import Phaser from 'phaser';
import Laptop from './Laptop.js';
import { MAX_HP } from '../util.js';

const SPEED = 95;
const JUMP = 290;
const FIRE_MS = 170;
const SNAP_MS = 100;
const SNAPS = 30; // ~3s of rollback history

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player_idle');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setSize(10, 14).setOffset(3, 2);
    this.setCollideWorldBounds(true);
    this.setDepth(5);
    this.facing = 1;
    this.invulnUntil = 0;
    this.knockUntil = 0;
    this.reversedUntil = 0;
    this.coyoteUntil = 0;
    this.nextFire = 0;
    this.lastSnap = 0;
    this.history = [];
    this.safe = { x, y };
    this.keys = scene.input.keyboard.addKeys({
      left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D',
      jump: 'UP', jump2: 'W', jump3: 'Z',
      fire: 'SPACE', fire2: 'X', fire3: 'J',
    });
    this.laptop = new Laptop(scene, this);
  }

  get hp() {
    return this.scene.registry.get('hp');
  }

  set hp(v) {
    this.scene.registry.set('hp', Phaser.Math.Clamp(v, 0, MAX_HP));
  }

  tick(time) {
    if (this.dead) return;
    const k = this.keys;
    let dir = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const reversed = time < this.reversedUntil;
    if (this.scene.registry.get('reversed') !== reversed) this.scene.registry.set('reversed', reversed);
    if (reversed) dir = -dir;

    const onFloor = this.body.blocked.down;
    if (time > this.knockUntil) this.setVelocityX(dir * SPEED);
    if (dir) {
      this.facing = dir;
      this.setFlipX(dir < 0);
    }

    const JD = Phaser.Input.Keyboard.JustDown;
    const jumpHeld = k.jump.isDown || k.jump2.isDown || k.jump3.isDown;
    if (onFloor) this.coyoteUntil = time + 100;
    if ((JD(k.jump) || JD(k.jump2) || JD(k.jump3)) && time < this.coyoteUntil) {
      this.setVelocityY(-JUMP);
      this.coyoteUntil = 0;
      this.scene.sfx?.('jump', 0.4);
    }
    if (!jumpHeld && this.body.velocity.y < -110) this.setVelocityY(-110); // short hop on release

    if (!onFloor) {
      this.stop();
      this.setTexture('player_jump');
    } else if (dir) this.play('run', true);
    else {
      this.stop();
      this.setTexture('player_idle');
    }

    if ((k.fire.isDown || k.fire2.isDown || k.fire3.isDown) && time > this.nextFire) {
      this.nextFire = time + FIRE_MS;
      this.scene.firePrompt(this.laptop.x, this.laptop.y, this.facing);
      this.scene.sfx?.('shoot', 0.25);
    }

    if (time > this.lastSnap + SNAP_MS) {
      this.lastSnap = time;
      this.history.push({ x: this.x, y: this.y, hp: this.hp });
      if (this.history.length > SNAPS) this.history.shift();
    }
    if (onFloor && time > this.knockUntil) this.safe = { x: this.x, y: this.y };

    this.setAlpha(time < this.invulnUntil && Math.floor(time / 80) % 2 ? 0.35 : 1);
    this.laptop.follow(time);
  }

  hurt(dmg, fromX, force = false) {
    const t = this.scene.time.now;
    if (this.dead || (!force && t < this.invulnUntil)) return false;
    this.hp -= dmg;
    this.invulnUntil = t + 1000;
    this.knockUntil = t + 220;
    this.setVelocity((this.x < fromX ? -1 : 1) * 120, -160);
    this.scene.cameras.main.shake(120, 0.006);
    this.scene.sfx?.('hurt', 0.5);
    if (this.hp <= 0) {
      this.dead = true;
      this.setTint(0xe5534b);
      this.scene.onPlayerDead();
    }
    return true;
  }

  fellInPit() {
    if (this.hurt(1, this.x, true) && !this.dead) {
      this.setPosition(this.safe.x - this.facing * 8, this.safe.y - 4);
      this.setVelocity(0, 0);
    }
  }

  reverseControls(ms) {
    this.reversedUntil = this.scene.time.now + ms;
  }

  // Rewind to ~3s ago and heal at least one HP.
  rollback() {
    const snap = this.history[0];
    if (!snap) return;
    const ghost = this.scene.add.image(this.x, this.y, this.texture.key).setFlipX(this.flipX).setAlpha(0.6).setTint(0xd97757);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 500, onComplete: () => ghost.destroy() });
    this.setPosition(snap.x, snap.y);
    this.setVelocity(0, 0);
    this.hp = Math.max(this.hp + 1, snap.hp);
    this.history = [];
    this.invulnUntil = this.scene.time.now + 800;
  }
}
