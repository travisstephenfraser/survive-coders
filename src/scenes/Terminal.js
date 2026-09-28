import Phaser from 'phaser';
import { POWERS, voice } from '../voice.js';
import { FONT_KEY, uiText } from '../util.js';
import { hex } from '../palette.js';
import { terminalWindow } from '../terminal.js';
import { TOUCH } from '../touch.js';
import { findSpoken, matchLine, normalize } from '../lineMatch.js';
import { keyClick } from '../noise.js';

// The Chute's terminal: Claude Code, on the laptop tumbling beside you. The next line waits as a
// ghost to type over; ENTER sends, TAB fills it in ("that's vibe coding"), Backspace fixes. Case,
// spacing and small typos don't matter (lineMatch.js). On touch every tap types the next letter,
// or hold talk and say the line. Claude thinks, its reply types out, and the Chute plays it out;
// a line sent while Claude is still answering waits its turn. The altimeter sits top right.
const LINES = [
  { text: 'build me a parachute', reply: "Here's your parachute! I also connected it to your CRM." },
  { text: 'no, a real one', reply: 'Parachute Pro: $150/seat/month. Deploy requires Enterprise tier.' },
  { text: 'ship it', reply: 'Deploying anyway. ✓', spoken: POWERS.ship.re }, // "ship it" doesn't wait on Claude
];
const HELLO = 'Free fall detected. How can I help?';
const MISS = "You're absolutely right! Could you say that again?";
const CRASH = '404: parachute not found';
const TYPE_MS = 24; // Claude's replies, a letter at a time
const THINK_MS = 450;
const WIN = { x: 40, y: 380, w: 880, h: 148 };
const BOX = { x: 56, y: 472, h: 34 }; // the prompt box
const TALK = { x: 800, y: 474, w: 104, h: 30 }; // touch with speech: hold to say the line
const ALT = { x: 700, y: 10, w: 248, h: 54 };
const TEXT_X = 92; // where typing starts in the prompt box
const fmt = (ft) => `${ft.toLocaleString('en-US')} ft`;
const inside = (p, r) => p.x >= r.x - 8 && p.x < r.x + r.w + 8 && p.y >= r.y - 8 && p.y < r.y + r.h + 8;

export default class Terminal extends Phaser.Scene {
  constructor() {
    super('Terminal');
  }

  create() {
    // The scene clock only refreshes `now` in its first update; the greeting is timed from it.
    this.time.now = this.game.loop.time;
    this.chute = this.scene.get('Chute');
    this.line = 0;
    this.typed = '';
    this.done = false;
    this.queued = false;
    this.answer = null;
    this.heardWords = 0;
    this.lastHeard = '';
    this.talkPointer = null;
    this.toastBox = null;
    this.talk = TOUCH && voice.supported;
    this.boxW = (this.talk ? TALK.x - 10 : WIN.x + WIN.w - 16) - BOX.x;
    // Widths from the pixel font's advances, so the ghost starts right where the typing ends
    // (trailing spaces included).
    const chars = this.cache.bitmapFont.get(FONT_KEY).data.chars;
    this.advance = (s) => [...s].reduce((w, ch) => w + (chars[ch.charCodeAt(0)]?.xAdvance ?? 0), 0) * 2;

    const win = terminalWindow(this, 'claude · ~/sf/free-fall', WIN);
    this.g = this.add.graphics();
    const mid = BOX.y + BOX.h / 2;
    this.echo = uiText(this, 64, 431, '', { size: 16, color: '#8b8b8b', oy: 0.5 });
    this.bullet = uiText(this, 64, 454, '●', { size: 16, color: '#d97757', oy: 0.5 });
    this.reply = uiText(this, 84, 454, '', { size: 16, color: '#f5f5f5', oy: 0.5 });
    this.prompt = uiText(this, 72, mid, '>', { size: 16, color: '#d97757', oy: 0.5 });
    this.ghost = uiText(this, TEXT_X, mid, '', { size: 16, color: '#6e7681', oy: 0.5 });
    this.typedText = uiText(this, TEXT_X, mid, '', { size: 16, color: '#f5f5f5', oy: 0.5 });
    const hint = TOUCH ? `every tap types the next letter${this.talk ? ', or hold talk and say it' : ''}` : 'TAB autocomplete   ENTER send';
    this.hint = uiText(this, WIN.x + WIN.w - 16, 518, hint, { size: 8, color: '#8b8b8b', ox: 1, oy: 0.5 });
    this.talkLabel = this.talk ? uiText(this, TALK.x + TALK.w / 2, TALK.y + TALK.h / 2, '● talk', { size: 16, color: '#f5f5f5', ox: 0.5, oy: 0.5 }) : null;
    // The pane slides up from the bottom edge as the fall begins.
    this.pane = this.add.container(0, 170, [...win.parts, this.g, this.echo, this.bullet, this.reply, this.prompt, this.ghost, this.typedText, this.hint, this.talkLabel].filter(Boolean));
    this.tweens.add({ targets: this.pane, y: 0, duration: 380, ease: 'Cubic.out' });

    this.altG = this.add.graphics();
    this.altLabel = uiText(this, ALT.x + 14, ALT.y + ALT.h / 2, 'ALT', { size: 8, color: '#8b8b8b', oy: 0.5 });
    this.altText = uiText(this, ALT.x + ALT.w - 14, ALT.y + ALT.h / 2 + 2, fmt(this.chute.alt), { size: 32, color: '#f5f5f5', ox: 1, oy: 0.5 });

    this.say(HELLO, '#f5f5f5', 350);

    // Keys straight from the window: Phaser queues keyboard events to its next step, too late to
    // stop TAB moving the browser's focus.
    const onKey = (e) => {
      if (!this.sys.isActive() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        this.complete();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.send();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (!this.done && this.typed) {
          this.typed = this.typed.slice(0, -1);
          keyClick(this);
        }
      } else if (e.key.length === 1) {
        e.preventDefault();
        if (!this.done && this.typed.length < 48) {
          this.typed += e.key;
          keyClick(this);
        }
      }
    };
    window.addEventListener('keydown', onKey);

    // Touch: a tap types the next letter of the line (sends once it's all there); the talk
    // button is hold-to-speak, as on the HUD.
    this.input.on('pointerdown', (p) => {
      if (this.talk && inside(p, TALK)) {
        this.talkPointer = p.id;
        voice.press();
      } else if (TOUCH && !this.done) {
        const want = LINES[this.line].text;
        if (this.typed.length >= want.length) this.send();
        else {
          this.typed = want.slice(0, this.typed.length + 1);
          keyClick(this);
        }
      }
    });
    const untap = (p) => {
      if (p.id !== this.talkPointer) return;
      this.talkPointer = null;
      voice.release();
    };
    this.input.on('pointerup', untap);
    this.input.on('pointerupoutside', untap);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', onKey);
      if (this.talkPointer !== null) voice.release();
    });
  }

  // Claude answers: "Thinking..." for `think` ms, then the reply types out.
  say(text, color = '#f5f5f5', think = 0) {
    this.answer = { text, color, at: this.time.now + think };
  }

  answering() {
    const a = this.answer;
    return Boolean(a) && this.time.now < a.at + a.text.length * TYPE_MS;
  }

  // TAB: the whole line, no typing.
  complete() {
    if (this.done) return;
    this.typed = LINES[this.line].text;
    keyClick(this);
    this.toast("that's vibe coding");
  }

  send(spoken = false) {
    if (this.done) return;
    if (this.answering()) {
      this.queued = true; // sent while Claude is still answering: it goes when the answer's done
      return;
    }
    this.queued = false; // (a queued line deleted meanwhile just doesn't go)
    if (!spoken && !this.typed.trim()) return;
    const i = this.line;
    const { text, reply } = LINES[i];
    const typed = this.typed.trim();
    this.typed = '';
    this.echo.setText(`> ${typed}`);
    keyClick(this, true);
    if (!spoken && !matchLine(typed, text)) {
      this.say(MISS, '#e3b341', THINK_MS);
      return;
    }
    this.line++;
    this.done = this.line === LINES.length;
    const think = this.done ? 0 : THINK_MS;
    this.say(reply, '#f5f5f5', think);
    this.time.delayedCall(think, () => this.chute.onLine(i));
  }

  // The fall ended on the roof.
  crash() {
    this.done = true;
    this.queued = false;
    this.typed = '';
    this.say(CRASH, '#e5534b');
  }

  toast(text) {
    this.toastBox?.destroy();
    const t = uiText(this, 480, WIN.y - 24, text, { size: 16, color: '#0d0d0d', bg: '#d97757', ox: 0.5, oy: 0.5, pad: 6 });
    this.toastBox = t;
    t.setScale(0.7);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 1300, duration: 300, onComplete: () => t.destroy() });
  }

  // Speech (touch): look for the line in what the mic has heard since the last line it matched.
  listen() {
    const heard = voice.heard;
    if (heard === this.lastHeard) return;
    this.lastHeard = heard;
    if (!heard) {
      this.heardWords = 0;
      return;
    }
    if (this.done) return;
    const words = normalize(heard).split(' ');
    const rest = words.slice(this.heardWords).join(' ');
    const { text, spoken } = LINES[this.line];
    let end = findSpoken(rest, text);
    if (!end && spoken?.test(rest)) end = words.length - this.heardWords;
    if (!end) return;
    this.heardWords += end;
    this.typed = text;
    this.send(true);
  }

  update(time) {
    if (this.talk) this.listen();
    if (this.queued && !this.answering()) this.send();
    const g = this.g.clear();
    const chute = this.chute;

    // Claude's side of the conversation.
    const a = this.answer;
    if (a && time < a.at) {
      this.reply.setText(`Thinking${'.'.repeat(1 + (Math.floor(time / 200) % 3))}`).setTint(0x8b8b8b);
      this.bullet.setAlpha(Math.floor(time / 200) % 2 ? 0.4 : 1);
    } else if (a) {
      const n = Math.min(a.text.length, Math.floor((time - a.at) / TYPE_MS));
      this.reply.setText(a.text.slice(0, n)).setTint(hex(a.color));
      this.bullet.setAlpha(1);
    }
    if (this.talk && (voice.listening || voice.heard) && !this.done) {
      this.echo.setText(voice.heard ? `heard "${voice.heard.slice(-40)}"` : 'listening... say the line');
    }

    // The prompt: what you've typed over the ghost of the line, a cursor, and ENTER once it'll pass.
    const want = this.done ? '' : LINES[this.line].text;
    const ready = !this.done && matchLine(this.typed, want);
    this.typedText.setText(this.typed);
    const end = TEXT_X + this.advance(this.typed);
    const rest = this.typed.length < want.length ? want.slice(this.typed.length) : '';
    this.ghost.setText(ready ? (TOUCH ? '  tap to send' : '  ENTER') : rest).setX(end + 6); // after the cursor
    this.ghost.setTint(ready ? 0x3fb950 : 0x6e7681);
    g.lineStyle(2, ready ? 0x3fb950 : 0x444c56).strokeRect(BOX.x, BOX.y, this.boxW, BOX.h);
    if (!this.done && Math.floor(time / 450) % 2 === 0) g.fillStyle(0xd97757).fillRect(end + 1, BOX.y + 8, 3, BOX.h - 16);
    this.prompt.setAlpha(this.done ? 0.3 : 1);
    if (this.talk) {
      const on = voice.listening;
      g.fillStyle(on ? 0x3fb950 : 0x444c56).fillRect(TALK.x, TALK.y, TALK.w, TALK.h);
      g.fillStyle(on ? 0x3fb950 : 0x21262d).fillRect(TALK.x + 3, TALK.y + 3, TALK.w - 6, TALK.h - 6);
      this.talkLabel.setTint(on ? 0x0d0d0d : 0xf5f5f5);
    }

    // The altimeter: white, then amber, then blinking red; green once the chute is out.
    const ag = this.altG.clear();
    ag.fillStyle(0x444c56).fillRect(ALT.x, ALT.y, ALT.w, ALT.h);
    ag.fillStyle(0x21262d).fillRect(ALT.x + 3, ALT.y + 3, ALT.w - 6, ALT.h - 6);
    const open = chute.state === 'open';
    const alt = chute.alt;
    this.altText.setText(open ? `✓ ${fmt(chute.deployedAt)}` : fmt(alt));
    const color = open ? 0x3fb950 : alt < 150 ? 0xe5534b : alt < 400 ? 0xe3b341 : 0xf5f5f5;
    this.altText.setTint(color).setAlpha(!open && alt > 0 && alt < 150 && Math.floor(time / 150) % 2 ? 0.35 : 1);
  }
}
