import Phaser from 'phaser';
import { uiText } from '../util.js';
import { applyScreenFX } from '../fx.js';
import { CREDITS, terminalWindow } from '../terminal.js';

export default class End extends Phaser.Scene {
  constructor() {
    super('End');
  }

  create({ win }) {
    applyScreenFX(this.cameras.main);
    const stars = this.registry.get('stars') ?? 0;
    const w = terminalWindow(this, win ? 'git push origin main — success' : 'process exited with code 1');
    const left = w.x + 30;
    uiText(this, left, 90, win ? '$ git push origin main' : '$ npm run survive', { size: 18, color: '#8b8b8b' });
    uiText(this, left, 125, win ? 'SHIPPED.' : 'CONTEXT EXHAUSTED', { size: 60, color: win ? '#3fb950' : '#e5534b' });
    uiText(
      this,
      left,
      210,
      win ? 'The Context Rot Hydra is compacted. Your small change is merged.' : 'The vibes ran out. Try a smaller change.',
      { size: 20, color: '#f5f5f5' },
    );
    uiText(this, left, 280, `★ ${stars} GitHub stars`, { size: 44, color: '#e3b341' });
    const again = uiText(this, left, 420, '$ press ENTER to play again_', { size: 20, color: '#d97757' });
    this.tweens.add({ targets: again, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    uiText(this, 480, 530, CREDITS, { size: 11, color: '#555555', ox: 0.5, oy: 1 });
    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('Title'));
  }
}
