import Phaser from 'phaser';
import { voice } from '../voice.js';
import { MAX_HP, params, uiText } from '../util.js';
import { applyScreenFX } from '../fx.js';
import { CREDITS, terminalWindow } from '../terminal.js';

export default class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    applyScreenFX(this.cameras.main);
    const win = terminalWindow(this, 'vibecoder@sf: ~/survive-coders — zsh');
    const left = win.x + 30;
    uiText(this, left, 80, '$ claude "make one small change"', { size: 18, color: '#8b8b8b' });
    uiText(this, left, 112, 'SURVIVE CODERS', { size: 64, color: '#d97757' });
    uiText(this, left, 190, "a vibe coder's run from Daly City to Anthropic HQ", { size: 18, color: '#f5f5f5' });

    this.add.image(760, 150, 'player_idle').setScale(6);
    this.add.image(830, 150, 'laptop').setScale(5);

    const lines = [
      '←→ move      ↑ / W / Z jump      SPACE fire prompts',
      '',
      'voice powers  (say it out loud, or press the key)',
      '  "ship it"    [1]  big forward blast',
      '  "rollback"   [2]  rewind 3s, heal',
      '  "refactor"   [3]  clear every enemy on screen',
      '',
      '[M] toggles the mic anytime · collect GitHub ★',
    ];
    uiText(this, left, 240, lines.join('\n'), { size: 17, color: '#f5f5f5' });

    const prompt = uiText(this, left, 440, '$ press ENTER to start (mic turns on)_', { size: 20, color: '#3fb950' });
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    uiText(this, 480, 530, CREDITS, { size: 11, color: '#555555', ox: 0.5, oy: 1 });

    const go = () => {
      voice.start();
      voice.resetCooldowns();
      if (this.cache.audio.exists('start')) this.sound.play('start', { volume: 0.5 });
      this.registry.set({ hp: MAX_HP, stars: 0, reversed: false, boss: null });
      this.scene.start(params.has('boss') ? 'BossHQ' : 'Level1');
    };
    this.input.keyboard.once('keydown-ENTER', go);
    this.input.once('pointerdown', go);
  }
}
