import Phaser from 'phaser';
import { voice } from '../voice.js';
import { mic } from '../micStream.js';
import { micCheck } from '../settings.js';
import { keymap } from '../keymap.js';
import { uiText } from '../util.js';
import { applyScreenFX } from '../fx.js';
import { terminalWindow } from '../terminal.js';
import { menu, textRow } from '../menu.js';
import { beginFromTitle } from '../run.js';

const QUIET_MS = 4000; // no sound at all for this long: say so
const NO_WORDS_MS = 6000; // sound, but no words
const TRIES = 3; // things said that were not a command
const LOUD = 0.02;
const METER = { x: 70, y: 292, w: 420, h: 12 };
const WHY = {
  blocked: 'The microphone is blocked: allow it from the address bar.',
  none: 'No microphone found.',
  failed: 'The microphone could not be opened.',
};

// The mic check: once per browser, between the title's PLAY NOW and the run (and from V on the
// title, or the settings screen, at any time). It fetches the speech pack if this browser has
// none, asks for the microphone, and has the player say a command: hearing one proves the
// whole chain before a fight depends on it. Nothing here is timed: the run clock starts in
// beginRun, after it.
export default class MicCheck extends Phaser.Scene {
  constructor() {
    super('MicCheck');
  }

  // data.then: where a pass or a skip leads: 'run' (from PLAY NOW), 'title' or 'settings'.
  create(data) {
    this.then = data?.then ?? 'title';
    this.sys.settings.data = {}; // Phaser would hand the next visit this one's data
    this.state = 'idle'; // idle | pack | mic | listen | passed
    this.left = false; // Phaser reuses this scene object: a second visit must not start as gone
    this.visit = (this.visit ?? 0) + 1;
    this.tries = 0;
    this.heardText = '';
    this.listenAt = this.soundAt = this.wordsAt = null;
    applyScreenFX(this.cameras.main);
    const win = terminalWindow(this, 'vibecoder@sf: ~/survive-coders - shoutr-flow --setup');
    const left = win.x + 30;
    uiText(this, left, 82, '$ shoutr-flow --setup', { size: 16, color: '#8b8b8b' });
    uiText(this, left, 118, 'SHOUTR FLOW', { size: 48, color: '#d97757' });
    const how = voice.mode === 'hold' ? `hold ${keymap.name('talk')} and say a power to run it` : 'say a power out loud to run it. no key.';
    uiText(this, left, 184, `your voice is a weapon: ${how}`, { size: 16, color: '#f5f5f5' });
    this.prompt = uiText(this, left, 226, '', { size: 48, color: '#39c5cf' });
    this.g = this.add.graphics();
    this.heardLine = uiText(this, left, 316, '', { size: 16, color: '#e3b341' });
    this.note = uiText(this, left, 346, '', { size: 16, color: '#f5f5f5', wrap: 820 });
    uiText(this, left, 386, 'Your voice is recognised on this computer. Nothing you say is sent anywhere.', { size: 16, color: '#8b8b8b' });
    if (this.then === 'run') uiText(this, left, 482, 'shown once. Shoutr Flow can be turned off in settings.', { size: 16, color: '#555555' });

    const rows = [
      textRow(this, left, 414, () => ({ idle: 'SET UP SHOUTR FLOW', pack: 'GETTING THE SPEECH PACK', mic: 'WAITING FOR THE MIC', listen: 'LISTENING', passed: 'HEARD YOU' })[this.state], {
        onPick: () => this.setUp(),
        enabled: () => this.state === 'idle',
      }),
      textRow(this, left, 446, this.then === 'run' ? 'PLAY WITH THE KEYS' : 'BACK', { onPick: () => this.leave(false) }),
    ];
    this.rows = rows;
    this.menu = menu(this, rows, { onBack: () => this.back() });

    const onHeard = (text, final) => {
      if (this.state !== 'listen') return;
      this.heardText = text;
      this.wordsAt = performance.now();
      if (final) this.tries++;
    };
    const onCommand = () => this.state === 'listen' && this.pass();
    voice.on('heard', onHeard);
    voice.on('command', onCommand);
    this.events.once('shutdown', () => {
      voice.off('heard', onHeard);
      voice.off('command', onCommand);
    });
    if (voice.local === 'downloadable') this.say('First time here: this fetches a speech pack (about 60 MB, once).');
  }

  say(text, bad = false) {
    this.note.setText(text).setTint(bad ? 0xe5534b : 0xf5f5f5);
  }

  to(state) {
    this.state = state;
    for (const row of this.rows) row.redraw();
    this.menu.refresh();
    if (state === 'idle') this.menu.select(0);
  }

  // Runs inside the key press or click that picked the row: the speech pack's download must be
  // asked for there, before anything is awaited.
  setUp() {
    if (this.state !== 'idle') return;
    const pack = voice.local === 'available' ? Promise.resolve(true) : voice.install();
    this.proceed(pack, voice.local !== 'available');
  }

  async proceed(pack, fetching) {
    // A wait here can outlive the visit: the download, or a mic prompt nobody answers. Phaser
    // reuses this scene object, and only leaves a scene on the next frame, so "still here" is
    // this visit and not left: an old wait must not carry on into the next visit, or a run.
    const visit = this.visit;
    const here = () => this.visit === visit && !this.left && this.sys.isActive();
    if (fetching) {
      this.to('pack');
      this.say('getting the speech pack (about 60 MB, once)...');
    }
    const got = await pack;
    if (!here()) return;
    if (!got) return this.fail("Couldn't get the speech pack. Try again, or play with the keys.");
    this.to('mic');
    this.say("allow the microphone in the browser's prompt");
    const opened = await mic.open();
    // Gone: close the mic this visit opened, unless a run has since taken it for itself.
    if (!here()) return void (voice.session || voice.opening || voice.checking || mic.close());
    if (!opened.ok) return this.fail(WHY[opened.reason]);
    await voice.beginCheck();
    if (!here()) return; // leaving has already ended the check
    if (voice.error) return this.fail(`${voice.error}. The keys always work.`);
    this.to('listen');
    this.say('');
    this.prompt.setText('say SHIP IT').setTint(0x39c5cf);
    this.listenAt = performance.now();
    this.soundAt = this.wordsAt = null;
    this.tries = 0;
  }

  fail(why) {
    voice.endCheck(false);
    this.prompt.setText('');
    this.heardLine.setText('');
    this.to('idle');
    this.say(why, true);
  }

  pass() {
    micCheck.pass();
    this.to('passed');
    this.say('');
    this.prompt.setText('✓ heard you').setTint(0x3fb950);
    this.time.delayedCall(600, () => this.leave(true));
  }

  // On to the run (keeping the session a pass left listening), or back where the check was
  // opened from.
  leave(passed) {
    if (this.left) return;
    this.left = true;
    if (this.then === 'run') {
      // A pass keeps its session, also when the keys row is picked in the moment after it.
      voice.endCheck(passed || this.state === 'passed');
      beginFromTitle(this);
      return;
    }
    voice.endCheck(false);
    if (this.then === 'settings') this.scene.start('Settings', { from: 'mic' });
    else this.scene.start('Title', {});
  }

  // ESC: from PLAY NOW's check it is a change of mind, back to the title.
  back() {
    if (this.then !== 'run') return this.leave(false);
    if (this.left) return;
    this.left = true;
    voice.endCheck(false);
    this.scene.start('Title', {});
  }

  update() {
    const g = this.g.clear();
    if (this.state !== 'listen' && this.state !== 'passed') return;
    const now = performance.now();
    const level = mic.level();
    if (level > LOUD) this.soundAt = now;
    g.fillStyle(0x1a1719).fillRect(METER.x, METER.y, METER.w, METER.h);
    g.fillStyle(0x3fb950).fillRect(METER.x, METER.y, Math.round(METER.w * Math.min(1, level / 0.25)), METER.h);
    this.heardLine.setText(this.heardText ? `heard "${this.heardText.slice(-44)}"` : '');
    if (this.state !== 'listen') return;
    if (voice.error) return this.fail(`${voice.error}. The keys always work.`);
    if (this.tries >= TRIES) this.say(`Heard "${this.heardText.slice(-30)}". Voice may be unreliable on this mic; the keys always work.`, true);
    else if (this.soundAt == null && now - this.listenAt > QUIET_MS) this.say('No sound is reaching the mic: check the input device in your system sound settings.', true);
    else if (this.soundAt != null && this.wordsAt == null && now - this.listenAt > NO_WORDS_MS) this.say('Heard sound but no words. Move closer, or check which microphone is selected.', true);
    else this.say('');
  }
}
