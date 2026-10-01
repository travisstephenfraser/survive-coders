import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRows } from '../src/api.js';

test('board rows are re-checked before drawing, and links rebuilt from the platform template', () => {
  const rows = cleanRows([
    { rank: 1, name: 'ada_l', stars: 382, timeMs: 700000, platform: 'github', handle: 'ada' },
    { rank: 2, name: 'grace', stars: 300, timeMs: 800000, platform: 'github', handle: 'bad--handle' },
    { rank: 3, name: 'nolink', stars: 200, timeMs: 900000, platform: null, handle: null },
    { rank: 4, name: 'José', stars: 100, timeMs: 900000 },
    { rank: 5, name: 'toomany', stars: 999, timeMs: 900000 },
    { rank: 6, name: 'js', stars: 10, timeMs: 900000, platform: 'javascript', handle: 'alert(1)' },
    null,
  ]);
  assert.deepEqual(
    rows.map((r) => [r.rank, r.name, r.url]),
    [
      [1, 'ada_l', 'https://github.com/ada'],
      [2, 'grace', null],
      [3, 'nolink', null],
      [6, 'js', null],
    ],
  );
});

test('a board that is not a list draws as empty', () => {
  assert.deepEqual(cleanRows(undefined), []);
  assert.deepEqual(cleanRows({ rank: 1 }), []);
});

const summary = { runId: 'r-1', timeMs: 300000, splits: [1, 2, 3, 4, 5, 6, 7], splitStars: [0, 0, 0, 0, 0, 0, 1], stars: 5, reasons: [], eligible: true };
const profile = { name: 'ada_l', platform: 'github', handle: 'ada' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('a submission posts exactly the run and profile, and a 201 comes back as rank plus board', async () => {
  const { submitScore } = await import('../src/api.js');
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push([url, init.method, JSON.parse(init.body)]);
    return reply(201, {
      you: { rank: 3, total: 9, best: true, fastest: { rank: 1, best: true } },
      top: [{ rank: 1, name: 'x', stars: 9, timeMs: 1000, platform: null, handle: null }],
      fastest: [{ rank: 1, name: 'y', stars: 5, timeMs: 900, platform: null, handle: null }],
      total: 9,
      asOf: '2026-10-01T00:00:00Z',
    });
  };
  const r = await submitScore(summary, profile, 'p-1');
  assert.deepEqual(sent, [
    ['/api/scores', 'POST', { runId: 'r-1', playerId: 'p-1', name: 'ada_l', stars: 5, timeMs: 300000, splits: [1, 2, 3, 4, 5, 6, 7], splitStars: [0, 0, 0, 0, 0, 0, 1], platform: 'github', handle: 'ada' }],
  ]);
  assert.deepEqual(r.you, { rank: 3, total: 9, best: true, fastest: { rank: 1, best: true } });
  assert.equal(r.board.state, 'ok');
  assert.equal(r.board.top[0].name, 'x');
  assert.equal(r.board.fastest[0].name, 'y');
});

test("an answer without a time board or time rank (an older API's) reads as missing, not empty", async () => {
  const { submitScore, getBoard } = await import('../src/api.js?older=1');
  const old = { top: [{ rank: 1, name: 'x', stars: 9, timeMs: 1000, platform: null, handle: null }], total: 1, asOf: '2026-10-01T00:00:00Z' };
  globalThis.fetch = async () => reply(200, old);
  const b = await getBoard();
  assert.equal(b.fastest, null);
  assert.equal(b.top.length, 1);
  globalThis.fetch = async () => reply(201, { you: { rank: 1, total: 1, best: true }, ...old });
  const r = await submitScore(summary, profile, 'p-1');
  assert.deepEqual(r.you, { rank: 1, total: 1, best: true, fastest: null });
  globalThis.fetch = async () => reply(201, { you: { rank: 1, total: 1, best: true, fastest: { rank: 'x', best: 'yes' } }, ...old, fastest: [] });
  const junk = await submitScore(summary, profile, 'p-1');
  assert.equal(junk.you.fastest, null);
  assert.deepEqual(junk.board.fastest, []);
  globalThis.fetch = async () => reply(201, { you: { rank: 1, total: 1, best: true, fastest: { rank: -3, best: true } }, ...old });
  assert.equal((await submitScore(summary, profile, 'p-1')).you.fastest, null);
  globalThis.fetch = async () => reply(200, { fastest: old.top, total: 1, asOf: '2026-10-01T00:01:00Z' });
  const noTop = await getBoard();
  assert.equal(noTop.top, null);
  assert.equal(noTop.fastest.length, 1);
});

test('refusals keep their status and reason; a network failure is retried once, then offline', async () => {
  const { submitScore } = await import('../src/api.js');
  for (const [status, error] of [[409, 'duplicate'], [422, 'name'], [429, 'busy']]) {
    globalThis.fetch = async () => reply(status, { error });
    assert.deepEqual(await submitScore(summary, profile, 'p-1'), { state: 'error', status, error });
  }
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError('network');
  };
  assert.deepEqual(await submitScore(summary, profile, 'p-1', { retryDelayMs: 0 }), { state: 'offline' });
  assert.equal(calls, 2);
});

test('the leaderboard shows whichever is newer: the board a post returned, or the cached one', async () => {
  const { submitScore, getBoard } = await import('../src/api.js?isolated=1');
  const row = (name) => [{ rank: 1, name, stars: 9, timeMs: 1000, platform: null, handle: null }];
  const board = (asOf, name) => ({ top: row(name), fastest: row(name), total: 1, asOf });
  globalThis.fetch = async () => reply(201, { you: { rank: 1, total: 1, best: true }, ...board('2026-10-01T12:00:00.000Z', 'posted') });
  await submitScore(summary, profile, 'p-1');
  // the edge cache still holds a board from before the post
  globalThis.fetch = async () => reply(200, board('2026-10-01T11:50:00.000Z', 'cached'));
  assert.equal((await getBoard()).top[0].name, 'posted');
  assert.equal((await getBoard()).fastest[0].name, 'posted');
  // once the cache refreshes past the post, the fresh board wins
  globalThis.fetch = async () => reply(200, board('2026-10-01T12:20:00.000Z', 'fresh'));
  assert.equal((await getBoard()).top[0].name, 'fresh');
});
