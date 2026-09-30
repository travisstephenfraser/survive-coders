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
    return reply(201, { you: { rank: 3, total: 9, best: true }, top: [{ rank: 1, name: 'x', stars: 9, timeMs: 1000, platform: null, handle: null }], total: 9, asOf: '2026-10-01T00:00:00Z' });
  };
  const r = await submitScore(summary, profile, 'p-1');
  assert.deepEqual(sent, [
    ['/api/scores', 'POST', { runId: 'r-1', playerId: 'p-1', name: 'ada_l', stars: 5, timeMs: 300000, splits: [1, 2, 3, 4, 5, 6, 7], splitStars: [0, 0, 0, 0, 0, 0, 1], platform: 'github', handle: 'ada' }],
  ]);
  assert.deepEqual(r.you, { rank: 3, total: 9, best: true });
  assert.equal(r.board.state, 'ok');
  assert.equal(r.board.top[0].name, 'x');
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
