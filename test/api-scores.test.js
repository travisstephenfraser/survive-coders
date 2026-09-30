import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createStore } from '../api/_lib/store.js';
import { scoresHandlers } from '../api/_lib/scores.js';
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

function post(body, { origin = ORIGIN, type = 'application/json', ip = nextIp(), raw } = {}) {
  const headers = { 'content-type': type, 'x-vercel-forwarded-for': ip };
  if (origin) headers.origin = origin;
  return h.POST(new Request(`${ORIGIN}/api/scores`, { method: 'POST', headers, body: raw ?? JSON.stringify(body) }));
}
const get = (path = '/api/scores') => h.GET(new Request(`${ORIGIN}${path}`));

test('a valid run is stored and ranked', async () => {
  const res = await post(entry());
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.deepEqual(body.you, { rank: 1, total: 1, best: true });
  assert.deepEqual(body.top, [{ rank: 1, name: 'ada_l', stars: 300, timeMs: body.top[0].timeMs, platform: 'github', handle: 'ada' }]);
  assert.equal(res.headers.get('cache-control'), 'no-store');
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
  ];
  for (const [overrides, error] of cases) {
    const res = await post(entry(overrides));
    assert.equal(res.status, 422, JSON.stringify(overrides));
    assert.deepEqual(await res.json(), { error });
  }
});

test('a run posts once', async () => {
  const run = entry();
  assert.equal((await post(run)).status, 201);
  assert.equal((await post(run)).status, 409);
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
  assert.match(sent[0].id, /^[0-9a-f-]{36}$/);
  // the same player, worse: not a new best, no alert
  await post(entry({ playerId: first.playerId, name: 'leader', stars: 100, splitStars: [50, 60, 70, 80, 90, 90, 95] }));
  assert.equal(sent.length, 1);
  // ten better players push a newcomer out of the top ten: no alert for them
  for (let i = 0; i < 10; i++) await post(entry({ name: `p${i}`, stars: 381, splitStars: [98, 172, 206, 246, 275, 275, 287] }));
  sent.length = 0;
  await post(entry({ name: 'eleventh', stars: 10, splitStars: [1, 2, 3, 4, 5, 5, 6] }));
  assert.equal(sent.length, 0);
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
