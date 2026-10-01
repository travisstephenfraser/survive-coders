// Leaderboard rules, shared by the game (Vite) and the API (Vercel functions). Keep it pure:
// no window, no Phaser, no node:* imports, so both sides load the same file.

// Stored with every run. 2: the run clock counts pauses and hidden tabs (1 left them out).
export const RULES_VERSION = 2;

// A run's milestones, in the order every run reaches them. Elevator, Ride and Arrival are
// skippable, so they aren't milestones. A run's `splits` are the run-clock times at each one.
export const SPLITS = ['park', 'tower59', 'tower60', 'tower61', 'chute', 'landing', 'boss'];

// Stars each segment can pay (start→park, park→tower59, …, boss→end), from a count of every
// star source in the game (npm run stars checks these against the level data).
export const SEGMENT_STARS = [98, 74, 34, 40, 29, 0, 12, 95];
export const MAX_STARS = SEGMENT_STARS.reduce((a, b) => a + b, 0);
// The most stars a run can hold on reaching each milestone.
export const SPLIT_STAR_CAPS = SPLITS.map((_, i) => SEGMENT_STARS.slice(0, i + 1).reduce((a, b) => a + b, 0));
const BOSS_STARS = SEGMENT_STARS.at(-1);

// The fastest each segment can go, set under what the level allows so no real run trips them:
// about four fifths of the fastest each can be played (simulated at 60 Hz with every cutscene
// skipped: 21.0, 22.2, 12.0, 12.7, 8.2, 6.65, 10.1 and 12.6 s; the canopy descent alone takes
// 9.25 s, the boss's entrance 6.4 s). These filter junk; they are not anti-cheat: a made-up run
// above them still posts. Before raising one, check it against the stored runs (the owner's
// query at the end of db/schema.sql).
export const SEGMENT_FLOOR_MS = [16500, 17500, 9500, 10000, 6500, 5000, 8000, 10000];
export const MIN_TIME_MS = SEGMENT_FLOOR_MS.reduce((a, b) => a + b, 0);
export const MAX_TIME_MS = 12 * 60 * 60 * 1000;

// 1-16 printable ASCII characters (all the bitmap font can draw), no edge spaces.
export const NAME_MAX = 16;
const NAME_RE = /^[!-~](?:[ -~]{0,14}[!-~])?$/;

// Profile links are a platform plus a handle; the URL is always built from the template.
export const PLATFORMS = {
  github: {
    label: 'GitHub',
    tag: 'gh',
    ok: (h) => h.length <= 39 && /^[A-Za-z0-9](?:-?[A-Za-z0-9])*$/.test(h),
    url: (h) => `https://github.com/${h}`,
  },
  linkedin: {
    label: 'LinkedIn',
    tag: 'in',
    ok: (h) => /^[A-Za-z0-9-]{3,100}$/.test(h),
    url: (h) => `https://www.linkedin.com/in/${h}`,
  },
  x: {
    label: 'X',
    tag: 'x',
    ok: (h) => /^[A-Za-z0-9_]{1,15}$/.test(h),
    url: (h) => `https://x.com/${h}`,
  },
  bluesky: {
    label: 'Bluesky',
    tag: 'bsky',
    ok: (h) => h.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(h),
    url: (h) => `https://bsky.app/profile/${h}`,
  },
};

const intArray = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isInteger);

// Each check returns null when the value is fine, or a short code saying what isn't.
export function checkRun({ stars, timeMs, splits, splitStars } = {}) {
  if (!Number.isInteger(stars) || stars < 0 || stars > MAX_STARS) return 'stars';
  if (!Number.isInteger(timeMs) || timeMs < MIN_TIME_MS || timeMs > MAX_TIME_MS) return 'time';
  if (!intArray(splits, SPLITS.length) || !intArray(splitStars, SPLITS.length)) return 'splits';
  let prev = 0;
  for (let i = 0; i <= SPLITS.length; i++) {
    const at = i < SPLITS.length ? splits[i] : timeMs;
    if (at - prev < SEGMENT_FLOOR_MS[i]) return 'splits';
    prev = at;
  }
  let held = 0;
  for (let i = 0; i < SPLITS.length; i++) {
    if (splitStars[i] < held || splitStars[i] > SPLIT_STAR_CAPS[i]) return 'splits';
    held = splitStars[i];
  }
  // A death restores the stars held at the last checkpoint, so the count never ends below the
  // boss door's, and the boss room pays at most its own share.
  if (stars < held || stars > held + BOSS_STARS) return 'splits';
  return null;
}

export const checkName = (name) => (typeof name === 'string' && NAME_RE.test(name) ? null : 'name');

export function checkLink(platform, handle) {
  if (platform == null && handle == null) return null;
  const p = Object.hasOwn(PLATFORMS, platform ?? '') ? PLATFORMS[platform] : null;
  return p && typeof handle === 'string' && p.ok(handle) ? null : 'link';
}

export const profileUrl = (platform, handle) =>
  platform != null && checkLink(platform, handle) === null ? PLATFORMS[platform].url(handle) : null;

// What a player types or pastes into the handle field: a profile URL (the platform comes with
// it), an @handle, or a bare handle. A dotted handle can only be Bluesky's.
export function parseProfile(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (s.startsWith('@')) s = s.slice(1);
  if (!s) return null;
  const isUrl =
    /^https?:\/\//i.test(s) || /^([a-z0-9-]+\.)*(github\.com|linkedin\.com|x\.com|twitter\.com|bsky\.app)(\/|$)/i.test(s);
  if (!isUrl) return s.includes('.') ? { platform: 'bluesky', handle: s.toLowerCase() } : { platform: null, handle: s };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|mobile)\./, '');
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (host === 'github.com' && first) return { platform: 'github', handle: first };
  if (/^([a-z]{2}\.)?linkedin\.com$/.test(host) && first === 'in' && second) return { platform: 'linkedin', handle: second };
  if ((host === 'x.com' || host === 'twitter.com') && first) return { platform: 'x', handle: first };
  if (host === 'bsky.app' && first === 'profile' && second) return { platform: 'bluesky', handle: second.toLowerCase() };
  return null;
}

// m:ss.t, or h:mm:ss.t from an hour up.
export function formatTime(ms) {
  const tenths = Math.floor(ms / 100);
  const secs = Math.floor(tenths / 10);
  const mins = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');
  const h = Math.floor(mins / 60);
  return h ? `${h}:${String(mins % 60).padStart(2, '0')}:${ss}.${tenths % 10}` : `${mins}:${ss}.${tenths % 10}`;
}
