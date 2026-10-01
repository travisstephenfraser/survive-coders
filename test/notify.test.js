import test from 'node:test';
import assert from 'node:assert/strict';
import { resendNotifier } from '../api/_lib/notify.js';

const entry = {
  id: '11111111-2222-4333-8444-555555555555',
  rank: 1,
  fastRank: 3,
  total: 12,
  name: 'ada_l',
  stars: 382,
  timeMs: 75500,
  splits: [12000, 27000, 33000, 39500, 43500, 48500, 56500],
  splitStars: [98, 172, 206, 246, 275, 275, 287],
  url: 'https://github.com/ada',
  playerId: '66666666-7777-4888-9999-000000000000',
  ipHash: 'ab'.repeat(32),
};

test('a top-ten alert is one Resend email carrying the run and the line that hides it', async () => {
  const calls = [];
  const notify = resendNotifier({ apiKey: 're_test', to: 'me@example.com' }, { fetch: async (u, init) => (calls.push([u, init]), new Response('{}')) });
  await notify(entry);
  assert.equal(calls.length, 1);
  const [u, init] = calls[0];
  assert.equal(u, 'https://api.resend.com/emails');
  assert.equal(init.headers.authorization, 'Bearer re_test');
  const body = JSON.parse(init.body);
  assert.deepEqual(body.to, ['me@example.com']);
  assert.match(body.from, /onboarding@resend\.dev/);
  assert.match(body.subject, /time #3, ★ #1 of 12: ada_l, ★ 382 in 1:15\.5/);
  assert.match(body.text, /UPDATE scores SET hidden = true WHERE id = '11111111-2222-4333-8444-555555555555';/);
  assert.match(body.text, /https:\/\/github\.com\/ada/);
  assert.ok(init.signal, 'bounded by a timeout');
});

test('no settings, no email', async () => {
  let called = false;
  await resendNotifier(null, { fetch: async () => (called = true) })(entry);
  assert.equal(called, false);
});

test('a refused or failed send is logged by status or name only, and never throws', async () => {
  const lines = [];
  const log = { error: (l) => lines.push(l) };
  await resendNotifier({ apiKey: 'k', to: 't' }, { fetch: async () => new Response('bad', { status: 422 }), log })(entry);
  await resendNotifier({ apiKey: 'k', to: 't' }, { fetch: async () => Promise.reject(Object.assign(new Error('secret-ish detail'), { name: 'TimeoutError' })), log })(entry);
  assert.deepEqual(lines, ['alert 422', 'alert 0 TimeoutError']);
});
