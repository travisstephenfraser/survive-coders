import Phaser from 'phaser';

// The floating laptop: bobs beside the player and is where prompt bolts spawn.
export default class Laptop extends Phaser.GameObjects.Sprite {
  constructor(scene, owner) {
    super(scene, owner.x, owner.y, 'laptop');
    scene.add.existing(this);
    this.owner = owner;
    this.setDepth(6);
  }

  follow(time) {
    const o = this.owner;
    const tx = o.x + o.facing * 10;
    const ty = o.y - 1 + Math.sin(time / 250); // chest height: bolts must hit blobs
    
    this.x = Phaser.Math.Linear(this.x, tx, 0.3);
    this.y = Phaser.Math.Linear(this.y, ty, 0.35);
    this.setFlipX(o.facing < 0);
  }
}
