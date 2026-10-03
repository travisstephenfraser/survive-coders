import Phaser from 'phaser';
import { TOUCH } from './touch.js';
import { keymap } from './keymap.js';
import { micCheck, settings } from './settings.js';
import { mic } from './micStream.js';
import { createCounter, inHoldWindow } from './voiceMatch.js';

// "Shoutr Flow": spoken keywords fire powers. On a keyboard the browser recognises them on this
// computer (Chrome's on-device speech recognition; nothing said leaves it), from a session that
// runs for as long as a level is being played: say it, or hold the talk key and say it
// (settings). On a phone it is hold-to-talk through the browser's own recognizer, as it always
// was. `re` is what a phone's hold matches; a keyboard's patterns are in voiceMatch.js.
export const POWERS = {
  ship: { label: 'ship it', does: 'big forward blast', cooldown: 6000, re: /\bship(ped|ping|s)?\b|\bshipit\b/ },
  rollback: { label: 'rollback', does: 'rewind 3s, heal', cooldown: 8000, re: /\broll ?backs?\b|\brole ?back\b|\broll bag\b|\brollback\b/ },
  refactor: { label: 'refactor', does: 'clear enemies; shrink the Hydra', cooldown: 10000, re: /\bre-? ?factor(ed|ing|s)?\b|\breactor\b|\brefractor\b/ },
};

// What a status line calls the push-to-talk control (its key, or the HUD's talk slot) and
// the powers' keys: listed, or just "the keys" when their names are long, since the line sits
// beside the power slots and a long one ran over them. A status that names a key is a
// function, read when the line is drawn: the keys can be rebound between runs (keymap.js).
const talkKey = () => (TOUCH ? 'talk' : keymap.name('talk'));
export const powerKeys = () => {
  const list = keymap.short(Object.keys(POWERS), '/');
  return list ? `keys ${list}` : 'the keys';
};
const IDLE = () => `hold ${talkKey()} to talk`;
const NO_SPEECH = () => `no speech API here: use ${powerKeys()}`;

const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const LOCAL = { langs: ['en-US'], processLocally: true };
const HEARD_MS = 2500; // how long the HUD shows what Shoutr Flow last heard
const START_MS = 5000; // a recognizer that never sends `start` must not keep the mic open forever
// Errors a session does not get over by being started again.
const HARD = ['not-allowed', 'service-not-allowed', 'language-not-supported'];
const MIC_ERRORS = { blocked: 'mic blocked', none: 'no microphone', failed: 'mic failed' };
const SPEECH_ERRORS = { 'not-allowed': 'mic blocked', 'service-not-allowed': 'speech service blocked' };

// How a tip tells the player to run a power, by how voice is set up here. `short` for the tips
// that are already long; `first` when it starts a sentence.
export function howTo(name, { short = false, first = false } = {}) {
  const key = keymap.name(name);
  const said = `"${POWERS[name].label}"`;
  const talk = keymap.name('talk');
  const text = {
    open: short ? `say ${said} (or ${key})` : `say ${said} (or press ${key})`,
    hold: short ? `HOLD ${talk}, ${said} (or ${key})` : `HOLD ${talk}, say ${said} (or press ${key})`,
    keys: short ? `${key} is ${said}` : `press ${key} for ${POWERS[name].label}`,
  }[voice.hint];
  return first ? text[0].toUpperCase() + text.slice(1) : text;
}

class VoiceControl extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.readyAt = {};
    this.heardText = ''; // what was last heard (the `heard` getter lets it lapse on a keyboard)
    this.heardUntil = 0;
    this.transcript = '';
    this.listening = false; // the talk key or the talk slot is held
    this.keysSuspended = false; // while typing (the Chute's terminal), the talk and power keys are just letters
    this.gate = null; // set by the play scene: true while an intro owns the controls
    this.status = IDLE;

    // A phone: one recognizer session per hold.
    this.touchRunning = false;
    this.pendingFire = false;
    this.heldLocked = false; // this push-to-talk hold began under the gate

    // A keyboard: one session for as long as a level is being played.
    this.local = null; // what the browser says of its speech pack: available | downloadable | downloading | unavailable
    this.permission = null; // the mic's permission: granted | prompt | denied, or null where the browser won't say
    this.session = null; // the on-device recognizer, while one is wanted
    this.running = false; // it is really listening (between its start and its end)
    this.started = false;
    this.opening = false; // the mic is being opened for a session
    this.wanted = false; // a level is being played (run.js)
    this.checking = false; // the mic check owns the session (scenes/MicCheck.js)
    this.error = null; // why voice stopped, for the HUD
    this.lastError = null;
    this.strikes = 0;
    this.retryTimer = null;
    this.startTimer = null;
    this.down = null; // the talk key's last hold, for hold-to-talk's window
    this.up = null;
    this.counter = createCounter('open');
    this.said = ''; // the session's transcript so far

    window.addEventListener('keydown', (e) => {
      if (this.keysSuspended) return;
      if (keymap.has('talk', e.keyCode)) {
        if (!e.repeat) this.press();
        return;
      }
      if (e.repeat) return;
      for (const name of Object.keys(POWERS)) if (keymap.has(name, e.keyCode)) this.trigger(name, 'key');
    });
    window.addEventListener('keyup', (e) => {
      if (keymap.has('talk', e.keyCode)) this.release();
    });
    window.addEventListener('blur', () => this.release());
  }

  // A status can be a function, so a line that names a key names the one bound now.
  get status() {
    return typeof this.statusNow === 'function' ? this.statusNow() : this.statusNow;
  }

  set status(s) {
    this.statusNow = s;
  }

  // What was last heard. On a keyboard the mic is always open, so it lapses after HEARD_MS
  // instead of sitting in the HUD until the next thing is said.
  get heard() {
    return this.heardUntil && performance.now() > this.heardUntil ? '' : this.heardText;
  }

  set heard(text) {
    this.heardText = text;
    this.heardUntil = 0;
  }

  get supported() {
    return Boolean(SR());
  }

  // Speech can be recognised on this computer: Chrome 139 and later, on a keyboard. Phones have
  // no such mode and keep the browser's own recognizer.
  get onDevice() {
    const rec = SR();
    return !TOUCH && Boolean(rec && 'processLocally' in rec.prototype && rec.available && rec.install);
  }

  get mode() {
    return settings.get('mic');
  }

  // Voice is set up here: possible, wanted, proven by the mic check, the speech pack on this
  // computer and the mic still allowed. A browser can drop the pack, and a permission given
  // "this time" is gone by the next visit; until it has answered, a passed check is trusted.
  get ready() {
    const pack = this.local === null || this.local === 'available';
    const allowed = this.permission === null || this.permission === 'granted';
    return this.onDevice && this.mode !== 'off' && micCheck.passed() && pack && allowed;
  }

  // What the hints tell a player to do for a power: say it, hold the key and say it, or press.
  get hint() {
    return this.ready ? this.mode : 'keys';
  }

  // PLAY NOW should go by the mic check first: it has not been passed here, or the speech pack
  // has gone and only the check can fetch it, or the browser would ask for the mic again (and
  // would ask mid-level, which is what the check is there to prevent). A mic that is refused
  // is not asked about again: the keys it is. Only once the browser has said which of these it
  // is: an answer still on its way does not hold up a run.
  get checkDue() {
    if (!this.onDevice || this.mode === 'off') return false;
    const packGone = this.local === 'downloadable' || this.local === 'downloading';
    if (packGone) return true;
    if (this.local !== 'available') return false;
    return !micCheck.passed() || this.permission === 'prompt';
  }

  get speaking() {
    return this.running && mic.speaking();
  }

  // Ask the browser whether its English speech pack is here, and whether the mic is still
  // allowed.
  async probe() {
    if (!this.onDevice) return (this.local = 'unavailable');
    try {
      this.permission = (await navigator.permissions.query({ name: 'microphone' })).state;
    } catch {
      this.permission = null; // no answer: go by the passed check
    }
    try {
      this.local = await SR().available(LOCAL);
    } catch {
      this.local = 'unavailable';
    }
    return this.local;
  }

  // Fetch the speech pack (about 60 MB, once). Chrome only starts it from inside the key press
  // or click that asked for it, so nothing may be awaited before this is called.
  install() {
    let asked;
    try {
      asked = SR().install(LOCAL);
    } catch {
      return Promise.resolve(false);
    }
    return asked.then(
      async (ok) => {
        if (!ok) return false;
        // The browser can report the pack a moment after the download says it is done.
        for (let i = 0; i < 40 && (await this.probe()) !== 'available'; i++) await new Promise((r) => setTimeout(r, 250));
        return this.local === 'available';
      },
      () => false,
    );
  }

  // Ask for mic permission on the title screen so the first hold doesn't pop a prompt mid-fight.
  // A phone's setup; a keyboard has the mic check.
  async prime() {
    if (!this.supported) {
      this.status = NO_SPEECH;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      this.primed = true;
      this.status = IDLE;
    } catch {
      this.primed = false;
      this.status = 'mic blocked: allow it in the address bar';
    }
  }

  // ---- A keyboard: the on-device session ----

  // Called every frame by run.js with whether a level is being played. Only a change does
  // anything: start listening when one begins, stop (and end the mic's track) when it pauses,
  // hides or ends. A stopped session's error is forgotten at the next start, which tries again.
  listenWhile(on) {
    if (TOUCH || this.checking || on === this.wanted) return;
    this.wanted = on;
    if (!on) return this.stopSession();
    this.error = null;
    this.strikes = 0;
    if (this.ready) this.startSession();
  }

  // The mic check takes the session before the run exists, and hands it over (keep) or ends it.
  beginCheck() {
    this.checking = true;
    this.error = null;
    this.strikes = 0;
    return this.startSession();
  }

  endCheck(keep) {
    this.checking = false;
    if (!keep) return this.stopSession();
    // The session goes on into the run with the mode's own patterns. The new count starts level
    // with what has been said, or the "ship it" that passed the check would fire in level 1.
    // It is the run's from this moment: a tab hidden before the first frame still stops it.
    this.wanted = true;
    this.counter = createCounter(this.mode === 'hold' ? 'hold' : 'open');
    this.counter.feed(this.said, performance.now());
  }

  async startSession() {
    if (this.session || this.opening || this.retryTimer !== null) return;
    this.opening = true;
    const opened = await mic.open();
    this.opening = false;
    // Paused, hidden or left while the mic was opening.
    if (!this.wanted && !this.checking) return mic.close();
    if (opened.reason === 'blocked') this.permission = 'denied';
    if (!opened.ok) {
      this.error = MIC_ERRORS[opened.reason];
      return;
    }
    this.permission = 'granted';
    // The check listens for the command itself, whatever the mode.
    this.counter = createCounter(this.mode === 'hold' && !this.checking ? 'hold' : 'open');
    this.session = this.makeLocal();
    // The track can end by itself (the mic unplugged, its permission withdrawn), and Chrome tells
    // the recognizer nothing: it would sit there deaf, the light still lit. Our own mic.close()
    // fires no `ended`.
    mic.track().onended = () => this.session && this.retry();
    this.begin();
  }

  begin() {
    this.started = false;
    this.lastError = null;
    this.startTimer = setTimeout(() => this.retry(), START_MS);
    try {
      this.session.start(mic.track());
    } catch {
      this.retry(); // the track is not live: nothing started, and no event will ever say so
    }
  }

  // The session cannot go on as it is: its track ended, or it would not start. Close it, open
  // the mic again and start another after a short backoff, three times at most. Replacing the
  // recognizer too avoids reusing an object whose audio service has failed.
  retry() {
    const on = this.wanted || this.checking;
    this.stopSession();
    if (++this.strikes >= 3) this.error = 'Shoutr Flow stopped';
    else if (on) this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.wanted || this.checking) this.startSession();
    }, 500 * this.strikes);
  }

  stopSession() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.startTimer);
    this.retryTimer = this.startTimer = null;
    const session = this.session;
    this.session = null;
    this.running = false;
    this.heard = '';
    this.listening = false;
    this.down = this.up = null;
    try {
      session?.abort();
    } catch {
      // not running
    }
    mic.close();
  }

  makeLocal() {
    const rec = new (SR())();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.processLocally = true; // recognised on this computer: nothing said is sent anywhere
    // No phrases are favoured: measured on 2026-10-02, favouring the three commands made the
    // recognizer write them when nobody had said them.
    rec.onstart = () => {
      if (rec !== this.session) return;
      clearTimeout(this.startTimer);
      this.startTimer = null;
      this.started = true;
      this.running = true;
      this.said = '';
      this.counter.reset();
    };
    rec.onresult = (e) => {
      if (rec !== this.session) return;
      const now = performance.now();
      this.strikes = 0;
      const said = [...e.results].map((r) => r[0].transcript);
      this.said = said.join(' ');
      this.heardText = (said.at(-1) ?? '').trim().toLowerCase();
      this.heardUntil = now + HEARD_MS;
      this.emit('heard', this.heardText, e.results[e.results.length - 1].isFinal);
      // Commands fire on unsettled results: waiting for the settled one costs a third of a
      // second, and the recognizer was seen to settle a "rollback" it had heard as "back".
      // The mic check takes any command; a run takes one only where its power could run.
      for (const fire of this.counter.feed(this.said, now, () => this.checking || this.takes(now))) {
        this.emit('command', fire);
        if (!this.checking) this.trigger(fire.name, 'voice', { heard: fire.heard, alike: fire.alike });
      }
    };
    rec.onerror = (e) => {
      if (rec !== this.session) return;
      this.lastError = e.error;
      // The speech pack is not on this computer after all. Chrome sends no `end` after this
      // one, so nothing else would notice; the title's next look offers the mic check again.
      if (e.error === 'language-not-supported') {
        this.stopSession();
        this.error = 'speech pack missing';
        this.probe();
      } else if (HARD.includes(e.error)) {
        // Some capture failures send no `end`. Close immediately so a failed recognizer
        // never leaves a green listening light, or retries a refused microphone forever.
        this.stopSession();
        if (e.error === 'not-allowed') this.permission = 'denied';
        this.error = SPEECH_ERRORS[e.error];
      } else {
        // Recoverable errors (including audio-capture) need a fresh track, not another
        // start on the same broken audio path. Do not depend on a later `end` event.
        this.retry();
      }
    };
    rec.onend = () => {
      if (rec !== this.session) return; // stopped on purpose
      // Every unexpected end counts, even one after a second. A real result resets the
      // strikes; merely starting again does not prove the recognizer has recovered.
      this.retry();
    };
    return rec;
  }

  // Whether a command heard now would run its power. One heard where it would not (an intro,
  // a pause, a typing screen, no level, a talk key that is up) is dropped, never kept for later.
  takes(now) {
    if (this.keysSuspended || this.gate?.() || this.listenerCount('power') === 0) return false;
    return this.mode !== 'hold' || inHoldWindow(now, this.down, this.up);
  }

  // The talk key, or a phone's talk slot. On a keyboard it only opens hold-to-talk's window:
  // the recognizer is already listening.
  press() {
    if (TOUCH) return this.pressTouch();
    if (this.listening) return;
    this.listening = true;
    this.down = performance.now();
    this.up = null;
  }

  release() {
    if (TOUCH) return this.releaseTouch();
    if (!this.listening) return;
    this.listening = false;
    this.up = performance.now();
  }

  // ---- A phone: push-to-talk. Hold the talk slot, say a command, release. The command fires
  // on release, through the browser's own recognizer, which needs the network. ----

  makeRecognizer() {
    const rec = new (SR())();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += `${e.results[i][0].transcript} `;
      this.transcript = text.toLowerCase().trim();
      this.heard = this.transcript;
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.status = e.error === 'not-allowed' ? 'mic blocked: allow it in the address bar' : `mic error: ${e.error}, ${powerKeys()} work`;
    };
    rec.onend = () => {
      this.touchRunning = false;
      if (this.pendingFire) {
        this.pendingFire = false;
        if (!this.fireFromTranscript() && this.status === 'processing...') this.status = IDLE;
      }
      // Pressed again (or the browser timed out mid-hold): keep listening.
      if (this.listening) this.startTouch();
    };
    return rec;
  }

  startTouch() {
    if (this.touchRunning) return;
    try {
      this.rec.start();
      this.touchRunning = true;
    } catch {
      /* still shutting down; onend restarts */
    }
  }

  pressTouch() {
    if (this.listening) return;
    if (!this.supported) {
      this.status = NO_SPEECH;
      return;
    }
    this.listening = true;
    this.heldLocked = Boolean(this.gate?.());
    this.pendingFire = false;
    this.transcript = '';
    this.heard = '';
    this.status = `listening... release ${talkKey()}`;
    this.rec ??= this.makeRecognizer();
    this.startTouch();
  }

  releaseTouch() {
    if (!this.listening) return;
    this.listening = false;
    // A hold that began or ends while an intro owns the controls is dropped, so the browser's
    // late final result can't fire it after the intro lifts.
    if (this.heldLocked || this.gate?.()) {
      this.heldLocked = false;
      this.transcript = '';
      this.status = IDLE;
      try {
        this.rec.abort();
      } catch {
        /* not running */
      }
      return;
    }
    if (this.fireFromTranscript()) {
      try {
        this.rec.abort();
      } catch {
        /* not running */
      }
      return;
    }
    // Command not in the interim text yet: stop and fire from the final result in onend.
    this.pendingFire = true;
    this.status = 'processing...';
    try {
      this.rec.stop();
    } catch {
      /* not running */
    }
  }

  // Fire the earliest command spoken in this hold. Returns true if one fired.
  fireFromTranscript() {
    const text = this.transcript;
    let best = null;
    let bestAt = Infinity;
    for (const [name, p] of Object.entries(POWERS)) {
      const m = p.re.exec(text);
      if (m && m.index < bestAt) {
        best = name;
        bestAt = m.index;
      }
    }
    if (!best) {
      if (text) this.status = `no command heard, try again`;
      return false;
    }
    this.transcript = '';
    this.status = IDLE;
    this.trigger(best, 'voice');
    return true;
  }

  // ---- Both ----

  // Returns true if the power fired. Powers only fire while a play scene is listening.
  // `lastEvent` lets the HUD tell "heard" apart from "ran" and "cooling down"; a voice fire on
  // a keyboard carries what was heard and whether it was only a sound-alike (`said`).
  trigger(name, source, said = {}) {
    if (this.listenerCount('power') === 0 || this.gate?.()) return false; // refused, no cooldown spent
    const now = performance.now();
    if ((this.readyAt[name] ?? 0) > now) {
      this.lastEvent = { type: 'cooldown', name, source, left: this.readyAt[name] - now, at: now, ...said };
      return false;
    }
    this.readyAt[name] = now + POWERS[name].cooldown;
    this.lastEvent = { type: 'fired', name, source, at: now, ...said };
    this.emit('power', name, source);
    return true;
  }

  remaining(name) {
    return Math.max(0, (this.readyAt[name] ?? 0) - performance.now());
  }

  resetCooldowns() {
    this.readyAt = {};
  }
}

export const voice = new VoiceControl();
