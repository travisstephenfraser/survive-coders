import test from 'node:test';
import assert from 'node:assert/strict';

// settings.js reads storage once, on load, so each case loads a fresh copy of the module
// against its own fake localStorage.
let copy = 0;
async function load(stored, more = {}) {
  const data = new Map([...(stored === undefined ? [] : [['sc_settings', stored]]), ...Object.entries(more)]);
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
  const mod = await import(`../src/settings.js?copy=${copy++}`);
  return { ...mod, data };
}

test('defaults apply when nothing is stored, and a change persists as versioned JSON', async () => {
  const { settings, DEFAULTS, data } = await load();
  for (const [k, v] of Object.entries(DEFAULTS)) assert.equal(settings.get(k), v, k);
  settings.set('music', 0.4);
  settings.set('crt', false);
  assert.deepEqual(JSON.parse(data.get('sc_settings')), { ...DEFAULTS, v: 1, music: 0.4, crt: false });
});

test('stored settings load, with volumes snapped to tenths and bad values ignored', async () => {
  const stored = JSON.stringify({ v: 1, music: 0.34, sfx: 7, mute: true, crt: 'no', timer: true, extra: 1 });
  const { settings, DEFAULTS } = await load(stored);
  assert.equal(settings.get('music'), 0.3);
  assert.equal(settings.get('sfx'), 1);
  assert.equal(settings.get('mute'), true);
  assert.equal(settings.get('crt'), DEFAULTS.crt);
  assert.equal(settings.get('timer'), true);
  assert.equal(settings.get('extra'), undefined);
});

test('another version, or unreadable storage, falls back to the defaults', async () => {
  for (const stored of [JSON.stringify({ v: 2, music: 0 }), '{not json']) {
    const { settings, DEFAULTS } = await load(stored);
    assert.equal(settings.get('music'), DEFAULTS.music);
  }
});

test('a storage that throws never breaks the game', async () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  const { settings, DEFAULTS } = await import(`../src/settings.js?copy=${copy++}`);
  assert.equal(settings.get('sfx'), DEFAULTS.sfx);
  settings.set('sfx', 0.5);
  assert.equal(settings.get('sfx'), 0.5);
});

test('the mic mode is open unless one of the three is stored', async () => {
  const fresh = await load();
  assert.deepEqual(fresh.MIC_MODES, ['open', 'hold', 'off']);
  assert.equal(fresh.settings.get('mic'), 'open');
  for (const mode of ['hold', 'off']) {
    const { settings } = await load(JSON.stringify({ v: 1, mic: mode }));
    assert.equal(settings.get('mic'), mode);
  }
  for (const bad of ['loud', '', 3, null]) {
    const { settings } = await load(JSON.stringify({ v: 1, mic: bad }));
    assert.equal(settings.get('mic'), 'open', JSON.stringify(bad));
  }
});

test('a passed mic check is remembered on its own, apart from the settings', async () => {
  const first = await load();
  assert.equal(first.micCheck.passed(), false);
  first.micCheck.pass();
  assert.equal(first.micCheck.passed(), true);
  assert.equal(first.data.get('sc_mic_ok'), '1');
  assert.equal(first.data.has('sc_settings'), false);
  const later = await load(undefined, { sc_mic_ok: '1' });
  assert.equal(later.micCheck.passed(), true);
});

test('with storage blocked, a passed check still holds until the page is closed', async () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  const { micCheck } = await import(`../src/settings.js?copy=${copy++}`);
  assert.equal(micCheck.passed(), false);
  micCheck.pass();
  assert.equal(micCheck.passed(), true);
});
