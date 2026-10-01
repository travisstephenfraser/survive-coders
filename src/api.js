import { MAX_STARS, RULES_VERSION, checkName, profileUrl } from '../shared/leaderboard.js';

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
        Number.isInteger(r.timeMs),
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

// `top` ranks by stars, `fastest` by time; either is null when the answer doesn't have it (an
// older API's has no `fastest`), so the screen can say so rather than show it empty.
const board = (body) => ({
  top: Array.isArray(body?.top) ? cleanRows(body.top) : null,
  fastest: Array.isArray(body?.fastest) ? cleanRows(body.fastest) : null,
  total: Number.isInteger(body?.total) ? body.total : 0,
  asOf: typeof body?.asOf === 'string' ? body.asOf : null,
});

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
// → { state: 'ok', you: { rank, total, best, fastest: { rank, best } | null }, board, share } |
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
    // The time rank, or null if the answer has none (an older API's) or none that makes sense.
    const fast = r.body.you?.fastest;
    const total = r.body.you?.total;
    const sane = Number.isInteger(fast?.rank) && fast.rank >= 1 && (!Number.isInteger(total) || fast.rank <= total) && typeof fast.best === 'boolean';
    const you = { ...r.body.you, fastest: sane ? { rank: fast.rank, best: fast.best } : null };
    return { state: 'ok', you, board: newest({ state: 'ok', ...board(r.body) }), share };
  }
  return { state: 'error', status: r.status, error: r.body?.error ?? null };
}
