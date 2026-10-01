import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createStore } from '../api/_lib/store.js';
import { scoresHandlers } from '../api/_lib/scores.js';
import { readToken } from '../api/_lib/shareToken.js';
import { SEGMENT_FLOOR_MS, SPLITS } from '../shared/leaderboard.js';

// The API against real Postgres (PGlite) running the real schema.
const ORIGIN = 'https://survive-coders.vercel.app';
let pg;
let store;
let sent;
let clock;
let notifyImpl;
const h = scoresHandlers({
  config: () => ({ ok: true, ipHashSecret: 's'.repeat(40), origins: new Set([ORIGIN]) }),
  store: () => store,
  notify: (entry) => notifyImpl(entry),
  now: () => clock,
  log: { error() {} },
});

before(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  store = createStore({
    q: async (text, params) => (await pg.query(text, params)).rows,
    tx: (stmts) =>
      pg.transaction(async (tx) => {
        const out = [];
        for (const [text, params] of stmts) out.push((await tx.query(text, params)).rows);
        return out;
      }),
  });
});

beforeEach(async () => {
  await pg.exec('TRUNCATE scores; TRUNCATE request_counts;');
  sent = [];
  notifyImpl = async (entry) => sent.push(entry);
  clock = new Date('2026-10-01T12:00:10Z');
});

let ipSeq = 0;
const nextIp = () => `203.0.113.${++ipSeq % 250}`;

// A finished run that passes every rule: each segment a little over its floor.
function entry(overrides = {}) {
  const splits = [];
  let t = 0;
  SPLITS.forEach((_, i) => splits.push((t += SEGMENT_FLOOR_MS[i] + 60000)));
  return {
    runId: crypto.randomUUID(),
    playerId: crypto.randomUUID(),
    name: 'ada_l',
    stars: 300,
    timeMs: t + SEGMENT_FLOOR_MS.at(-1) + 60000,
    splits,
    splitStars: [90, 160, 190, 230, 250, 250, 262],
    platform: 'github',
    handle: 'ada',
    ...overrides,
  };
}

function post(body, { origin = ORIGIN, type = 'application/json', ip = nextIp(), raw, rules } = {}) {
  const headers = { 'content-type': type, 'x-vercel-forwarded-for': ip, ...(rules && { 'x-rules-version': rules }) };
  if (origin) headers.origin = origin;
  return h.POST(new Request(`${ORIGIN}/api/scores`, { method: 'POST', headers, body: raw ?? JSON.stringify(body) }));
}
const get = (path = '/api/scores') => h.GET(new Request(`${ORIGIN}${path}`));

test('a valid run is stored and ranked', async () => {
  const res = await post(entry());
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.deepEqual(body.you, { rank: 1, total: 1, best: true, fastest: { rank: 1, best: true, name: 'ada_l', stars: 300, timeMs: body.top[0].timeMs } });
  assert.deepEqual(body.top, [{ rank: 1, name: 'ada_l', stars: 300, timeMs: body.top[0].timeMs, platform: 'github', handle: 'ada' }]);
  assert.deepEqual(body.fastest, body.top);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test("a post's share token carries the rank it posted at, and only a best run's rank", async () => {
  const first = entry({ name: 'first', stars: 300 });
  const one = await (await post(first)).json();
  assert.deepEqual(readToken('s'.repeat(40), one.share), { placeKey: 'hq', name: 'first', stars: 300, timeMs: first.timeMs, rank: 1, total: 1 });
  // Someone better posts: the first run's token still says #1 (it's signed, not looked up).
  const better = await (await post(entry({ name: 'better', stars: 350, splitStars: [98, 172, 206, 246, 275, 275, 287] }))).json();
  assert.equal(readToken('s'.repeat(40), better.share).rank, 1);
  assert.equal(readToken('s'.repeat(40), one.share).rank, 1);
  // A player's worse run shares no rank: the board ranks their best, not this one.
  const worse = await (await post(entry({ name: 'first', playerId: first.playerId, stars: 200, splitStars: [90, 160, 190, 190, 190, 190, 190] }))).json();
  assert.equal(worse.you.best, false);
  assert.deepEqual(readToken('s'.repeat(40), worse.share), { placeKey: 'hq', name: 'first', stars: 200, timeMs: first.timeMs, rank: null, total: 2 });
});

test('requests from other sites, or not JSON, are refused before anything else', async () => {
  assert.equal((await post(entry(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(entry(), { origin: null })).status, 403);
  assert.equal((await post(entry(), { type: 'text/plain' })).status, 415);
  assert.equal((await post(null, { raw: '{"name":' })).status, 400);
  assert.equal((await post(null, { raw: JSON.stringify({ ...entry(), pad: 'x'.repeat(3000) }) })).status, 413);
  assert.equal((await post({ ...entry(), admin: true })).status, 400);
  const { playerId, ...missing } = entry();
  assert.equal((await post(missing)).status, 400);
  const count = await pg.query('SELECT count(*)::int AS n FROM request_counts');
  assert.equal(count.rows[0].n, 0, 'junk never reached the database');
});

test('impossible runs, names and links are rejected with a reason', async () => {
  const cases = [
    [{ stars: 383 }, 'stars'],
    [{ timeMs: 1000 }, 'time'],
    [{ splits: [1, 2, 3, 4, 5, 6, 7] }, 'splits'],
    [{ name: 'José' }, 'name'],
    [{ platform: 'github', handle: 'a--b' }, 'link'],
    [{ platform: 'myspace', handle: 'tom' }, 'link'],
    [{ runId: 'not-a-uuid' }, 'id'],
    [{ name: 'f.u.c.k' }, 'rude-name'],
    [{ platform: 'x', handle: 'big_ass' }, 'rude-link'],
  ];
  for (const [overrides, error] of cases) {
    const res = await post(entry(overrides));
    assert.equal(res.status, 422, JSON.stringify(overrides));
    assert.deepEqual(await res.json(), { error });
  }
});

test('a run posts once; the duplicate carries the ranks again, for a game that lost the first answer', async () => {
  const run = entry();
  const first = await post(run);
  assert.equal(first.status, 201);
  const { you } = await first.json();
  const again = await post(run);
  assert.equal(again.status, 409);
  // the ranks and nothing else: no board, no second share token, no second alert
  assert.deepEqual(await again.json(), { error: 'duplicate', you });
  assert.equal(sent.length, 1);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM scores')).rows[0].n, 1);
  // the same run id from a player with no run of their own: refused, with no ranks to give
  const other = await post({ ...run, playerId: crypto.randomUUID() });
  assert.equal(other.status, 409);
  assert.deepEqual(await other.json(), { error: 'duplicate' });
  // nor once the run is hidden
  await pg.query('UPDATE scores SET hidden = true WHERE run_id = $1', [run.runId]);
  const hidden = await post(run);
  assert.equal(hidden.status, 409);
  assert.deepEqual(await hidden.json(), { error: 'duplicate' });
});

test('one address gets five posts a minute, and its refused posts leave the global budget alone', async () => {
  const ip = '198.51.100.9';
  for (let i = 0; i < 5; i++) assert.equal((await post(entry(), { ip })).status, 201);
  const refused = await post(entry(), { ip });
  assert.equal(refused.status, 429);
  assert.equal(refused.headers.get('retry-after'), '60');
  for (let i = 0; i < 20; i++) await post(entry(), { ip });
  const global = await pg.query("SELECT n FROM request_counts WHERE bucket = 'scores:all'");
  assert.equal(global.rows[0].n, 5);
  clock = new Date('2026-10-01T12:01:10Z'); // the next minute
  assert.equal((await post(entry(), { ip })).status, 201);
});

test('the board: most stars, then fastest, then first; one row per player; hidden rows gone', async () => {
  const players = [
    ['p_fast', 382, 700000],
    ['p_slow', 382, 900000],
    ['p_first', 350, 800000],
    ['p_second', 350, 800000], // same stars and time as p_first, posted later
    ['p_mid', 300, 600000],
    ['p_hidden', 381, 600000],
  ];
  for (const [name, stars, timeMs] of players) {
    const splitStars = stars > 357 ? [98, 172, 206, 246, 275, 275, 287] : [90, 160, 190, 230, 250, 250, 262];
    assert.equal((await post(entry({ name, stars, timeMs, splitStars }))).status, 201, name);
  }
  // PGlite's clock ticks in milliseconds, so two quick posts can share a created_at and the
  // random run_id breaks the tie; make "posted later" true regardless (Neon's ticks in µs).
  await pg.query("UPDATE scores SET created_at = created_at + interval '1 ms' WHERE name = 'p_second'");
  // one player, three runs: only the best shows
  const playerId = crypto.randomUUID();
  for (const [stars, timeMs, splitStars] of [[200, 650000, [50, 60, 70, 80, 90, 90, 110]], [320, 990000], [310, 500000]]) {
    assert.equal((await post(entry({ name: 'p_multi', playerId, stars, timeMs, ...(splitStars && { splitStars }) }))).status, 201);
  }
  await pg.query("UPDATE scores SET hidden = true WHERE name = 'p_hidden'");
  const res = await get();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /s-maxage=900/);
  const body = await res.json();
  assert.deepEqual(
    body.top.map((r) => [r.rank, r.name, r.stars]),
    [
      [1, 'p_fast', 382],
      [2, 'p_slow', 382],
      [3, 'p_first', 350],
      [4, 'p_second', 350],
      [5, 'p_multi', 320],
      [6, 'p_mid', 300],
    ],
  );
  assert.equal(body.total, 6);
});

test('the time board: fastest, then most stars, then first; each player\'s fastest run', async () => {
  // milestone stars that allow each finish: 200-285, the default's 262-357, or more
  const low = [90, 160, 190, 190, 190, 190, 190];
  const high = [98, 172, 206, 246, 275, 275, 287];
  const players = [
    ['t_slow', 382, 900000, high],
    ['t_more', 300, 600000],
    ['t_fewer', 250, 600000, low], // same time as t_more, fewer stars
    ['t_first', 350, 800000],
    ['t_second', 350, 800000], // same stars and time as t_first, posted later
    ['t_hidden', 300, 480000], // the fastest, but hidden
  ];
  for (const [name, stars, timeMs, splitStars] of players) {
    assert.equal((await post(entry({ name, stars, timeMs, ...(splitStars && { splitStars }) }))).status, 201, name);
  }
  await pg.query("UPDATE scores SET created_at = created_at + interval '1 ms' WHERE name = 't_second'");
  await pg.query("UPDATE scores SET hidden = true WHERE name = 't_hidden'");
  // one player, three runs: the most stars on one board, the fastest on the other
  const playerId = crypto.randomUUID();
  for (const [stars, timeMs, splitStars] of [[382, 990000, high], [200, 500000, low], [210, 700000, low]]) {
    assert.equal((await post(entry({ name: 't_multi', playerId, stars, timeMs, splitStars }))).status, 201);
  }
  const body = await (await get()).json();
  assert.deepEqual(
    body.fastest.map((r) => [r.rank, r.name, r.stars, r.timeMs]),
    [
      [1, 't_multi', 200, 500000],
      [2, 't_more', 300, 600000],
      [3, 't_fewer', 250, 600000],
      [4, 't_first', 350, 800000],
      [5, 't_second', 350, 800000],
      [6, 't_slow', 382, 900000],
    ],
  );
  assert.deepEqual(body.top.map((r) => [r.rank, r.name, r.stars]).slice(0, 2), [[1, 't_slow', 382], [2, 't_multi', 382]]);
  assert.equal(body.total, 6);
});

test("a post reports the player's rank on both boards, and whether this run is a best on each", async () => {
  const run = entry({ name: 'racer', stars: 300, timeMs: 800000 });
  await post(entry({ name: 'rival', stars: 250, timeMs: 700000, splitStars: [90, 160, 190, 190, 190, 190, 190] }));
  const fastestRun = (r) => ({ name: 'racer', stars: r.stars, timeMs: r.timeMs });
  assert.deepEqual((await (await post(run)).json()).you, { rank: 1, total: 2, best: true, fastest: { rank: 2, best: true, ...fastestRun(run) } });
  // faster with fewer stars: a new fastest, not a new best
  const quick = entry({ playerId: run.playerId, name: 'racer', stars: 200, timeMs: 600000, splitStars: [90, 160, 190, 190, 190, 190, 190] });
  assert.deepEqual((await (await post(quick)).json()).you, { rank: 1, total: 2, best: false, fastest: { rank: 1, best: true, ...fastestRun(quick) } });
  // slower and fewer stars: neither
  const slow = entry({ playerId: run.playerId, name: 'racer', stars: 100, timeMs: 900000, splitStars: [50, 60, 70, 80, 90, 90, 95] });
  // ...and the answer still names the player's fastest run, the earlier quick one
  assert.deepEqual((await (await post(slow)).json()).you, { rank: 1, total: 2, best: false, fastest: { rank: 1, best: false, ...fastestRun(quick) } });
});

test('a run stores the rules its game timed it under; a game too old to say timed it under the first', async () => {
  const stored = async (rules) => {
    const run = entry();
    assert.equal((await post(run, { rules })).status, 201);
    return (await pg.query('SELECT rules_version FROM scores WHERE run_id = $1', [run.runId])).rows[0].rules_version;
  };
  assert.equal(await stored(undefined), 1);
  assert.equal(await stored('2'), 2);
  assert.equal(await stored('1'), 1);
  assert.equal(await stored('9'), 1); // a version this server doesn't know
  assert.equal(await stored('x'), 1);
});

test('the board answers 400 to any query string (a cache-buster would reach the database)', async () => {
  const res = await get('/api/scores?bust=1');
  assert.equal(res.status, 400);
});

test('the alert goes out for a new top-ten best, not otherwise, and a failing alert never fails the post', async () => {
  const first = entry({ name: 'leader', stars: 380, splitStars: [98, 172, 206, 246, 275, 275, 287] });
  await post(first);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, 'leader');
  assert.equal(sent[0].rank, 1);
  assert.equal(sent[0].fastRank, 1);
  assert.match(sent[0].id, /^[0-9a-f-]{36}$/);
  // the same player, worse: not a new best, no alert
  await post(entry({ playerId: first.playerId, name: 'leader', stars: 100, splitStars: [50, 60, 70, 80, 90, 90, 95] }));
  assert.equal(sent.length, 1);
  // ten better players push a newcomer out of the top ten: no alert for them
  for (let i = 0; i < 10; i++) await post(entry({ name: `p${i}`, stars: 381, splitStars: [98, 172, 206, 246, 275, 275, 287] }));
  sent.length = 0;
  const eleventh = entry({ name: 'eleventh', stars: 10, timeMs: 3000000, splitStars: [1, 2, 3, 4, 5, 5, 6] });
  await post(eleventh);
  assert.equal(sent.length, 0);
  // the same player, now the fastest: a new top-ten best on the time board alerts
  await post(entry({ playerId: eleventh.playerId, name: 'eleventh', stars: 5, timeMs: 490000, splitStars: [1, 2, 3, 4, 5, 5, 5] }));
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].rank, sent[0].fastRank], [12, 1]);
  notifyImpl = async () => {
    throw new Error('mail down');
  };
  assert.equal((await post(entry({ name: 'unlucky', stars: 382, splitStars: [98, 172, 206, 246, 275, 275, 287] }))).status, 201);
});

test('the app role can read and add scores, and nothing more', async () => {
  await pg.exec('SET ROLE sc_app');
  try {
    const run = entry();
    await pg.query(
      `INSERT INTO scores (run_id, player_id, name, stars, time_ms, splits, split_stars, platform, handle, ip_hash, rules_version)
       VALUES ($1, $2, 'ok', 10, 100000, '{1,2,3,4,5,6,7}', '{0,0,0,0,0,0,1}', NULL, NULL, $3, 1)`,
      [run.runId, run.playerId, 'a'.repeat(64)],
    );
    await assert.rejects(pg.query('UPDATE scores SET hidden = true'), /permission denied/);
    await assert.rejects(pg.query('DELETE FROM scores'), /permission denied/);
    await assert.rejects(pg.query('CREATE TABLE sneaky (x int)'), /permission denied/);
    await assert.rejects(pg.query('DELETE FROM request_counts'), /permission denied/);
    await assert.rejects(
      pg.query(
        `INSERT INTO scores (run_id, player_id, name, stars, time_ms, splits, split_stars, ip_hash, rules_version)
         VALUES (gen_random_uuid(), gen_random_uuid(), 'x', 999, 100000, '{1,2,3,4,5,6,7}', '{0,0,0,0,0,0,1}', $1, 1)`,
        ['a'.repeat(64)],
      ),
      /scores_stars/,
    );
  } finally {
    await pg.exec('RESET ROLE');
  }
});

test('the table enforces the shared name and link rules itself', async () => {
  const insert = (name, platform, handle) =>
    pg.query(
      `INSERT INTO scores (run_id, player_id, name, stars, time_ms, splits, split_stars, platform, handle, ip_hash, rules_version)
       VALUES (gen_random_uuid(), gen_random_uuid(), $1, 10, 100000, '{1,2,3,4,5,6,7}', '{0,0,0,0,0,0,1}', $2, $3, $4, 1)`,
      [name, platform, handle, 'a'.repeat(64)],
    );
  await insert('Grace Hopper', 'bluesky', 'grace.bsky.social');
  await insert('!~', 'x', 'a_b');
  await assert.rejects(insert(' lead', null, null), /scores_name/);
  await assert.rejects(insert('José', null, null), /scores_name/);
  await assert.rejects(insert('ok', 'github', 'a--b'), /scores_link/);
  await assert.rejects(insert('ok', 'bluesky', 'UPPER.bsky.social'), /scores_link/);
  await assert.rejects(insert('ok', 'github', null), /scores_link/);
  await assert.rejects(insert('ok', null, 'octocat'), /scores_link/);
});
