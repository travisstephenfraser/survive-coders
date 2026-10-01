import { MAX_STARS, MAX_TIME_MS, MIN_TIME_MS, RULES_VERSION, checkName, profileUrl } from '../shared/leaderboard.js';

// The leaderboard API (api/scores.js). Anything that isn't a JSON answer from it, like no
// network, the plain Vite dev server's HTML, or a proxy's error page, counts as offline.
async function call(path, init = {}, timeoutMs = 8000) {
  try {
    const res = await fetch(path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { state: 'offline' };
    const body = await res.json();
    return { state: res.ok ? 'ok' : 'error', status: res.status, body };
  } catch {
    return { state: 'offline' };
  }
}

// Board rows sane enough to draw. A row keeps its link only when the URL rebuilds from the
// platform's template, so nothing the server sends becomes an arbitrary link.
export function cleanRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(
      (r) =>
        r &&
        Number.isInteger(r.rank) &&
        r.rank >= 1 &&
        r.rank <= 10 &&
        checkName(r.name) === null &&
        Number.isInteger(r.stars) &&
        r.stars >= 0 &&
        r.stars <= MAX_STARS &&
        Number.isInteger(r.timeMs) &&
        r.timeMs >= MIN_TIME_MS &&
        r.timeMs <= MAX_TIME_MS,
    )
    .slice(0, 10)
    .map(({ rank, name, stars, timeMs, platform = null, handle = null }) => ({
      rank,
      name,
      stars,
      timeMs,
      platform,
      handle,
      url: profileUrl(platform, handle),
    }));
}

// One board's rows, or null when the answer has no such board or one that can't be right: rows
// sent but none drawable, ranks not strictly rising or past the player count, or more rows
// than players. An older API's answer has no `fastest`. The screen then says the board is
// unavailable rather than draw it.
function rows(sent, total) {
  if (!Array.isArray(sent)) return null;
  const clean = cleanRows(sent);
  if (sent.length && !clean.length) return null;
  if (clean.some((r, i) => r.rank > total || (i > 0 && r.rank <= clean[i - 1].rank)) || clean.length > total) return null;
  return clean;
}

// `top` ranks by stars, `fastest` by time.
const board = (body) => {
  const total = Number.isInteger(body?.total) && body.total >= 0 ? body.total : 0;
  return {
    top: rows(body?.top, total),
    fastest: rows(body?.fastest, total),
    total,
    asOf: typeof body?.asOf === 'string' ? body.asOf : null,
  };
};

// The newest board this page has seen. For up to 15 minutes the public board is an edge-cached
// copy, older than the board a post just returned, so the leaderboard shows whichever is newer
// (asOf is an ISO timestamp: newer sorts later).
let latest = null;
const newest = (b) => (latest = !latest || (b.asOf ?? '') >= (latest.asOf ?? '') ? b : latest);

// { state: 'ok', top, fastest, total, asOf } | { state: 'offline' } | { state: 'error', status }
export async function getBoard() {
  const r = await call('/api/scores');
  return r.state === 'ok' ? newest({ state: 'ok', ...board(r.body) }) : r;
}

// Posts a finished run (the run clock's summary) with the player's name and link.
// → { state: 'ok', you: { rank, total, best, fastest: { rank, best, run } | null }, board, share }
//   (rank and total null when the answer's don't add up) |
//   { state: 'error', status, error } |
//   { state: 'offline' }. The database can take a few seconds to wake after a quiet spell, so
// the wait is long, and a network failure gets one retry (a retry of a post that did land
// comes back 409).
export async function submitScore(summary, profile, playerId, { retryDelayMs = 1500 } = {}) {
  const body = JSON.stringify({
    runId: summary.runId,
    playerId,
    name: profile.name,
    stars: summary.stars,
    timeMs: summary.timeMs,
    splits: summary.splits,
    splitStars: summary.splitStars,
    platform: profile.platform,
    handle: profile.handle,
  });
  // The rules the run was timed under, so the server stores the clock's version, not its own.
  const headers = { 'content-type': 'application/json', 'x-rules-version': String(RULES_VERSION) };
  const send = () => call('/api/scores', { method: 'POST', headers, body }, 15000);
  let r = await send();
  if (r.state === 'offline') {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    r = await send();
  }
  if (r.state === 'offline') return r;
  if (r.status === 201) {
    // The signed token for this run's /r/ link: base64url, a dot, base64url (api/_lib/share.js).
    const share = typeof r.body.share === 'string' && /^[\w-]+\.[\w-]+$/.test(r.body.share) ? r.body.share : null;
    // The ranks, each only if it makes sense: a rank from 1 to the player count, and a yes or
    // no for best. The time rank is null if the answer has none (an older API's); `run` is the
    // player's fastest run, if the answer names one that could be on the board.
    const { rank, best, fastest: fast } = r.body.you ?? {};
    const total = Number.isInteger(r.body.you?.total) && r.body.you.total >= 1 ? r.body.you.total : null;
    const ranked = (n, b) => total !== null && Number.isInteger(n) && n >= 1 && n <= total && typeof b === 'boolean';
    const run = ranked(fast?.rank, fast?.best) && cleanRows([{ ...fast, rank: 1 }]).length ? { name: fast.name, stars: fast.stars, timeMs: fast.timeMs } : null;
    const you = {
      rank: ranked(rank, best) ? rank : null,
      total,
      best: ranked(rank, best) && best,
      fastest: ranked(fast?.rank, fast?.best) ? { rank: fast.rank, best: fast.best, run } : null,
    };
    return { state: 'ok', you, board: newest({ state: 'ok', ...board(r.body) }), share };
  }
  return { state: 'error', status: r.status, error: r.body?.error ?? null };
}
