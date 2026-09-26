import Phaser from 'phaser';

// The floating laptop: bobs beside the player and is where prompt bolts spawn.
export default class Laptop extends Phaser.GameObjects.Sprite {
  constructor(scene, owner) {
    super(scene, owner.x, owner.y, 'laptop');
    scene.add.existing(this);
    this.owner = owner;
    this.setDepth(6);
  }

  // Recoil + flash when a prompt fires.
  kick() {
    this.recoil = 2;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(40, () => this.active && this.clearTint());
  }

  follow(time) {
    const o = this.owner;
    this.recoil = Math.max(0, (this.recoil ?? 0) - 0.4);
    const tx = o.x + o.facing * (10 - this.recoil);
    const ty = o.y - 1 + Math.sin(time / 250); // chest height: bolts must hit blobs
    
    this.x = Phaser.Math.Linear(this.x, tx, 0.3);
    this.y = Phaser.Math.Linear(this.y, ty, 0.35);
    this.setFlipX(o.facing < 0);
  }
}
