import Phaser from 'phaser';
import { MAX_HP, uiText } from '../util.js';
import { voice } from '../voice.js';
import { applyScreenFX } from '../fx.js';
import { CREDITS, phoneCard, terminalWindow } from '../terminal.js';

export default class End extends Phaser.Scene {
  constructor() {
    super('End');
  }

  create({ win, retry }) {
    applyScreenFX(this.cameras.main);
    const stars = this.registry.get('stars') ?? 0;
    const w = terminalWindow(this, win ? 'git push origin main - success' : 'process exited with code 1');
    const left = w.x + 30;
    uiText(this, left, 90, win ? '$ git push origin main' : '$ npm run survive', { size: 16, color: '#8b8b8b' });
    uiText(this, left, 126, win ? 'SHIPPED.' : 'CONTEXT EXHAUSTED', { size: win ? 64 : 40, color: win ? '#3fb950' : '#e5534b' });
    uiText(
      this,
      left,
      214,
      win ? 'The Context Rot Hydra is compacted.\nYour small change is merged.' : 'The vibes ran out.\nTry a smaller change.',
      { size: 16, color: '#f5f5f5', lineSpacing: 6 },
    );
    uiText(this, left, 290, `★ ${stars} GitHub stars`, { size: 40, color: '#e3b341' });
    // Cuphead-style progress on a boss death: show how close the run got.
    const boss = this.registry.get('boss');
    if (!win && retry === 'BossHQ' && boss) {
      uiText(this, left, 350, `hydra: ${3 - boss.heads}/3 heads cut`, { size: 16, color: '#d97757' });
    }
    const retryLabel = !win && retry === 'BossHQ' ? 'retry the boss' : 'play again';
    const again = uiText(this, left, 430, `$ ENTER ${retryLabel}   T title_`, { size: 24, color: '#d97757' });
    this.tweens.add({ targets: again, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    uiText(this, 480, 530, CREDITS, { size: 8, color: '#555555', ox: 0.5, oy: 1 });
    if (win) this.payoff();
    // Fast retry (Team Meat: short respawns). Boss deaths restart at the HQ checkpoint.
    this.input.keyboard.once('keydown-ENTER', () => {
      const atBoss = !win && retry === 'BossHQ';
      this.registry.set({
        hp: MAX_HP,
        reversed: false,
        boss: null,
        toast: null,
        stars: atBoss ? (this.registry.get('checkpointStars') ?? 0) : 0,
        maxTokens: atBoss ? (this.registry.get('checkpointTokens') ?? 0) : 0,
      });
      voice.resetCooldowns();
      this.scene.start(atBoss ? 'BossHQ' : 'Level1');
    });
    this.input.keyboard.once('keydown-T', () => this.scene.start('Title'));
  }

  // Story bookend for the Waymo intro: the robotaxi comes back (HQ is in its service area),
  // and #demo-day asks for one more small change.
  payoff() {
    const car = this.add.image(-140, 404, 'waymo').setScale(2).setOrigin(0.5, 1);
    const sweep = this.add.image(0, 0, 'px_cyan').setScale(2);
    const line = uiText(this, 290, 364, '', { size: 16, color: '#39c5cf' });
    const text = 'WAYMO: This is within my service area. Welcome back.';
    this.tweens.add({
      targets: car,
      x: 200,
      duration: 1600,
      delay: 500,
      ease: 'Cubic.out',
      onComplete: () => {
        let n = 0;
        this.time.addEvent({ delay: 28, repeat: text.length - 1, callback: () => line.setText(text.slice(0, ++n)) });
      },
    });
    const spin = (time) => sweep.setPosition(car.x - 6 + Math.sin(time / 70) * 6, car.y - 54);
    this.events.on('update', spin);
    this.events.once('shutdown', () => this.events.off('update', spin)); // scene emitters outlive restarts
    const phone = phoneCard(this, 580, 62, 330, 'Slack · #demo-day');
    this.time.delayedCall(3600, () => phone.show('looks great!! one more small change?'));
  }
}
