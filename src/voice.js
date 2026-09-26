import Phaser from 'phaser';

// "Wispr Flow": spoken keywords fire powers.
export const POWERS = {
  ship: { label: 'ship it', key: '1', cooldown: 6000, re: /\bship(ped|ping|s)?\b|\bshipit\b/ },
  rollback: { label: 'rollback', key: '2', cooldown: 8000, re: /\broll ?backs?\b|\brole ?back\b|\broll bag\b|\brollback\b/ },
  refactor: { label: 'refactor', key: '3', cooldown: 10000, re: /\bre-? ?factor(ed|ing|s)?\b|\breactor\b|\brefractor\b/ },
};

// Push-to-talk: hold M, say a command, release. The command fires on release, so ordinary
// talking (demo narration!) never triggers powers. Keys 1/2/3 always work too, because
// Chrome's speech recognition needs network and demo rooms are loud.
class VoiceControl extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.readyAt = {};
    this.heard = '';
    this.transcript = '';
    this.listening = false; // M is held
    this.running = false; // recognizer session active
    this.pendingFire = false;
    this.status = 'hold M to talk';
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        if (!e.repeat) this.press();
        return;
      }
      if (e.repeat) return;
      for (const [name, p] of Object.entries(POWERS)) if (e.key === p.key) this.trigger(name, 'key');
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'm' || e.key === 'M') this.release();
    });
    window.addEventListener('blur', () => this.release());
  }

  get supported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  // Ask for mic permission on the title screen so the first hold doesn't pop a prompt mid-fight.
  async prime() {
    if (!this.supported) {
      this.status = 'no speech API here: use keys 1/2/3';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      this.primed = true;
      this.status = 'hold M to talk';
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
      this.status = e.error === 'not-allowed' ? 'mic blocked: allow it in the address bar' : `mic error: ${e.error}, keys 1/2/3 work`;
    };
    rec.onend = () => {
      this.running = false;
      if (this.pendingFire) {
        this.pendingFire = false;
        if (!this.fireFromTranscript() && this.status === 'processing...') this.status = 'hold M to talk';
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
      this.status = 'no speech API here: use keys 1/2/3';
      return;
    }
    this.listening = true;
    this.pendingFire = false;
    this.transcript = '';
    this.heard = '';
    this.status = 'listening... release M';
    this.rec ??= this.makeRecognizer();
    this.startSession();
  }

  release() {
    if (!this.listening) return;
    this.listening = false;
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
    this.status = 'hold M to talk';
    this.trigger(best, 'voice');
    return true;
  }

  // Returns true if the power fired. Powers only fire while a play scene is listening.
  // `lastEvent` lets the HUD tell "heard" apart from "ran" and "cooling down".
  trigger(name, source) {
    if (this.listenerCount('power') === 0) return false;
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
