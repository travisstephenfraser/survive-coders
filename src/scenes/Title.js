import Phaser from 'phaser';
import { voice } from '../voice.js';
import { MAX_HP, params, uiText } from '../util.js';
import { applyScreenFX } from '../fx.js';
import { CREDITS, terminalWindow } from '../terminal.js';
import { TOUCH, enterFullscreen } from '../touch.js';

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

    // Key art: the hero fills the right side, the laptop floating at his hand as it does in-game.
    this.add.image(756, 245, 'player_idle').setScale(12);
    const laptop = this.add.image(864, 235, 'laptop').setScale(6);
    this.tweens.add({ targets: laptop, y: 243, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    const lines = [
      TOUCH ? '← → move    ↑ jump    >_ fire (hold it)' : '←→ move    ↑ / W / Z jump    SPACE fire prompts',
      '',
      TOUCH ? `powers: tap the terminal bar${voice.supported ? ', or hold talk' : ''}` : 'voice: HOLD M, say a command, let go',
      '',
      '',
      '',
      '',
      'collect GitHub ★ on the way to HQ',
    ];
    uiText(this, left, 230, lines.join('\n'), { size: 16, color: '#f5f5f5' });
    // Command table in aligned columns (the font is proportional).
    uiText(this, left + 40, 296, '"ship it"\n"rollback"\n"refactor"', { size: 16, color: '#d97757' });
    if (!TOUCH) uiText(this, left + 230, 296, '1\n2\n3', { size: 16, color: '#8b8b8b' });
    uiText(this, left + 280, 296, 'big forward blast\nrewind 3s, heal\nclear enemies; shrink the Hydra', { size: 16, color: '#f5f5f5' });

    // Demo god mode: no damage (pits still respawn you). Remembered across reloads. Deliberately
    // unlisted: typing GOD here toggles it, and only the in-game HUD badge shows it's on.
    let god = false;
    try {
      god = localStorage.getItem('sc_god') === '1';
    } catch {
      /* storage blocked: default off */
    }
    // Explicit mic setup (V, or a tap) so a permission prompt never interrupts a run; keys
    // 1/2/3 and the power taps always work.
    const micText = uiText(this, left + 520, 428, '', { size: 16 });
    const showMic = () => {
      if (TOUCH) micText.setText(voice.primed ? 'mic ready ✓' : voice.supported ? 'tap: set up mic' : 'no speech: tap powers');
      else micText.setText(voice.primed ? 'V  mic ready ✓' : voice.supported ? 'V  set up mic (optional)' : 'no speech here: keys 1/2/3');
      micText.setTint(voice.primed ? 0x3fb950 : 0x8b8b8b);
    };
    showMic();
    const primeMic = async () => {
      await voice.prime();
      showMic();
    };
    this.input.keyboard.on('keydown-V', primeMic);
    const godNote = uiText(this, left + 520, 452, '', { size: 16, color: '#3fb950' }).setAlpha(0);
    this.input.keyboard.createCombo('GOD', { resetOnMatch: true });
    this.input.keyboard.on('keycombomatch', () => {
      god = !god;
      try {
        localStorage.setItem('sc_god', god ? '1' : '0');
      } catch {
        /* ignore */
      }
      // Brief confirmation for whoever typed it, then gone.
      godNote.setText(`god mode ${god ? 'on' : 'off'}`).setAlpha(1);
      this.tweens.killTweensOf(godNote);
      this.tweens.add({ targets: godNote, alpha: 0, delay: 900, duration: 400 });
    });

    const prompt = uiText(this, left, 446, TOUCH ? '$ tap to start_' : '$ press ENTER to start_', { size: 24, color: '#3fb950' });
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    uiText(this, 480, 530, CREDITS, { size: 8, color: '#555555', ox: 0.5, oy: 1 });
    uiText(this, win.x + win.w - 16, win.y + win.h - 12, 'travisfraser.com', { size: 16, color: '#8b8b8b', ox: 1, oy: 1 });

    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      voice.resetCooldowns();
      if (this.cache.audio.exists('start')) this.sound.play('start', { volume: 0.5 });
      this.registry.set({ hp: MAX_HP, stars: 0, maxTokens: 0, boss: null, god, bossIntroSeen: false, introSeen: false, parkIntroSeen: false, rollbackTaught: false, towerFloor: null, lockTaught: false, cutscene: false, toast: null });
      // Dev shortcuts: ?park, ?tower=59|60|61, ?chute, ?boss jump straight to a level.
      const floor = Number(params.get('tower'));
      if (params.has('tower')) this.scene.start('Tower', { floor: [59, 60, 61].includes(floor) ? floor : 59 });
      else this.scene.start(params.has('park') ? 'Park' : params.has('chute') ? 'Chute' : params.has('boss') ? 'BossHQ' : 'Level1');
    };
    this.input.keyboard.once('keydown-ENTER', go);
    // Start on release of a tap that began here (a tap that left another screen can't start a
    // run), except on the mic line. Release, not press: Android only grants fullscreen from it.
    let armed = false;
    const onMic = (p) => voice.supported && !voice.primed && Phaser.Geom.Rectangle.Inflate(micText.getBounds(), 16, 16).contains(p.x, p.y);
    this.input.on('pointerdown', (p) => {
      armed = !(TOUCH && onMic(p));
      if (!armed && TOUCH) primeMic();
    });
    this.input.on('pointerup', () => {
      if (!armed) return;
      enterFullscreen();
      go();
    });
  }
}
