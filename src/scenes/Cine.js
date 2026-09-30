import Phaser from 'phaser';
import { uiText } from '../util.js';
import { phoneCard } from '../terminal.js';
import { TOUCH } from '../touch.js';
import { TYPE_MS } from '../pacing.js';

// Cutscene overlay: letterbox bars, a Slack phone card, and a speaker dialogue box with a
// typewriter reveal. Driven by the scene under it (Level1's intro, the elevator, the drop-off); the
// HUD is hidden meanwhile. The ride to HQ launches it with no bars (they'd cover its screen) and
// its own skip hint.

export default class Cine extends Phaser.Scene {
  constructor() {
    super('Cine');
  }

  create({ bars = true, skip } = {}) {
    this.top = this.add.rectangle(0, -70, 960, 70, 0x000000).setOrigin(0);
    this.bottom = this.add.rectangle(0, 540, 960, 70, 0x000000).setOrigin(0);
    if (bars) {
      this.tweens.add({ targets: this.top, y: 0, duration: 500, ease: 'Quad.out' });
      this.tweens.add({ targets: this.bottom, y: 470, duration: 500, ease: 'Quad.out' });
    }
    this.phoneUI = phoneCard(this, 590, 84, 350, 'Slack · #demo-day');
    this.speaker = uiText(this, 40, 492, '', { size: 16, color: '#39c5cf', oy: 0.5 });
    this.line = uiText(this, 40, 516, '', { size: 16, color: '#f5f5f5', oy: 0.5 });
    uiText(this, 944, 36, skip ?? (TOUCH ? 'tap to skip' : 'ENTER skip'), { size: 8, color: '#8b8b8b', ox: 1, oy: 0.5 });
    this.typing = null;
    // Phaser keeps a scene's last launch data when it's launched again without any, so the ride's
    // options would stick to the next intro. Forget them.
    this.events.once('shutdown', () => (this.sys.settings.data = {}));
  }

  phone(text) {
    this.phoneUI.show(text);
  }

  hidePhone() {
    this.phoneUI.hide();
  }

  say(speaker, text) {
    this.speaker.setText(speaker ? `${speaker}:` : '');
    this.typing = text ? { text, start: this.time.now } : null;
    if (!text) this.line.setText('');
  }

  close() {
    this.say(null, null);
    this.hidePhone();
    this.tweens.add({ targets: this.top, y: -70, duration: 400 });
    this.tweens.add({ targets: this.bottom, y: 540, duration: 400, onComplete: () => this.scene.stop() });
  }

  update(time) {
    if (!this.typing) return;
    const n = Math.min(this.typing.text.length, Math.floor((time - this.typing.start) / TYPE_MS));
    this.line.setText(this.typing.text.slice(0, n) + (n < this.typing.text.length ? '_' : ''));
  }
}
