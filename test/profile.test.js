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
