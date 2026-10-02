import Phaser from 'phaser';
import { POWERS, voice } from '../voice.js';
import { params, uiText } from '../util.js';
import { applyScreenFX } from '../fx.js';
import { CREDITS, terminalWindow } from '../terminal.js';
import { TOUCH, enterFullscreen } from '../touch.js';
import { menu, textRow } from '../menu.js';
import { beginFromTitle, run } from '../run.js';
import { arrivalBanner } from '../arrival.js';
import { keymap } from '../keymap.js';

export default class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(data) {
    run.reset(); // back at the title, any run in progress is over
    applyScreenFX(this.cameras.main);
    const win = terminalWindow(this, 'vibecoder@sf: ~/survive-coders - zsh');
    const left = win.x + 30;
    uiText(this, left, 82, '$ claude "make one small change"', { size: 16, color: '#8b8b8b' });
    uiText(this, left, 118, 'SURVIVE CODERS', { size: 48, color: '#d97757' });
    const tagline = uiText(this, left, 184, "a vibe coder's run from Daly City to Anthropic HQ", { size: 16, color: '#f5f5f5', wrap: 560 });
    // Arriving from a shared run (/s/ or /r/ link): the tagline becomes the challenge.
    if (params.has('vs')) {
      arrivalBanner(params.get('vs')).then((line) => {
        if (line && tagline.active) tagline.setText(line).setTint(0x3fb950);
      });
    }

    // Key art: the hero fills the right side, the laptop floating at his hand as it does in-game.
    this.add.image(756, 245, 'player_idle').setScale(12);
    const laptop = this.add.image(864, 235, 'laptop').setScale(6);
    this.tweens.add({ targets: laptop, y: 243, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    const key = (action) => keymap.name(action);
    const powerKeys = Object.keys(POWERS).map(key);
    const lines = [
      TOUCH ? '← → move    ↑ jump    >_ fire (hold it)' : `${keymap.pair('left', 'right')} move    ${keymap.names('jump', ' / ')} jump    ${key('fire')} fire prompts`,
      '',
      TOUCH
        ? `powers: tap the terminal bar${voice.supported ? ', or hold talk' : ''}`
        : { open: 'voice: say a command out loud', hold: `voice: HOLD ${key('talk')}, say a command, let go`, keys: 'powers: the keys below' }[voice.hint],
      '',
      '',
      '',
      '',
      'collect GitHub ★ on the way to HQ',
    ];
    uiText(this, left, 230, lines.join('\n'), { size: 16, color: '#f5f5f5' });
    // Command table in aligned columns (the font is proportional).
    uiText(this, left + 40, 296, '"ship it"\n"rollback"\n"refactor"', { size: 16, color: '#d97757' });
    if (!TOUCH) uiText(this, left + 242, 296, powerKeys.join('\n'), { size: 16, color: '#8b8b8b', ox: 1 }).setRightAlign();
    uiText(this, left + 280, 296, Object.values(POWERS).map((p) => p.does).join('\n'), { size: 16, color: '#f5f5f5' });

    // Demo god mode: no damage (pits still respawn you). Remembered across reloads. Deliberately
    // unlisted: typing GOD here toggles it, and only the in-game HUD badge shows it's on.
    let god = false;
    try {
      god = localStorage.getItem('sc_god') === '1';
    } catch {
      /* storage blocked: default off */
    }
    this.registry.set('god', god);
    // Mic setup, so a permission prompt never interrupts a run: on a keyboard V opens the mic
    // check (PLAY NOW leads to it once by itself); on a phone a tap asks for the mic. The keys
    // and the power taps always work.
    const micText = uiText(this, left + 520, 428, '', { size: 16 });
    const showMic = () => {
      if (TOUCH) {
        micText.setText(voice.primed ? 'mic ready ✓' : voice.supported ? 'tap: set up mic' : 'no speech: tap powers');
        micText.setTint(voice.primed ? 0x3fb950 : 0x8b8b8b);
        return;
      }
      const possible = voice.onDevice && voice.local !== 'unavailable';
      const how = { open: 'open', hold: `hold ${key('talk')}`, off: 'off' }[voice.mode];
      const set = possible && voice.ready;
      micText.setText(!possible ? 'needs Chrome on a computer' : voice.mode === 'off' ? 'V  Shoutr Flow: off' : set ? `V  Shoutr Flow: ${how} ✓` : 'V  set up Shoutr Flow');
      micText.setTint(set ? 0x3fb950 : 0x8b8b8b);
    };
    showMic();
    const primeMic = async () => {
      await voice.prime();
      showMic();
    };
    // The browser's answer about its speech pack decides the line, and whether PLAY NOW goes
    // by the check.
    if (!TOUCH) voice.probe().then(() => micText.active && showMic());
    const openCheck = () => voice.onDevice && voice.local && voice.local !== 'unavailable' && this.scene.start('MicCheck', { then: 'title' });
    this.input.keyboard.on('keydown-V', () => (TOUCH ? primeMic() : openCheck()));
    const godNote = uiText(this, left + 520, 452, '', { size: 16, color: '#3fb950' }).setAlpha(0);
    this.input.keyboard.createCombo('GOD', { resetOnMatch: true });
    this.input.keyboard.on('keycombomatch', () => {
      god = !god;
      this.registry.set('god', god);
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

    uiText(this, 480, 530, CREDITS, { size: 8, color: '#555555', ox: 0.5, oy: 1 });
    uiText(this, win.x + win.w - 16, win.y + win.h - 12, 'travisfraser.com', { size: 16, color: '#8b8b8b', ox: 1, oy: 1 });

    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      // Dev shortcuts: ?park, ?tower=59|60|61, ?chute, ?landing, ?ride, ?boss jump straight
      // to a level (unranked).
      beginFromTitle(this);
    };
    // A row picks on the release of a press that began on it, so a tap that left another screen
    // can't start a run. PLAY NOW's tap also takes a phone fullscreen: Android only grants it
    // from a tap's release.
    menu(
      this,
      [
        textRow(this, left, 414, 'PLAY NOW', {
          onPick: (via) => {
            if (via === 'pointer') enterFullscreen();
            // Once per browser, the mic check comes first. It is before the run's clock.
            if (voice.checkDue) this.scene.start('MicCheck', { then: 'run' });
            else go();
          },
        }),
        textRow(this, left, 446, 'LEADERBOARD', { onPick: () => this.scene.start('Leaderboard') }),
        textRow(this, left, 478, 'SETTINGS', { onPick: () => this.scene.start('Settings') }),
      ],
      { start: { leaderboard: 1, settings: 2 }[data?.from] ?? 0 },
    );
    // On a phone, a tap on the mic line sets up the mic.
    const onMic = (p) => voice.supported && !voice.primed && Phaser.Geom.Rectangle.Inflate(micText.getBounds(), 16, 16).contains(p.x, p.y);
    this.input.on('pointerdown', (p) => TOUCH && onMic(p) && primeMic());
  }
}
