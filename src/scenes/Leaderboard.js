import Phaser from 'phaser';
import { uiText } from '../util.js';
import { applyScreenFX } from '../fx.js';
import { terminalWindow } from '../terminal.js';
import { TOUCH } from '../touch.js';
import { menu, textRow } from '../menu.js';
import { getBoard } from '../api.js';
import { readBest, readFastest } from '../profile.js';
import { PLATFORMS, formatTime } from '../../shared/leaderboard.js';

const ROW_Y = 158;
const ROW_H = 26;
const COL = { rank: 110, name: 130, stars: 560, time: 700, tag: 730 };
const TAB_Y = 82; // the tabs' middle
const ORANGE = 0xd97757;
const GREY = 0x8b8b8b;

// The two boards, in tab order. `field` is where the API's answer holds each top ten.
const BOARDS = [
  { key: 'time', label: 'TIME', field: 'fastest', rule: 'fastest finish wins; more ★ breaks a tie' },
  { key: 'stars', label: 'STARS', field: 'top', rule: 'most ★ wins; the faster run breaks a tie' },
];

const sameRun = (a, b) => a.name === b.name && a.stars === b.stars && a.timeMs === b.timeMs;

// Two top tens behind two tabs: TIME (fastest first, more stars breaking ties), the one that
// opens, and STARS (most stars first, fastest breaking ties). ←→ switch from anywhere. A row
// with a profile is a real link (a transparent <a> over it), so it opens the way any link does;
// ENTER opens the selected one. `data.board` is a board already in hand (the one a score
// submission just returned).
export default class Leaderboard extends Phaser.Scene {
  constructor() {
    super('Leaderboard');
  }

  create(data) {
    // Phaser keeps a scene's last data when it's started with none, so a later visit from the
    // title would show this board again, never fetching: take it and clear it.
    const handed = data?.board;
    this.sys.settings.data = {};
    applyScreenFX(this.cameras.main);
    const win = terminalWindow(this, 'vibecoder@sf: ~/leaderboard - zsh');
    this.rule = uiText(this, 70, win.y + 74, '', { size: 16, color: '#d97757' });
    this.total = uiText(this, win.x + win.w - 30, win.y + 74, '', { size: 16, color: '#8b8b8b', ox: 1 });
    const head = { size: 8, color: '#8b8b8b' };
    uiText(this, COL.rank, ROW_Y - 22, '#', { ...head, ox: 1 });
    uiText(this, COL.name, ROW_Y - 22, 'name', head);
    this.heads = {
      stars: uiText(this, COL.stars, ROW_Y - 22, 'stars', { ...head, ox: 1 }),
      time: uiText(this, COL.time, ROW_Y - 22, 'time', { ...head, ox: 1 }),
    };
    uiText(this, COL.tag, ROW_Y - 22, 'profile', head);

    this.status = uiText(this, COL.name, ROW_Y, 'fetching..._', { size: 16, color: '#8b8b8b' });
    this.dest = uiText(this, 70, win.y + win.h - 84, '', { size: 16, color: '#58a6ff' });
    this.best = uiText(this, 70, win.y + win.h - 58, '', { size: 16, color: '#f5f5f5' });
    const hint = TOUCH ? 'tap a name to see its profile, tap again to open it' : '←→ time / stars   ↑↓ choose   ENTER open profile   ESC back';
    uiText(this, 70, win.y + win.h - 16, hint, { size: 8, color: '#8b8b8b' });

    // The player's own runs (their best and their fastest), lit up wherever they rank.
    this.mine = [readBest(), readFastest()].filter(Boolean);
    this.board = null;
    this.at = 0; // TIME
    let x = 70;
    this.tabs = BOARDS.map((b, i) => {
      const tab = this.tab(x, b.label, i);
      x = tab.bounds().right + 12;
      return tab;
    });
    this.rows = [];
    for (let i = 0; i < 10; i++) this.rows.push(this.row(i));
    const back = () => this.scene.start('Title', { from: 'leaderboard' });
    const backRow = textRow(this, win.x + win.w - 110, win.y + 44, 'BACK', { size: 16, onPick: back, onAdjust: (dir) => this.flip(dir) });
    const items = [...this.tabs, ...this.rows, backRow];
    this.menu = menu(this, items, { onBack: back, start: items.length - 1 });
    this.draw();

    // The scene object is reused, so an answer from an earlier visit that arrives late is dropped.
    const visit = (this.visit = {});
    if (handed) this.show(handed);
    else getBoard().then((b) => this.visit === visit && this.sys.isActive() && this.show(b));
  }

  show(board) {
    if (board.state === 'offline') return this.status.setText("offline: can't reach the leaderboard");
    if (board.state !== 'ok') return this.status.setText(`leaderboard unavailable (HTTP ${board.status})`);
    const none = !board.top?.length && !board.fastest?.length;
    if ((!board.top && !board.fastest) || (none && board.total > 0)) return this.status.setText('leaderboard unavailable: try again later');
    if (none) return this.status.setText('no finished runs yet: be the first');
    this.status.setText('');
    this.total.setText(`${board.total} ${board.total === 1 ? 'player' : 'players'}`);
    this.board = board;
    this.draw();
    this.menu.select(this.tabs.length); // the first row
  }

  // Shows the open tab: its rule, its column lit in the header, its rows, the player's line.
  // The link line clears too; a focused row writes its own again as it refills.
  draw() {
    const b = BOARDS[this.at];
    this.rule.setText(b.rule);
    for (const [key, text] of Object.entries(this.heads)) text.setTint(key === b.key ? ORANGE : GREY);
    this.best.setText(bestLine(b.key));
    this.tabs.forEach((t) => t.redraw());
    this.dest.setText('');
    if (!this.board) return;
    // Both boards count the same players, so one that's missing or empty while the other has
    // rows (an older API's answer, say) says so rather than draw empty.
    const entries = this.board[b.field];
    this.status.setText(entries?.length ? '' : `the ${b.key} board is unavailable: try again later`);
    this.rows.forEach((row, i) => {
      const e = entries?.[i] ?? null;
      row.fill(e, e !== null && this.mine.some((m) => sameRun(m, e)));
    });
    this.menu.refresh();
  }

  pick(i) {
    if (i === this.at) return;
    this.at = i;
    this.draw();
  }

  flip(dir) {
    this.pick((this.at + dir + BOARDS.length) % BOARDS.length);
  }

  // A tab: a box, filled orange while its board is open, outlined green while selected. ENTER
  // or a click opens it; ←→ on a tab move to the other tab and open it.
  tab(x, label, i) {
    // The glyphs leave their cell's bottom row empty: a nudge down centers them in the box.
    const text = uiText(this, x + 12, TAB_Y + 2, label, { size: 16, oy: 0.5 }).setDepth(1);
    const box = this.add.rectangle(x, TAB_Y, text.width + 24, 26, 0x0d0d0d).setOrigin(0, 0.5);
    let focused = false;
    const tab = {
      bounds: () => box.getBounds(),
      focus: (on) => {
        focused = on;
        tab.redraw();
        if (on) this.dest.setText('');
      },
      redraw: () => {
        const open = this.at === i;
        box.setFillStyle(open ? ORANGE : 0x0d0d0d);
        box.setStrokeStyle(2, focused ? 0x3fb950 : open ? ORANGE : 0x444c56);
        text.setTint(open ? 0x0d0d0d : focused ? 0x3fb950 : GREY);
      },
      activate: () => this.pick(i),
      adjust: (dir) => {
        this.flip(dir);
        this.menu.select(this.at);
      },
    };
    return tab;
  }

  row(i) {
    const scene = this; // the row's methods below have their own this
    const y = ROW_Y + i * ROW_H;
    const t = {
      rank: uiText(this, COL.rank, y, '', { size: 16, ox: 1 }),
      name: uiText(this, COL.name, y, '', { size: 16 }),
      stars: uiText(this, COL.stars, y, '', { size: 16, ox: 1 }),
      time: uiText(this, COL.time, y, '', { size: 16, ox: 1 }),
      tag: uiText(this, COL.tag, y, '', { size: 16, color: '#58a6ff' }),
    };
    let entry = null;
    let own = false;
    let focused = false;
    let link = null;
    // On touch a link opens only on a second tap on this same row: the first arms it. Being
    // selected isn't enough, since the board selects its top row on loading and the keyboard
    // can select a row whose entry a switch of tabs then replaces.
    let armed = false;
    const describe = () => scene.dest.setText(entry?.url ? `→ ${entry.url.replace(/^https:\/\/(www\.)?/, '')}` : entry ? 'no profile linked' : '');
    const row = {
      bounds: () => new Phaser.Geom.Rectangle(70, y - 5, 800, ROW_H),
      enabled: () => entry !== null,
      // A switch of tabs refills every row, so the old row's link goes first.
      fill(e, isMine) {
        entry = e;
        own = isMine;
        armed = false;
        link?.destroy();
        link = null;
        t.rank.setText(e ? `${e.rank}.` : '');
        t.name.setText(e?.name ?? '');
        t.stars.setText(e ? `★ ${e.stars}` : '');
        t.time.setText(e ? formatTime(e.timeMs) : '');
        t.tag.setText(e?.url ? PLATFORMS[e.platform].tag : '');
        if (e?.url) link = scene.link(e, y, () => scene.menu.select(scene.tabs.length + i), () => armed, () => (armed = true));
        row.redraw();
        if (focused) describe();
      },
      focus(on) {
        focused = on;
        row.redraw();
        if (on) describe();
        else {
          armed = false;
          scene.dest.setText('');
        }
      },
      redraw() {
        const tint = focused ? 0x3fb950 : own ? 0xe3b341 : 0xf5f5f5;
        for (const k of ['rank', 'name', 'stars', 'time']) t[k].setTint(tint);
      },
      // ENTER opens the link. A click or tap is the link's own (the menu's hit box is a little
      // larger than the row, and a tap there mustn't open a profile on the first touch).
      activate: (via) => via === 'key' && link?.node.click(),
      adjust: (dir) => scene.flip(dir),
    };
    return row;
  }

  // A transparent link over a row (its DOM game object; the <a> is its node). On a phone the
  // first tap only selects the row and arms it (showing where it goes); the second opens it.
  // The link never keeps focus, so the arrow keys stay with the menu after a click.
  link(entry, y, select, armed, arm) {
    const a = document.createElement('a');
    a.href = entry.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.tabIndex = -1;
    a.setAttribute('aria-label', `${entry.name} on ${PLATFORMS[entry.platform].label}`);
    a.style.cssText = `display:block;width:800px;height:${ROW_H}px;`;
    // A mouse moving over a row selects it. Only a real move counts: a switch of tabs draws new
    // links, and one drawn under a resting cursor mustn't take the keyboard's selection. A tap
    // selects through the click below instead.
    a.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && (e.movementX !== 0 || e.movementY !== 0) && select());
    a.addEventListener('mousedown', (e) => e.preventDefault());
    a.addEventListener('click', (e) => {
      if (TOUCH && !armed()) {
        e.preventDefault();
        select();
        arm();
      }
    });
    return this.add.dom(70, y - 5, a).setOrigin(0);
  }
}

// The player's own line under the board: their fastest on TIME, their best on STARS, whichever
// this browser has when it only has one (a post before the time board saved only the best).
function bestLine(key) {
  const best = readBest();
  const fastest = readFastest();
  if (fastest && (key === 'time' || !best)) return `your fastest: ${formatTime(fastest.timeMs)} with ★ ${fastest.stars}`;
  if (best) return `your best: ★ ${best.stars} in ${formatTime(best.timeMs)}`;
  return 'finish a run to get on the board';
}
