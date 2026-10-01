import { uuid } from './runClock.js';
import { PLATFORMS } from '../shared/leaderboard.js';

// The player as this browser knows them: an anonymous id (so the board keeps one row per
// player), the name and link they last posted with, and their best finish. All of it lives
// in localStorage and all of it is optional: blocked or partitioned storage (the game embedded
// in another site) just means a fresh id and an empty form.
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let sessionId = null;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // this session only
  }
}

export function playerId() {
  const stored = read('sc_player');
  if (stored && ID_RE.test(stored)) return stored;
  sessionId ??= uuid();
  write('sc_player', sessionId);
  return sessionId;
}

export function loadProfile() {
  let p = null;
  try {
    p = JSON.parse(read('sc_profile') ?? 'null');
  } catch {
    // unreadable: empty
  }
  const known = p && typeof p.platform === 'string' && Object.hasOwn(PLATFORMS, p.platform);
  return {
    name: typeof p?.name === 'string' ? p.name : '',
    platform: known ? p.platform : null,
    handle: known && typeof p.handle === 'string' ? p.handle : null,
  };
}

export const saveProfile = ({ name, platform, handle }) => write('sc_profile', JSON.stringify({ name, platform, handle }));

function readJson(key) {
  try {
    return JSON.parse(read(key) ?? 'null');
  } catch {
    return null;
  }
}

// { name, stars, timeMs } from the last post that was a personal best: most stars (readBest),
// or fastest (readFastest).
export const readBest = () => readJson('sc_best');
export const saveBest = (best) => write('sc_best', JSON.stringify(best));
export const readFastest = () => readJson('sc_fastest');
export const saveFastest = (fastest) => write('sc_fastest', JSON.stringify(fastest));
export const forgetFastest = () => write('sc_fastest', 'null');

// Brings the saved bests in line with a post's answer (src/api.js submitScore): `posted` is
// the run just sent, { name, stars, timeMs }. The ranks come with a 201, and with a 409 that
// names them: the retry of a post that landed but whose answer was lost. Any other answer
// says nothing about the board, so nothing changes.
export function keepBests(r, posted) {
  const you = r.state === 'ok' || r.status === 409 ? r.you : undefined;
  if (!you) return;
  if (you.best) saveBest(posted);
  // The server names the player's fastest run, whichever game posted it; failing that, this
  // run if it says this is the one. An older API's answer has no time rank (as after a
  // rollback), so nothing says; but a saved fastest that this run beats is out of date.
  const fast = you.fastest;
  if (fast?.run) saveFastest(fast.run);
  else if (fast?.best) saveFastest(posted);
  else if (fast === null && posted.timeMs < (readFastest()?.timeMs ?? Infinity)) forgetFastest();
}
