import { MAX_STARS, checkName, profileUrl } from '../shared/leaderboard.js';

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

const board = (body) => ({
  top: cleanRows(body?.top),
  total: Number.isInteger(body?.total) ? body.total : 0,
  asOf: typeof body?.asOf === 'string' ? body.asOf : null,
});

// { state: 'ok', top, total, asOf } | { state: 'offline' } | { state: 'error', status }
export async function getBoard() {
  const r = await call('/api/scores');
  return r.state === 'ok' ? { state: 'ok', ...board(r.body) } : r;
}
