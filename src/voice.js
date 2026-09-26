import Phaser from 'phaser';

// "Wispr Flow": spoken keywords fire powers. Keys 1/2/3 always work too, because Chrome's
// speech recognition needs network and demo rooms are loud.
export const POWERS = {
  ship: { label: 'ship it', key: '1', cooldown: 6000, re: /\bship(ped|ping|s)?\b|\bshipit\b/ },
  rollback: { label: 'rollback', key: '2', cooldown: 8000, re: /\broll ?backs?\b|\brole ?back\b|\broll bag\b|\brollback\b/ },
  refactor: { label: 'refactor', key: '3', cooldown: 10000, re: /\bre-? ?factor(ed|ing|s)?\b|\breactor\b|\brefractor\b/ },
};

class VoiceControl extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.readyAt = {};
    this.heard = '';
    this.status = 'mic off  [M] to enable';
    this.enabled = false;
    this.session = 0;
    this.fired = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'm' || e.key === 'M') this.toggle();
      for (const [name, p] of Object.entries(POWERS)) if (e.key === p.key) this.trigger(name, 'key');
    });
  }

  get supported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  toggle() {
    if (this.enabled) this.stop();
    else this.start();
  }

  stop() {
    this.enabled = false;
    try {
      this.rec?.abort();
    } catch {
      /* not running */
    }
    this.status = 'mic off  [M] to enable';
  }

  start() {
    if (this.enabled) return;
    this.status = 'mic: asking permission...';
    if (!this.supported) {
      this.status = 'no mic in this browser: use keys 1/2/3';
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onstart = () => {
      this.status = 'mic on  [M] to mute';
    };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.toLowerCase().trim();
        if (!text) continue;
        this.heard = text;
        for (const [name, p] of Object.entries(POWERS)) {
          // Interim and final results repeat the same words; fire once per result.
          const id = `${this.session}:${i}:${name}`;
          if (p.re.test(text) && !this.fired.has(id)) {
            this.fired.add(id);
            this.trigger(name, 'voice');
          }
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.status = e.error === 'not-allowed' ? 'mic blocked: allow it in the address bar' : `mic error: ${e.error}  (keys 1/2/3 work)`;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.enabled = false;
    };
    rec.onend = () => {
      // Chrome ends recognition after silence; keep listening (only the current recognizer).
      if (!this.enabled || this.rec !== rec) return;
      this.session++;
      setTimeout(() => {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }, 250);
    };
    this.rec = rec;
    this.session++;
    this.enabled = true;
    try {
      rec.start();
    } catch {
      this.status = 'mic failed to start  (keys 1/2/3 work)';
      this.enabled = false;
    }
  }

  // Returns true if the power fired. Powers only fire while a play scene is listening.
  trigger(name, source) {
    if (this.listenerCount('power') === 0) return false;
    const now = performance.now();
    if ((this.readyAt[name] ?? 0) > now) return false;
    this.readyAt[name] = now + POWERS[name].cooldown;
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
