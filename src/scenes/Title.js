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
    const win = terminalWindow(this, 'vibecoder@sf: ~/survive-coders - zsh');
    const left = win.x + 30;
    uiText(this, left, 82, '$ claude "make one small change"', { size: 16, color: '#8b8b8b' });
    uiText(this, left, 118, 'SURVIVE CODERS', { size: 48, color: '#d97757' });
    uiText(this, left, 184, "a vibe coder's run from Daly City to Anthropic HQ", { size: 16, color: '#f5f5f5' });

    this.add.image(812, 128, 'player_idle').setScale(5);
    this.add.image(866, 128, 'laptop').setScale(4);

    const lines = [
      '←→ move    ↑ / W / Z jump    SPACE fire prompts',
      '',
      'voice: HOLD M, say a command, let go',
      '',
      '',
      '',
      '',
      'collect GitHub ★ on the way to HQ',
    ];
    uiText(this, left, 230, lines.join('\n'), { size: 16, color: '#f5f5f5' });
    // Command table in aligned columns (the font is proportional).
    uiText(this, left + 40, 296, '"ship it"\n"rollback"\n"refactor"', { size: 16, color: '#d97757' });
    uiText(this, left + 230, 296, '1\n2\n3', { size: 16, color: '#8b8b8b' });
    uiText(this, left + 280, 296, 'big forward blast\nrewind 3s, heal\nclear enemies; shrink the Hydra', { size: 16, color: '#f5f5f5' });

    // Demo god mode: no damage (pits still respawn you). Remembered across reloads.
    let god = false;
    try {
      god = localStorage.getItem('sc_god') === '1';
    } catch {
      /* storage blocked: default off */
    }
    // Explicit mic setup (V) so a permission prompt never interrupts a run; keys 1/2/3 always work.
    const micText = uiText(this, left + 520, 428, '', { size: 16 });
    const showMic = () => {
      micText.setText(voice.primed ? 'V  mic ready ✓' : voice.supported ? 'V  set up mic (optional)' : 'no speech here: keys 1/2/3');
      micText.setTint(voice.primed ? 0x3fb950 : 0x8b8b8b);
    };
    showMic();
    this.input.keyboard.on('keydown-V', async () => {
      await voice.prime();
      showMic();
    });
    const godText = uiText(this, left + 520, 452, '', { size: 16 });
    const showGod = () => {
      godText.setText(`G  god mode: ${god ? 'ON' : 'off'}`);
      godText.setTint(god ? 0x3fb950 : 0x8b8b8b);
    };
    showGod();
    this.input.keyboard.on('keydown-G', () => {
      god = !god;
      try {
        localStorage.setItem('sc_god', god ? '1' : '0');
      } catch {
        /* ignore */
      }
      showGod();
    });

    const prompt = uiText(this, left, 446, '$ press ENTER to start_', { size: 24, color: '#3fb950' });
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    uiText(this, 480, 530, CREDITS, { size: 8, color: '#555555', ox: 0.5, oy: 1 });

    const go = () => {
      voice.resetCooldowns();
      if (this.cache.audio.exists('start')) this.sound.play('start', { volume: 0.5 });
      this.registry.set({ hp: MAX_HP, stars: 0, reversed: false, boss: null, god, bossIntroSeen: false, toast: null });
      this.scene.start(params.has('boss') ? 'BossHQ' : 'Level1');
    };
    this.input.keyboard.once('keydown-ENTER', go);
    this.input.once('pointerdown', go);
  }
}
