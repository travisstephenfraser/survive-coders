import test from 'node:test';
import assert from 'node:assert/strict';

let copy = 0;
async function load(initial = {}, { blocked = false } = {}) {
  const data = new Map(Object.entries(initial));
  globalThis.localStorage = blocked
    ? {
        getItem() {
          throw new Error('blocked');
        },
        setItem() {
          throw new Error('blocked');
        },
      }
    : { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
  return { ...(await import(`../src/profile.js?copy=${copy++}`)), data };
}

test('a browser gets one player id, kept across visits', async () => {
  const { playerId, data } = await load();
  const id = playerId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(playerId(), id);
  assert.equal(data.get('sc_player'), id);
  const again = await load({ sc_player: id });
  assert.equal(again.playerId(), id);
});

test('a malformed stored id is replaced, and blocked storage still gives one id per session', async () => {
  const { playerId } = await load({ sc_player: 'hello' });
  assert.notEqual(playerId(), 'hello');
  const blocked = await load({}, { blocked: true });
  assert.equal(blocked.playerId(), blocked.playerId());
});

test('the profile round-trips, and junk in storage comes back as an empty profile', async () => {
  const { loadProfile, saveProfile } = await load();
  assert.deepEqual(loadProfile(), { name: '', platform: null, handle: null });
  saveProfile({ name: 'ada_l', platform: 'github', handle: 'ada', extra: 1 });
  assert.deepEqual(loadProfile(), { name: 'ada_l', platform: 'github', handle: 'ada' });
  const junk = await load({ sc_profile: JSON.stringify({ name: 42, platform: 'myspace', handle: {} }) });
  assert.deepEqual(junk.loadProfile(), { name: '', platform: null, handle: null });
});

// What a post's answer does to the saved bests (the leaderboard marks these rows as yours).
const posted = { name: 'ada_l', stars: 300, timeMs: 200000 };
const earlier = { name: 'ada_l', stars: 120, timeMs: 150000 };
const stored = (data) => ({ best: JSON.parse(data.get('sc_best') ?? 'null'), fastest: JSON.parse(data.get('sc_fastest') ?? 'null') });

test('a posted run that is a best on a board is saved as that best; the server names the fastest', async () => {
  const both = await load();
  both.keepBests({ state: 'ok', you: { rank: 1, total: 4, best: true, fastest: { rank: 1, best: true, run: posted } } }, posted);
  assert.deepEqual(stored(both.data), { best: posted, fastest: posted });
  // a best on stars only: the fastest stays the earlier run the server names
  const stars = await load();
  stars.keepBests({ state: 'ok', you: { rank: 1, total: 4, best: true, fastest: { rank: 2, best: false, run: earlier } } }, posted);
  assert.deepEqual(stored(stars.data), { best: posted, fastest: earlier });
  // neither: the saved best is left alone
  const neither = await load({ sc_best: JSON.stringify(earlier) });
  neither.keepBests({ state: 'ok', you: { rank: 2, total: 4, best: false, fastest: { rank: 2, best: false, run: null } } }, posted);
  assert.deepEqual(stored(neither.data), { best: earlier, fastest: null });
  // the answer names no run but says this one is the fastest
  const unnamed = await load();
  unnamed.keepBests({ state: 'ok', you: { rank: 2, total: 4, best: false, fastest: { rank: 1, best: true, run: null } } }, posted);
  assert.deepEqual(stored(unnamed.data), { best: null, fastest: posted });
});

test("an answer with no time rank (an older API's) forgets a saved fastest this run beats, and only then", async () => {
  const answer = { state: 'ok', you: { rank: 1, total: 4, best: true, fastest: null } };
  const beaten = await load({ sc_fastest: JSON.stringify({ ...earlier, timeMs: 900000 }) });
  beaten.keepBests(answer, posted);
  assert.equal(stored(beaten.data).fastest, null);
  const standing = await load({ sc_fastest: JSON.stringify(earlier) });
  standing.keepBests(answer, posted);
  assert.deepEqual(stored(standing.data).fastest, earlier);
});

test('a duplicate that names the ranks saves the bests like the answer that was lost; other refusals save nothing', async () => {
  const lost = await load();
  lost.keepBests({ state: 'error', status: 409, error: 'duplicate', you: { rank: 1, total: 4, best: true, fastest: { rank: 1, best: true, run: posted } } }, posted);
  assert.deepEqual(stored(lost.data), { best: posted, fastest: posted });
  for (const r of [{ state: 'error', status: 409, error: 'duplicate' }, { state: 'error', status: 422, error: 'name' }, { state: 'offline' }]) {
    const none = await load({ sc_fastest: JSON.stringify({ ...earlier, timeMs: 900000 }) });
    none.keepBests(r, posted);
    assert.deepEqual(stored(none.data), { best: null, fastest: { ...earlier, timeMs: 900000 } }, JSON.stringify(r));
  }
});
