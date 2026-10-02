import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Phaser's own key-code table: plain data, so it loads under node without the rest of Phaser.
const K = createRequire(import.meta.url)('phaser/src/input/keyboard/keys/KeyCodes.js');

// keymap.js reads storage once, on load, so each case loads a fresh copy of the module against
// its own fake localStorage (as test/settings.test.js does).
let copy = 0;
async function load(stored) {
  const data = new Map(stored === undefined ? [] : [['sc_keys', typeof stored === 'string' ? stored : JSON.stringify(stored)]]);
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
  const mod = await import(`../src/keymap.js?copy=${copy++}`);
  return { ...mod, data, saved: () => JSON.parse(data.get('sc_keys')).keys };
}

// Known answer, from outside this module: the keys the game shipped with, by the names its
// code used (Player.js, HUD.js) and Phaser's table of what those names are.
test('the defaults are the keys the game shipped with, by Phaser\'s own codes', async () => {
  const { DEFAULTS } = await load();
  assert.deepEqual(DEFAULTS, {
    left: [K.LEFT, K.A],
    right: [K.RIGHT, K.D],
    jump: [K.UP, K.W, K.Z],
    fire: [K.SPACE, K.X, K.J],
    ship: [K.ONE, K.NUMPAD_ONE],
    rollback: [K.TWO, K.NUMPAD_TWO],
    refactor: [K.THREE, K.NUMPAD_THREE],
    talk: [K.M],
    pause: [K.P],
    mute: [K.N],
    restart: [K.R],
    newrun: [K.G],
    title: [K.T],
  });
});

test('the defaults give every action a key it can name, and no key to two actions', async () => {
  const { ACTIONS, DEFAULTS, LABELS, keyName } = await load();
  assert.deepEqual(Object.keys(DEFAULTS), ACTIONS);
  assert.deepEqual(Object.keys(LABELS), ACTIONS);
  const all = ACTIONS.flatMap((a) => DEFAULTS[a]);
  assert.equal(new Set(all).size, all.length, 'a default key is on two actions');
  for (const a of ACTIONS) {
    assert.ok(DEFAULTS[a].length > 0, `${a} has no default key`);
    for (const code of DEFAULTS[a]) assert.ok(keyName(code), `${a}: ${code} has no name`);
  }
});

test('keys are named in characters the font can draw; keys that can\'t be bound have no name', async () => {
  const { keyName } = await load();
  const named = { [K.A]: 'A', [K.ZERO]: '0', [K.NUMPAD_ONE]: 'NUM1', [K.LEFT]: '←', [K.UP]: '↑', [K.RIGHT]: '→', [K.DOWN]: '↓', [K.SPACE]: 'SPACE', [K.SHIFT]: 'SHIFT', [K.FORWARD_SLASH]: '/', [K.SEMICOLON]: ';', [K.SEMICOLON_FIREFOX]: ';' };
  for (const [code, name] of Object.entries(named)) assert.equal(keyName(Number(code)), name);
  for (const code of [K.ESC, K.ENTER, K.TAB, K.BACKSPACE, K.DELETE, K.CTRL, K.ALT, K.CAPS_LOCK, K.F5, 91, 0, 229, 1.5, '65', undefined]) {
    assert.equal(keyName(code), null, String(code));
  }
});

test('with nothing stored the map is the defaults, and nothing is written until a change', async () => {
  const { keymap, ACTIONS, DEFAULTS, data } = await load();
  for (const a of ACTIONS) assert.deepEqual(keymap.codes(a), DEFAULTS[a], a);
  assert.equal(keymap.isDefault(), true);
  assert.equal(keymap.name('jump'), '↑');
  assert.equal(keymap.names('jump', ' / '), '↑ / W / Z');
  assert.equal(keymap.pair('left', 'right'), '←→');
  assert.equal(keymap.has('fire', K.J), true);
  assert.equal(data.has('sc_keys'), false);
});

test('a bind makes that key the action\'s only one, and persists as versioned JSON', async () => {
  const { keymap, data, saved } = await load();
  assert.deepEqual(keymap.bind('jump', K.K), { from: null });
  assert.deepEqual(keymap.codes('jump'), [K.K]);
  assert.equal(keymap.has('jump', K.UP), false);
  assert.equal(keymap.isDefault(), false);
  assert.equal(JSON.parse(data.get('sc_keys')).v, 1);
  assert.deepEqual(saved().jump, [K.K]);
  // A fresh load of what was saved gives the same map back.
  const again = await load(JSON.parse(data.get('sc_keys')));
  assert.deepEqual(again.keymap.codes('jump'), [K.K]);
  assert.deepEqual(again.keymap.codes('fire'), again.DEFAULTS.fire);
});

test('a bound key is taken from the action that had it, which can be left unbound', async () => {
  const { keymap } = await load();
  // SPACE is one of fire's three: fire keeps the other two.
  assert.deepEqual(keymap.bind('jump', K.SPACE), { from: 'fire' });
  assert.deepEqual(keymap.codes('fire'), [K.X, K.J]);
  // M is talk's only key: talk is left with none.
  assert.deepEqual(keymap.bind('fire', K.M), { from: 'talk' });
  assert.deepEqual(keymap.codes('talk'), []);
  assert.equal(keymap.name('talk'), '?');
  assert.equal(keymap.names('talk'), '?');
  // Two keys in one hint: only a pair of arrows goes without the space.
  keymap.bind('left', K.A);
  assert.equal(keymap.pair('left', 'right'), 'A →');
  assert.equal(keymap.pair('talk', 'right'), '? →');
  // Binding an action's own key again takes it from nobody.
  assert.deepEqual(keymap.bind('fire', K.M), { from: null });
});

test('no key is ever on two actions, whatever is bound and reset', async () => {
  const { keymap, ACTIONS, keyName } = await load();
  const bindable = [];
  for (let code = 0; code < 256; code++) if (keyName(code)) bindable.push(code);
  let seed = 7;
  const next = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  let stolen = 0;
  for (let i = 0; i < 2000; i++) {
    const a = ACTIONS[next(ACTIONS.length)];
    if (next(10) === 0) keymap.reset(a);
    else if (keymap.bind(a, bindable[next(bindable.length)]).from) stolen++;
    const all = ACTIONS.flatMap((x) => keymap.codes(x));
    assert.equal(new Set(all).size, all.length, `step ${i}: a key is on two actions`);
  }
  // The check checks something: keys really were taken from other actions along the way.
  assert.ok(stolen > 100, `only ${stolen} binds took a key from another action`);
});

test('a key that can\'t be bound is refused and changes nothing', async () => {
  const { keymap, DEFAULTS, data } = await load();
  for (const code of [K.ESC, K.ENTER, K.TAB, K.BACKSPACE, K.CTRL, 229]) assert.equal(keymap.bind('jump', code), null);
  assert.deepEqual(keymap.codes('jump'), DEFAULTS.jump);
  assert.equal(data.has('sc_keys'), false);
});

test('reset puts one action\'s defaults back, taking them from whoever holds one; or all of them', async () => {
  const { keymap, DEFAULTS, saved } = await load();
  keymap.bind('jump', K.SPACE); // fire loses SPACE
  keymap.bind('fire', K.K);
  keymap.bind('mute', K.X); // one of fire's defaults
  keymap.reset('fire');
  assert.deepEqual(keymap.codes('fire'), DEFAULTS.fire);
  assert.deepEqual(keymap.codes('jump'), [], 'jump held SPACE, which went back to fire');
  assert.deepEqual(keymap.codes('mute'), [], 'mute held X, which went back to fire');
  assert.deepEqual(saved().fire, DEFAULTS.fire);
  keymap.reset();
  assert.equal(keymap.isDefault(), true);
  assert.deepEqual(saved(), DEFAULTS);
});

test('a saved map loads; an action saved badly falls back to its own defaults', async () => {
  const { keymap, DEFAULTS } = await load({
    v: 1,
    keys: { jump: [K.K], fire: [K.ENTER], ship: 'Q', rollback: [K.Q, K.E, K.F, K.G, K.H], refactor: [K.F, 1.5], talk: [], extra: [K.L] },
  });
  assert.deepEqual(keymap.codes('jump'), [K.K]);
  assert.deepEqual(keymap.codes('fire'), DEFAULTS.fire, 'ENTER can\'t be bound');
  assert.deepEqual(keymap.codes('ship'), DEFAULTS.ship, 'not a list');
  assert.deepEqual(keymap.codes('rollback'), DEFAULTS.rollback, 'too many keys');
  assert.deepEqual(keymap.codes('refactor'), DEFAULTS.refactor, 'not a key code');
  assert.deepEqual(keymap.codes('talk'), [], 'saved as unbound');
  assert.deepEqual(keymap.codes('left'), DEFAULTS.left, 'not saved at all');
});

test('a saved map with one key on two actions loads with it on one', async () => {
  // Saved: jump and fire both on SPACE, and pause on A, which is one of move left's defaults.
  const { keymap } = await load({ v: 1, keys: { jump: [K.SPACE], fire: [K.SPACE, K.J, K.J], pause: [K.A] } });
  assert.deepEqual(keymap.codes('jump'), [K.SPACE], 'first in the list keeps it');
  assert.deepEqual(keymap.codes('fire'), [K.J]);
  assert.deepEqual(keymap.codes('pause'), [K.A], 'a saved key beats another action\'s default');
  assert.deepEqual(keymap.codes('left'), [K.LEFT]);
});

test('another version, a map that is not an object, or unreadable storage: the defaults', async () => {
  for (const stored of [{ v: 2, keys: { jump: [75] } }, { v: 1, keys: 'jump' }, { v: 1 }, '{not json', 'null', '[]']) {
    const { keymap } = await load(stored);
    assert.equal(keymap.isDefault(), true, JSON.stringify(stored));
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
  const { keymap } = await import(`../src/keymap.js?copy=${copy++}`);
  assert.equal(keymap.isDefault(), true);
  assert.deepEqual(keymap.bind('jump', K.K), { from: null });
  assert.deepEqual(keymap.codes('jump'), [K.K]);
});
