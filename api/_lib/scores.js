import { createHmac } from 'node:crypto';
import { RULES_VERSION, checkLink, checkName, checkRun, profileUrl } from '../../shared/leaderboard.js';
import { clientIp, json, logFail } from './http.js';
import { offensive } from './words.js';

const KEYS = ['runId', 'playerId', 'name', 'stars', 'timeMs', 'splits', 'splitStars', 'platform', 'handle'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 2048;
export const IP_LIMIT = 5; // posts a minute from one address
export const GLOBAL_LIMIT = 60; // posts a minute from everyone
// The public board is edge-cached for 15 minutes, so Neon's compute (which sleeps after five
// idle minutes) isn't kept awake by page views. A poster sees the fresh board in their POST's
// answer.
const BOARD_CACHE = 'public, s-maxage=900, stale-while-revalidate=86400';

// A board as the public sees it: no run, player or address ids.
function board(rows, at) {
  const top = rows
    .filter((r) => r.rank <= 10)
    .map((r) => ({ rank: r.rank, name: r.name, stars: r.stars, timeMs: r.time_ms, platform: r.platform, handle: r.handle }));
  return { top, total: rows[0]?.total ?? 0, asOf: at.toISOString() };
}

// GET: the top ten. POST: a finished run. Everything they need comes in, so the tests can run
// them against PGlite with a fake clock and mailer.
export function scoresHandlers({ config, store, notify, now = () => new Date(), log = console }) {
  function unavailable(cfg) {
    log.error(`api/scores 503 config: ${cfg.problems.join(', ')}`);
    return json(503, { error: 'unavailable' });
  }

  async function GET(request) {
    const cfg = config();
    if (!cfg.ok) return unavailable(cfg);
    // Any query string is a new cache key, so it would reach the database: refuse it outright.
    if (new URL(request.url).search) return json(400, { error: 'query' });
    try {
      return json(200, board(await store().board(null), now()), { 'cache-control': BOARD_CACHE });
    } catch (err) {
      logFail(log, 'GET api/scores', 503, err);
      return json(503, { error: 'unavailable' });
    }
  }

  async function POST(request) {
    const cfg = config();
    if (!cfg.ok) return unavailable(cfg);
    // Only the game's own pages, and only JSON: another site's form or text/plain post would
    // skip the browser's CORS preflight. This stops other sites using their visitors' browsers
    // (a script outside a browser can send any headers it likes; see README, anti-cheat).
    if (!cfg.origins.has(request.headers.get('origin'))) return json(403, { error: 'origin' });
    if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return json(415, { error: 'type' });
    const text = await request.text();
    if (text.length > MAX_BODY) return json(413, { error: 'size' });
    let run;
    try {
      run = JSON.parse(text);
    } catch {
      return json(400, { error: 'json' });
    }
    const shaped = run && typeof run === 'object' && !Array.isArray(run) && Object.keys(run).length === KEYS.length && KEYS.every((k) => k in run);
    if (!shaped) return json(400, { error: 'shape' });
    const reason = !UUID.test(run.runId) || !UUID.test(run.playerId) ? 'id' : (checkRun(run) ?? checkName(run.name) ?? checkLink(run.platform, run.handle));
    if (reason) return json(422, { error: reason });
    if (offensive(run.name)) return json(422, { error: 'rude-name' });
    if (run.handle != null && offensive(run.handle)) return json(422, { error: 'rude-link' });

    // Everything above is free; from here the database wakes, so junk never gets this far.
    const at = now();
    const ipHash = createHmac('sha256', cfg.ipHashSecret).update(clientIp(request)).digest('hex');
    try {
      const db = store();
      const hits = await db.hit(ipHash, at.toISOString(), IP_LIMIT);
      if (hits.ip > IP_LIMIT || hits.global > GLOBAL_LIMIT) return json(429, { error: 'busy' }, { 'retry-after': '60' });
      const { id, board: rows } = await db.insert({ ...run, ipHash, rulesVersion: RULES_VERSION });
      if (!id) return json(409, { error: 'duplicate' });
      const mine = rows.find((r) => r.mine);
      const you = { rank: mine.rank, total: mine.total, best: mine.run_id === run.runId };
      // A new top-ten best: tell Travis, with the line that hides it if it's a cheat.
      if (you.best && you.rank <= 10) {
        try {
          await notify({ id, rank: you.rank, total: you.total, name: run.name, stars: run.stars, timeMs: run.timeMs, splits: run.splits, splitStars: run.splitStars, url: profileUrl(run.platform, run.handle), playerId: run.playerId, ipHash });
        } catch (err) {
          logFail(log, 'alert', 0, err);
        }
      }
      return json(201, { you, ...board(rows, at) });
    } catch (err) {
      logFail(log, 'POST api/scores', 503, err);
      return json(503, { error: 'unavailable' });
    }
  }

  return { GET, POST };
}
