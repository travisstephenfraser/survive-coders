import Phaser from 'phaser';
import { TOUCH } from './touch.js';
import { keymap } from './keymap.js';

// "Wispr Flow": spoken keywords fire powers.
export const POWERS = {
  ship: { label: 'ship it', does: 'big forward blast', cooldown: 6000, re: /\bship(ped|ping|s)?\b|\bshipit\b/ },
  rollback: { label: 'rollback', does: 'rewind 3s, heal', cooldown: 8000, re: /\broll ?backs?\b|\brole ?back\b|\broll bag\b|\brollback\b/ },
  refactor: { label: 'refactor', does: 'clear enemies; shrink the Hydra', cooldown: 10000, re: /\bre-? ?factor(ed|ing|s)?\b|\breactor\b|\brefractor\b/ },
};

// What the status line calls the push-to-talk control (its key, or the HUD's talk slot) and
// the powers' keys. A status that names a key is a function, read when the line is drawn: the
// keys can be rebound between runs (keymap.js).
const talkKey = () => (TOUCH ? 'talk' : keymap.name('talk'));
const powerKeys = () => Object.keys(POWERS).map((name) => keymap.name(name)).join('/');
const IDLE = () => `hold ${talkKey()} to talk`;
const NO_SPEECH = () => `no speech API here: use keys ${powerKeys()}`;

// Push-to-talk: hold the talk key (M unless rebound), say a command, release. The command fires
// on release, so ordinary talking (demo narration!) never triggers powers. The powers' own keys
// (1, 2 and 3 unless rebound) always work too, because Chrome's speech recognition needs network
// and demo rooms are loud.
class VoiceControl extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.readyAt = {};
    this.heard = '';
    this.transcript = '';
    this.listening = false; // M is held
    this.running = false; // recognizer session active
    this.pendingFire = false;
    this.keysSuspended = false; // while typing (the Chute's terminal), the talk and power keys are just letters
    this.gate = null; // set by the play scene: true while an intro owns the controls
    this.heldLocked = false; // this push-to-talk hold began under the gate
    this.status = IDLE;
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

  get supported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  // Ask for mic permission on the title screen so the first hold doesn't pop a prompt mid-fight.
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

  makeRecognizer() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
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
      this.status = e.error === 'not-allowed' ? 'mic blocked: allow it in the address bar' : `mic error: ${e.error}, keys ${powerKeys()} work`;
    };
    rec.onend = () => {
      this.running = false;
      if (this.pendingFire) {
        this.pendingFire = false;
        if (!this.fireFromTranscript() && this.status === 'processing...') this.status = IDLE;
      }
      // M pressed again (or Chrome timed out mid-hold): keep listening.
      if (this.listening) this.startSession();
    };
    return rec;
  }

  startSession() {
    if (this.running) return;
    try {
      this.rec.start();
      this.running = true;
    } catch {
      /* still shutting down; onend restarts */
    }
  }

  press() {
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
    this.startSession();
  }

  release() {
    if (!this.listening) return;
    this.listening = false;
    // A hold that began or ends while an intro owns the controls is dropped, so Chrome's late
    // final result can't fire it after the intro lifts.
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

  // Returns true if the power fired. Powers only fire while a play scene is listening.
  // `lastEvent` lets the HUD tell "heard" apart from "ran" and "cooling down".
  trigger(name, source) {
    if (this.listenerCount('power') === 0 || this.gate?.()) return false; // refused, no cooldown spent
    const now = performance.now();
    if ((this.readyAt[name] ?? 0) > now) {
      this.lastEvent = { type: 'cooldown', name, source, left: this.readyAt[name] - now, at: now };
      return false;
    }
    this.readyAt[name] = now + POWERS[name].cooldown;
    this.lastEvent = { type: 'fired', name, source, at: now };
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
