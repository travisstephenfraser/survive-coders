import Phaser from 'phaser';
import { uiText } from '../util.js';
import { applyScreenFX } from '../fx.js';
import { terminalWindow } from '../terminal.js';
import { TOUCH } from '../touch.js';
import { menu, textRow } from '../menu.js';
import { getBoard } from '../api.js';
import { readBest } from '../profile.js';
import { PLATFORMS, formatTime } from '../../shared/leaderboard.js';

const ROW_Y = 158;
const ROW_H = 26;
const COL = { rank: 110, name: 130, stars: 560, time: 700, tag: 730 };

// The top ten, most stars first, fastest breaking ties. A row with a profile is a real link
// (a transparent <a> over it), so it opens the way any link does; ENTER opens the selected one.
// `data.board` is a board already in hand (the one a score submission just returned).
export default class Leaderboard extends Phaser.Scene {
  constructor() {
    super('Leaderboard');
  }

  create(data) {
    applyScreenFX(this.cameras.main);
    const win = terminalWindow(this, 'vibecoder@sf: ~/leaderboard - zsh');
    uiText(this, 70, win.y + 44, '$ curl -s survive-coders.vercel.app/api/scores', { size: 16, color: '#8b8b8b' });
    uiText(this, 70, win.y + 68, 'most ★ wins; the faster run breaks a tie', { size: 16, color: '#d97757' });
    this.total = uiText(this, win.x + win.w - 30, win.y + 68, '', { size: 16, color: '#8b8b8b', ox: 1 });
    const head = { size: 8, color: '#8b8b8b' };
    uiText(this, COL.rank, ROW_Y - 22, '#', { ...head, ox: 1 });
    uiText(this, COL.name, ROW_Y - 22, 'name', head);
    uiText(this, COL.stars, ROW_Y - 22, 'stars', { ...head, ox: 1 });
    uiText(this, COL.time, ROW_Y - 22, 'time', { ...head, ox: 1 });
    uiText(this, COL.tag, ROW_Y - 22, 'profile', head);

    this.status = uiText(this, COL.name, ROW_Y, 'fetching..._', { size: 16, color: '#8b8b8b' });
    this.dest = uiText(this, 70, win.y + win.h - 84, '', { size: 16, color: '#58a6ff' });
    this.best = uiText(this, 70, win.y + win.h - 58, bestLine(), { size: 16, color: '#f5f5f5' });
    const hint = TOUCH ? 'tap a name to see its profile, tap again to open it' : '↑↓ choose   ENTER open profile   ESC back';
    uiText(this, 70, win.y + win.h - 16, hint, { size: 8, color: '#8b8b8b' });

    this.rows = [];
    for (let i = 0; i < 10; i++) this.rows.push(this.row(i));
    const back = () => this.scene.start('Title', { from: 'leaderboard' });
    const backRow = textRow(this, win.x + win.w - 110, win.y + 44, 'BACK', { size: 16, onPick: back });
    this.menu = menu(this, [...this.rows, backRow], { onBack: back, start: 10 });

    if (data?.board) this.show(data.board);
    else getBoard().then((b) => this.sys.isActive() && this.show(b));
  }

  show(board) {
    if (board.state === 'offline') return this.status.setText("offline: can't reach the leaderboard");
    if (board.state !== 'ok') return this.status.setText(`leaderboard unavailable (HTTP ${board.status})`);
    if (!board.top.length) return this.status.setText('no finished runs yet: be the first');
    this.status.setText('');
    this.total.setText(`${board.total} ${board.total === 1 ? 'player' : 'players'}`);
    const mine = readBest();
    board.top.forEach((entry, i) => this.rows[i].fill(entry, mine && entry.name === mine.name && entry.stars === mine.stars && entry.timeMs === mine.timeMs));
    this.menu.select(0);
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
    const row = {
      bounds: () => new Phaser.Geom.Rectangle(70, y - 5, 800, ROW_H),
      enabled: () => entry !== null,
      fill(e, isMine) {
        entry = e;
        own = isMine;
        t.rank.setText(`${e.rank}.`);
        t.name.setText(e.name);
        t.stars.setText(`★ ${e.stars}`);
        t.time.setText(formatTime(e.timeMs));
        t.tag.setText(e.url ? PLATFORMS[e.platform].tag : '');
        if (e.url) link = scene.link(e, y, () => scene.menu.select(i), () => focused);
        row.redraw();
      },
      focus(on) {
        focused = on;
        row.redraw();
        if (on) scene.dest.setText(entry?.url ? `→ ${entry.url.replace(/^https:\/\/(www\.)?/, '')}` : entry ? 'no profile linked' : '');
      },
      redraw() {
        const tint = focused ? 0x3fb950 : own ? 0xe3b341 : 0xf5f5f5;
        for (const k of ['rank', 'name', 'stars', 'time']) t[k].setTint(tint);
      },
      activate: () => link?.click(),
    };
    return row;
  }

  // A transparent link over a row. On a phone the first tap only selects the row (showing
  // where it goes); the second opens it. The link never keeps focus, so the arrow keys stay
  // with the menu after a click.
  link(entry, y, select, selected) {
    const a = document.createElement('a');
    a.href = entry.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.tabIndex = -1;
    a.setAttribute('aria-label', `${entry.name} on ${PLATFORMS[entry.platform].label}`);
    a.style.cssText = `display:block;width:800px;height:${ROW_H}px;`;
    a.addEventListener('mouseenter', select);
    a.addEventListener('mousedown', (e) => e.preventDefault());
    a.addEventListener('click', (e) => {
      if (TOUCH && !selected()) {
        e.preventDefault();
        select();
      }
    });
    this.add.dom(70, y - 5, a).setOrigin(0);
    return a;
  }
}

function bestLine() {
  const b = readBest();
  if (!b) return 'finish a run to get on the board';
  return `your best: ★ ${b.stars} in ${formatTime(b.timeMs)}`;
}
