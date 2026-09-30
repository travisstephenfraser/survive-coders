import { SPLITS, checkRun } from '../shared/leaderboard.js';

// The leaderboard's run clock: real time from PLAY NOW to the Hydra's fall, deaths and retries
// included, minus every stretch the run isn't live (the game paused, the tab hidden). It keeps
// wall-clock time and subtracts the pauses, rather than summing frame deltas: Phaser resets
// its delta whenever the window regains focus, and some browsers keep drawing frames in hidden
// tabs, and a sum would miss the first and count the second. Browser-free (the scene hooks are
// in run.js), so it runs under node --test with a fake time source.
export function createRunClock(now = () => performance.now()) {
  let state = 'idle'; // idle | running | finished
  let id = null;
  let reasons = [];
  let ms = 0; // live time banked before the current live stretch
  let live = false;
  let since = 0;
  let frameMs = 0; // the frames drawn while live, summed: an independent check on the clock
  let marks = {};
  let finalMs = null;

  function setLive(on) {
    on = on && state === 'running';
    if (on === live) return;
    const t = now();
    if (live) ms += t - since;
    live = on;
    since = t;
  }

  return {
    get state() {
      return state;
    },
    // False once the run can't go on the board (god mode, a level-jump start).
    get ranked() {
      return reasons.length === 0;
    },
    elapsed: () => (state === 'finished' ? finalMs : ms + (live ? now() - since : 0)),
    setLive,

    start({ god = false, dev = false } = {}) {
      state = 'running';
      id = uuid();
      reasons = [...(god ? ['god'] : []), ...(dev ? ['dev'] : [])];
      ms = 0;
      live = false;
      frameMs = 0;
      marks = {};
      finalMs = null;
      setLive(true);
    },

    reset() {
      setLive(false);
      state = 'idle';
    },

    // Once per frame: whether the run is live now, and the frame's raw delta.
    frame(isLive, rawDelta) {
      if (state !== 'running') return;
      setLive(isLive);
      if (isLive) frameMs += rawDelta;
    },

    // First arrival at a milestone (a retry that re-enters it changes nothing).
    split(name, stars) {
      if (state === 'running' && !(name in marks)) marks[name] = { ms: Math.round(this.elapsed()), stars };
    },

    finish() {
      if (state !== 'running') return;
      setLive(false);
      finalMs = Math.round(ms);
      state = 'finished';
    },

    // What goes to the leaderboard, and every reason it can't.
    summary(stars) {
      const splits = SPLITS.map((n) => marks[n]?.ms);
      const splitStars = SPLITS.map((n) => marks[n]?.stars);
      const why = [...reasons];
      // The failure that would look like success is a clock that runs short: that reads as a
      // fast run. The live frames can come up short of real time but never long, so a clock
      // well under them missed play time.
      if (finalMs < frameMs - (1000 + 0.01 * frameMs)) why.push('clock');
      const code = checkRun({ stars, timeMs: finalMs, splits, splitStars });
      if (code) why.push(code);
      return { runId: id, stars, timeMs: finalMs, splits, splitStars, reasons: why, eligible: why.length === 0 };
    },
  };
}

// crypto.randomUUID exists only in secure contexts (https, localhost); a phone testing a dev
// server over the LAN is neither, so fall back to the same v4 layout from getRandomValues.
export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
