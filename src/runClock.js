import { SPLITS, checkRun } from '../shared/leaderboard.js';

// The leaderboard's run clock: real time from PLAY NOW to the Hydra's fall, everything
// included: deaths and retries, the pause screen, a hidden tab. Pauses count because the game
// doesn't stop with them: power cooldowns, timed gates (the park's fountain, the arena's waves,
// Claude typing in the fall) and tweens run on time the pause doesn't freeze, so a clock that
// skipped pauses could be cut short by pausing through them. It keeps wall-clock time rather
// than summing frame deltas, which a hidden tab (no frames) would miss. Browser-free (the scene
// hook is in run.js), so it runs under node --test with a fake time source.
export function createRunClock(now = () => performance.now()) {
  let state = 'idle'; // idle | running | finished
  let id = null;
  let reasons = [];
  let startedAt = 0;
  let frameMs = 0; // the frames drawn, summed: an independent check on the clock
  let marks = {};
  let finalMs = null;

  return {
    get state() {
      return state;
    },
    // False once the run can't go on the board (god mode, a level-jump start).
    get ranked() {
      return reasons.length === 0;
    },
    elapsed: () => (state === 'finished' ? finalMs : state === 'running' ? now() - startedAt : 0),

    start({ god = false, dev = false } = {}) {
      state = 'running';
      id = uuid();
      reasons = [...(god ? ['god'] : []), ...(dev ? ['dev'] : [])];
      startedAt = now();
      frameMs = 0;
      marks = {};
      finalMs = null;
    },

    reset() {
      state = 'idle';
    },

    // Once per frame: the frame's raw delta.
    frame(rawDelta) {
      if (state === 'running') frameMs += rawDelta;
    },

    // First arrival at a milestone (a retry that re-enters it changes nothing).
    split(name, stars) {
      if (state === 'running' && !(name in marks)) marks[name] = { ms: Math.round(this.elapsed()), stars };
    },

    finish() {
      if (state !== 'running') return;
      finalMs = Math.round(now() - startedAt);
      state = 'finished';
    },

    // What goes to the leaderboard, and every reason it can't.
    summary(stars) {
      const splits = SPLITS.map((n) => marks[n]?.ms);
      const splitStars = SPLITS.map((n) => marks[n]?.stars);
      const why = [...reasons];
      // The failure that would look like success is a clock that runs short: that reads as a
      // fast run. The frames can come up short of real time but never long, so a clock well
      // under them missed play time.
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
