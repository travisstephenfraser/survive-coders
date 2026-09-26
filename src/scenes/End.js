import Phaser from 'phaser';
import { MAX_HP, uiText } from '../util.js';
import { voice } from '../voice.js';
import { applyScreenFX } from '../fx.js';
import { CREDITS, terminalWindow } from '../terminal.js';

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
    // Fast retry (Team Meat: short respawns). Boss deaths restart at the HQ checkpoint.
    this.input.keyboard.once('keydown-ENTER', () => {
      const atBoss = !win && retry === 'BossHQ';
      this.registry.set({ hp: MAX_HP, reversed: false, boss: null, toast: null, stars: atBoss ? (this.registry.get('checkpointStars') ?? 0) : 0 });
      voice.resetCooldowns();
      this.scene.start(atBoss ? 'BossHQ' : 'Level1');
    });
    this.input.keyboard.once('keydown-T', () => this.scene.start('Title'));
  }
}
