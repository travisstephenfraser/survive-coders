# Key Remapping and Quit to Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player can remap twelve keyboard actions from a controls screen in Settings, quit to the title from the pause screen, and start a new run or go to the title straight from the posted leaderboard form.

**Architecture:** One new module, `src/keymap.js`, holds the map (actions, defaults, key names, load and save, bind, reset) with no Phaser and no `window`, so it is tested under node. Everything that reads a key asks it: Phaser key objects are made from it when a level starts, the voice keys and the HUD's keys check it at each keydown, and every on-screen hint takes its key names from it. The map changes only on a new Controls scene, reached from Settings, where no run is in progress.

**Tech Stack:** Phaser 3.90 + Vite 8, plain JavaScript (ES modules), `node --test`. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-01-key-remap-restart-design.md` (read it first).

## Global Constraints

- Work on branch `claude/key-remap-restart`, off master `0fac922`. `master` auto-deploys to production: no push, no merge, no PR without Travis's go. Before any push, run `git fetch` and check the behind count as a separate step, and read the output before doing anything else.
- Stage explicit paths only. `feed/` has unrelated uncommitted edits.
- The repo is public. Name no player or playtester. God mode stays undocumented.
- Front end only: no change under `api/`, `db/`, `shared/` or the environment. `src/settings.js` and the `sc_settings` storage key do not change.
- The map is stored under `sc_keys` as `{ v: 1, keys: { action: [codes] } }`.
- The twelve actions, in this order: `left`, `right`, `jump`, `fire`, `ship`, `rollback`, `refactor`, `talk`, `pause`, `mute`, `restart`, `title`.
- With nothing saved, play and every hint are as they are on master, except: the pause screen (spec decision 13); the end screen's `R` and the posted form's hint (decisions 14 and 15); and the powers' keys, which now match by key code, so they also fire with SHIFT held (the number pad's 1, 2 and 3 fire them as before, because they are in the defaults).
- `ESC` always pauses. The menu keys, the intro skip, the fall's typing, the title's `V`, and the end screen's `ENTER`, `S` and `T` stay fixed.
- Match the surrounding code: comments explain why, in the codebase's voice. No em dashes.
- `npm run stars` must still print `total     382  (MAX_STARS 382)`.
- Baseline before this plan: `npm test` 83 pass, 0 fail; `npm run build` clean. After Task 1: 96 pass.
- Commit messages follow the repo's `Area: sentence` style and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

The inputs most likely to bite a person. None can be pinned by a node test (they need a real keyboard event or a drawn frame), so each is pinned by a named browser check in the task that owns the code:

1. **The key being bound leaks out of the capture.** Binding `M` must not open the microphone, `ESC` during a capture must cancel it and stay on the screen, and `SPACE` must bind without picking the row again. (Task 5, Step 5.)
2. **A name typed before the post.** `r`, `t`, `R` and `T` in the name field must type letters. Only after the post do `R` and `T` leave the screen. (Task 6, Step 4.)
3. **An action with no key.** A map with jump unbound must start a level with no error, read `?` in the hints and `unbound` on the controls screen, and leave every other key working. (Task 2, Step 8; Task 5, Step 5.)
4. **Long key names.** With SHIFT, SPACE and the number pad bound, no hint may run into another: the HUD strip's hint shortens beside the status line. (Task 4, Step 8.)
5. **A quit that leaves a run behind.** After quit to title: one active scene, no music playing, the run clock idle, and the next run on a fresh clock. `T` outside the pause screen does nothing. (Task 3, Step 4.)

Measured on 2026-10-01 in the game's own font (size 16 unless said), so the layouts below are not guesses: `SPACE restart level` is 198 px and `SHIFT quit to title` 196 px (a 222 px button leaves 198); `SHIFT refactor` is 158 px (a 174 px slot leaves 162); the strip's hint is 394 px at the defaults and its widest neighbour, the full-context line, 464 px.

## Browser checks: how

Node cannot load a Phaser scene (it needs a canvas), so Tasks 2 to 6 are checked in the browser.

- `npm run dev`, then open `http://localhost:5173/`. `?park`, `?tower=60` and `?boss` after the URL start a run at that level once PLAY NOW is picked (such a run is never ranked).
- Key presses must be real ones: by hand, or a browser tool's key press. A synthetic `dispatchEvent` may not carry `keyCode`, which is what Phaser and the map read.
- `window.game` is on every build; `window.run` and `window.voice` are on the dev build only.
- The custom map used throughout (jump on SPACE, fire on SHIFT, the powers on Q, E and F, talk on K). Until the controls screen exists (Task 5), set it from the console:

```js
localStorage.setItem('sc_keys', JSON.stringify({ v: 1, keys: { jump: [32], fire: [16], ship: [81], rollback: [69], refactor: [70], talk: [75] } }));
location.reload();
```

- Back to the defaults: `localStorage.removeItem('sc_keys'); location.reload();`
- Every check also expects no console errors.

---

## Setup (before Task 1)

- [ ] **Confirm the branch and the baseline** (each command on its own, and read the output):

```bash
git -C ~/Developer/survive-coders status -sb
```

Expected: `## claude/key-remap-restart`, with only `feed/` files listed.

```bash
cd ~/Developer/survive-coders && npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'
```

Expected: `ℹ tests 83`, `ℹ pass 83`, `ℹ fail 0`.

---

### Task 1: The key map

**Files:**
- Create: `src/keymap.js`
- Test: `test/keymap.test.js`

**Interfaces:**
- Produces, all from `src/keymap.js`:
  - `ACTIONS: string[12]`, `LABELS: { [action]: string }`, `DEFAULTS: { [action]: number[] }`, `UNBOUND: '?'`
  - `keyName(code: number) → string | null` (null: the key can't be bound)
  - `keymap.codes(action) → number[]` (a copy), `keymap.has(action, code) → boolean`
  - `keymap.name(action) → string` (the first key's name, or `?`), `keymap.names(action, sep = ' ') → string`
  - `keymap.pair(a, b) → string` (two actions' first keys for one hint: `←→`, or `A D`)
  - `keymap.bind(action, code) → { from: action | null } | null` (null: refused, nothing changed)
  - `keymap.reset(action?)`, `keymap.isDefault() → boolean`

- [ ] **Step 1: Write the failing test**

Create `test/keymap.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/keymap.test.js 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 13`, `ℹ pass 0`, `ℹ fail 13` (each fails with `Cannot find module` for `src/keymap.js`).

- [ ] **Step 3: Write the module**

Create `src/keymap.js`:

```js
// The keys for each action, kept in this browser like the settings (settings.js), under a key
// of their own so a saved map and saved settings never touch. A key is its key code
// (event.keyCode), the number Phaser's keyboard goes by. One key, one action: binding a key
// takes it from the action that had it. No Phaser and no window here, so it runs under node.
const KEY = 'sc_keys';
const VERSION = 1;
const MAX_KEYS = 4; // per action, in a saved map

// In the order the controls screen lists them.
export const ACTIONS = ['left', 'right', 'jump', 'fire', 'ship', 'rollback', 'refactor', 'talk', 'pause', 'mute', 'restart', 'title'];

export const LABELS = {
  left: 'move left',
  right: 'move right',
  jump: 'jump',
  fire: 'fire',
  ship: 'ship it',
  rollback: 'rollback',
  refactor: 'refactor',
  talk: 'talk (hold)',
  pause: 'pause',
  mute: 'mute',
  restart: 'restart level',
  title: 'quit to title',
};

// The keys the game shipped with. The powers take the number pad's digits too: they used to
// match the character typed, which the number pad also types.
export const DEFAULTS = {
  left: [37, 65], // ← A
  right: [39, 68], // → D
  jump: [38, 87, 90], // ↑ W Z
  fire: [32, 88, 74], // SPACE X J
  ship: [49, 97], // 1
  rollback: [50, 98], // 2
  refactor: [51, 99], // 3
  talk: [77], // M
  pause: [80], // P (ESC always pauses too)
  mute: [78], // N
  restart: [82], // R
  title: [84], // T
};

export const UNBOUND = '?';
const ARROW = /^[←→↑↓]$/;

// Firefox reports ; = - as 59, 61 and 173.
const NAMES = {
  16: 'SHIFT',
  32: 'SPACE',
  37: '←',
  38: '↑',
  39: '→',
  40: '↓',
  59: ';',
  61: '=',
  173: '-',
  186: ';',
  187: '=',
  188: ',',
  189: '-',
  190: '.',
  191: '/',
  192: '`',
  219: '[',
  220: '\\',
  221: ']',
  222: "'",
};

// A key's name, in characters the game's font can draw, or null for a key that can't be bound
// (ESC, ENTER and TAB belong to the menus; Ctrl, Alt and Meta to the browser).
export function keyName(code) {
  if (!Number.isInteger(code)) return null;
  if ((code >= 65 && code <= 90) || (code >= 48 && code <= 57)) return String.fromCharCode(code);
  if (code >= 96 && code <= 105) return `NUM${code - 96}`;
  return NAMES[code] ?? null;
}

const usable = (codes) => Array.isArray(codes) && codes.length <= MAX_KEYS && codes.every((c) => keyName(c) !== null);

function load() {
  let saved = null;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (stored?.v === VERSION && stored.keys && typeof stored.keys === 'object') saved = stored.keys;
  } catch {
    // unreadable or blocked: defaults
  }
  // Saved actions claim their keys first, so a saved key is never lost to another action's
  // default; an action with nothing usable saved takes its defaults, less any key claimed.
  const taken = new Set();
  const claim = (codes) => codes.filter((c) => !taken.has(c) && taken.add(c));
  const loaded = {};
  for (const a of ACTIONS) if (saved && usable(saved[a])) loaded[a] = claim(saved[a]);
  for (const a of ACTIONS) loaded[a] ??= claim(DEFAULTS[a]);
  return loaded;
}

const map = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, keys: map }));
  } catch {
    // still applies for this session
  }
}

// Take `code` from every action but `keep`. Returns the action that had it, if any.
function take(code, keep) {
  let from = null;
  for (const a of ACTIONS) {
    if (a === keep || !map[a].includes(code)) continue;
    map[a] = map[a].filter((c) => c !== code);
    from = a;
  }
  return from;
}

export const keymap = {
  codes: (action) => [...map[action]],
  has: (action, code) => map[action].includes(code),
  // The key a hint names: the action's first.
  name: (action) => (map[action].length ? keyName(map[action][0]) : UNBOUND),
  names: (action, sep = ' ') => (map[action].length ? map[action].map(keyName).join(sep) : UNBOUND),
  // Two actions' keys side by side in a hint. Two arrows touch (←→), as the hints always had
  // them; anything else needs the space (A D).
  pair(a, b) {
    const [x, y] = [keymap.name(a), keymap.name(b)];
    return ARROW.test(x) && ARROW.test(y) ? x + y : `${x} ${y}`;
  },
  // Make `code` the action's one key. Returns { from } (the action it was taken from, or
  // null), or null if the key can't be bound, with nothing changed.
  bind(action, code) {
    if (keyName(code) === null) return null;
    const from = take(code, action);
    map[action] = [code];
    save();
    return { from };
  },
  // One action back to its defaults (taking them from any action that holds one), or all.
  reset(action) {
    for (const a of action ? [action] : ACTIONS) {
      for (const code of DEFAULTS[a]) take(code, a);
      map[a] = [...DEFAULTS[a]];
    }
    save();
  },
  isDefault: () => ACTIONS.every((a) => map[a].length === DEFAULTS[a].length && map[a].every((c, i) => c === DEFAULTS[a][i])),
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/keymap.test.js 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 13`, `ℹ pass 13`, `ℹ fail 0`.

Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 96`, `ℹ pass 96`, `ℹ fail 0`.

- [ ] **Step 5: Check that the one-key-one-action tests can fail**

A guard that works produces no event, so prove these fire. In `src/keymap.js`, change `const from = take(code, action);` to `const from = null;` and run `node --test test/keymap.test.js 2>&1 | grep -E '^(✖|ℹ fail)'`.
Expected: `a bound key is taken from the action that had it…` and `no key is ever on two actions…` fail. Put the line back, run again, expected `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/keymap.js test/keymap.test.js
git commit -m "Controls: a key map, kept in this browser, with one key to one action

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Play reads the map

No on-screen text changes in this task: with nothing saved, the game must behave as it does on master.

**Files:**
- Modify: `src/util.js` (imports; three helpers after `freshKey`)
- Modify: `src/entities/Player.js` (imports; the `addKeys` call at 65; `tick`, `swallowEdges`, `tickTrapped`)
- Modify: `src/scenes/Landing.js` (imports; 82, 101, 136)
- Modify: `src/voice.js` (imports; the two key listeners at 29-40)
- Modify: `src/scenes/HUD.js` (imports; the key block at 123-129)
- Modify: `src/scenes/Ride.js:109`, `src/scenes/Arrival.js:75`, `src/scenes/Elevator.js:74` (mute), and their imports

**Interfaces:**
- Consumes: `keymap.codes`, `keymap.has` (Task 1).
- Produces, from `src/util.js`: `actionKeys(scene, action) → Phaser.Input.Keyboard.Key[]`, `held(keys) → boolean`, `onAction(scene, action, fn)`. Tasks 3 and 4 use `onAction`.

- [ ] **Step 1: The helpers**

In `src/util.js`, add to the imports at the top:

```js
import { keymap } from './keymap.js';
```

and add at the end of the file, after `freshKey`:

```js

// The Phaser keys for an action, as the controls screen has them set (keymap.js): made when a
// level starts, since the map only changes between runs. An unbound action has none.
export const actionKeys = (scene, action) => keymap.codes(action).map((code) => scene.input.keyboard.addKey(code));

// Whether any of an action's keys is down.
export const held = (keys) => keys.some((k) => k.isDown);

// An action's keydown in this scene, for the actions that are a press (pause, mute), not a hold.
export const onAction = (scene, action, fn) => scene.input.keyboard.on('keydown', freshKey((e) => keymap.has(action, e.keyCode) && fn(e)));
```

- [ ] **Step 2: The player**

In `src/entities/Player.js`, change the util import to:

```js
import { MAX_HP, actionKeys, held, worldText } from '../util.js';
```

Add after the `LOCK_GRACE_MS` constant:

```js

// How many of these keys went down since the last ask. Every key is asked: JustDown clears a
// key's flag, and one left set would count as a press a frame late.
const pressed = (keys) => keys.filter((k) => Phaser.Input.Keyboard.JustDown(k)).length;
```

Replace the `this.keys = scene.input.keyboard.addKeys({ … });` statement (five lines) with:

```js
    // Each action's keys, as the controls screen has them set.
    this.keys = { left: actionKeys(scene, 'left'), right: actionKeys(scene, 'right'), jump: actionKeys(scene, 'jump'), fire: actionKeys(scene, 'fire') };
```

In `tick`, replace the `let dir = …` line with:

```js
    let dir = (held(k.right) || touch.right ? 1 : 0) - (held(k.left) || touch.left ? 1 : 0);
```

Replace these four lines:

```js
    const JD = Phaser.Input.Keyboard.JustDown;
    const jumpHeld = k.jump.isDown || k.jump2.isDown || k.jump3.isDown || touch.jump;
    const touchJump = touch.takeJump(); // always consumed, so a press can't linger a frame
    if (JD(k.jump) || JD(k.jump2) || JD(k.jump3) || touchJump) this.jumpBufferedUntil = time + BUFFER_MS;
```

with:

```js
    const jumpHeld = held(k.jump) || touch.jump;
    const touchJump = touch.takeJump(); // always consumed, so a press can't linger a frame
    if (pressed(k.jump) || touchJump) this.jumpBufferedUntil = time + BUFFER_MS;
```

Replace the `const fireHeld = …` line with:

```js
    const fireHeld = held(k.fire) || touch.fire;
```

Replace the body of `swallowEdges` with:

```js
    pressed(this.keys.jump);
    touch.takeJump();
    this.jumpBufferedUntil = 0;
    this.fireLatched = true;
```

In `tickTrapped`, delete the `const JD = Phaser.Input.Keyboard.JustDown;` line and replace the `const presses = …` line with:

```js
    const presses = pressed(k.jump) + pressed(k.fire) + (touch.takeJump() ? 1 : 0) + (touchFire ? 1 : 0);
```

Run: `grep -n "JD\|jump2\|jump3\|fire2\|fire3\|k\.a\b\|k\.d\b" src/entities/Player.js`
Expected: no output.

- [ ] **Step 3: The canopy's steering and mute**

In `src/scenes/Landing.js`, change the util import to:

```js
import { ZOOM, actionKeys, floatText, held, onAction, worldText } from '../util.js';
```

Replace `this.keys = this.input.keyboard.addKeys({ left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D' });` with:

```js
    this.keys = { left: actionKeys(this, 'left'), right: actionKeys(this, 'right') };
```

Replace the `keydown-N` line with:

```js
    onAction(this, 'mute', () => toggleMute(this.sound)); // the HUD, which owns mute, sits this out
```

In `drift`, replace the `const dir = …` line with:

```js
    const dir = (held(k.right) || touch.right ? 1 : 0) - (held(k.left) || touch.left ? 1 : 0);
```

- [ ] **Step 4: The voice keys**

In `src/voice.js`, add under the `TOUCH` import:

```js
import { keymap } from './keymap.js';
```

Replace the `keydown` and `keyup` listeners in the constructor with:

```js
    window.addEventListener('keydown', (e) => {
      if (this.keysSuspended) return;
      if (keymap.has('talk', e.keyCode)) {
        if (!e.repeat) this.press();
        return;
      }
      if (e.repeat) return;
      for (const name of Object.keys(POWERS)) if (keymap.has(name, e.keyCode)) this.trigger(name, 'key');
    });
    window.addEventListener('keyup', (e) => {
      if (keymap.has('talk', e.keyCode)) this.release();
    });
```

and change the comment on `keysSuspended` to `// while typing (the Chute's terminal), the talk and power keys are just letters`.

- [ ] **Step 5: Pause, mute and restart**

In `src/scenes/HUD.js`, change the util import to:

```js
import { MAX_HP, MAX_TOKENS, freshKey, onAction, uiText } from '../util.js';
```

Replace this block:

```js
    // Pause / mute live here because the HUD keeps running while the play scene is paused.
    const kb = this.input.keyboard;
    const togglePause = () => this.setPaused(!this.playScene()?.sys.isPaused());
    kb.on('keydown-P', freshKey(togglePause));
    kb.on('keydown-ESC', freshKey(togglePause));
    kb.on('keydown-N', freshKey(() => toggleMute(this.sound)));
    kb.on('keydown-R', freshKey(() => this.restartLevel()));
```

with:

```js
    // Pause / mute live here because the HUD keeps running while the play scene is paused.
    // ESC always pauses, whatever the controls screen has set for pause (keymap.js).
    const togglePause = () => this.setPaused(!this.playScene()?.sys.isPaused());
    this.input.keyboard.on('keydown-ESC', freshKey(togglePause));
    onAction(this, 'pause', togglePause);
    onAction(this, 'mute', () => toggleMute(this.sound));
    onAction(this, 'restart', () => this.restartLevel());
```

- [ ] **Step 6: Mute between levels**

In each of `src/scenes/Ride.js`, `src/scenes/Arrival.js` and `src/scenes/Elevator.js`, replace the line

```js
    this.input.keyboard.on('keydown-N', freshKey(() => toggleMute(this.sound)));
```

(with its trailing comment, where it has one) with:

```js
    onAction(this, 'mute', () => toggleMute(this.sound)); // the HUD, which owns mute, sits this out
```

and in each file's util import swap `freshKey` for `onAction`:

```js
import { ZOOM, worldText, onAction } from '../util.js'; // Ride.js
import { ZOOM, onAction } from '../util.js'; // Arrival.js
import { ZOOM, floatText, worldText, onAction } from '../util.js'; // Elevator.js
```

(Do not copy the trailing `// File.js` notes into the files.)

Run: `grep -rn "keydown-N\|keydown-P\|keydown-R'\|freshKey" src/scenes/Landing.js src/scenes/Ride.js src/scenes/Arrival.js src/scenes/Elevator.js`
Expected: no output.

- [ ] **Step 7: Tests and build**

Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 96`, `ℹ pass 96`, `ℹ fail 0`.

Run: `npm run build 2>&1 | grep -iE "error|built in"`
Expected: one `built in` line, no error.

- [ ] **Step 8: Browser checks** (see "Browser checks: how")

With nothing saved (`localStorage.removeItem('sc_keys'); location.reload();`):

1. PLAY NOW, skip the intro. ← → and A D move; ↑, W and Z jump; SPACE, X and J fire; 1, 2 and 3 fire the powers, and so do the number pad's; P and ESC pause and resume; N mutes; R on the pause screen restarts.
2. `?landing`: the arrows and A D steer the canopy; N mutes.

With the custom map (the console snippet above):

3. PLAY NOW. In the console:

```js
Object.fromEntries(Object.entries(game.scene.getScene('Level1').player.keys).map(([a, ks]) => [a, ks.map((k) => k.keyCode)]));
```

Expected: `{ left: [37, 65], right: [39, 68], jump: [32], fire: [16] }`.

4. SPACE skips the intro, and the player does not jump as control returns. Then SPACE jumps, SHIFT fires (hold it: steady fire), ↑ W Z X J do nothing, Q E F fire the powers, 1 2 3 do nothing.
5. With SHIFT held, Q still fires `ship it` (it matched the character before, which SHIFT changes).

With jump unbound:

```js
localStorage.setItem('sc_keys', JSON.stringify({ v: 1, keys: { jump: [] } }));
location.reload();
```

6. PLAY NOW: the level starts with no console error, the player moves and fires, and no key jumps. Then put the defaults back.

- [ ] **Step 9: Commit**

```bash
git add src/util.js src/entities/Player.js src/voice.js src/scenes/HUD.js src/scenes/Landing.js src/scenes/Ride.js src/scenes/Arrival.js src/scenes/Elevator.js
git commit -m "Controls: play, the powers, pause and mute read their keys from the map

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Quit to title from the pause screen

**Files:**
- Modify: `src/scenes/HUD.js` (imports; the button constants at 19-21; `create`: the paused headline, the restart button, the keys, the pointer handlers; `setPaused`; `tap`; a new `toTitle`)

**Interfaces:**
- Consumes: `keymap.name`, `keymap.codes`, `UNBOUND` (Task 1); `onAction` (Task 2).
- Produces, inside `src/scenes/HUD.js`: `keyed(text, key, label, maxW) → text` and, in `create`, `const pauseKey`. Task 4 uses both.

- [ ] **Step 1: The buttons' places and the keyed label**

In `src/scenes/HUD.js`, add under the util import:

```js
import { UNBOUND, keymap } from '../keymap.js';
```

Replace:

```js
// Paused, on every device: restart the level (under the sound toggle on touch).
const RESTART_BTN = { x: 390, y: TOUCH ? 300 : 246, w: 180, h: 42 };
```

with:

```js
// Paused, on every device: restart the level and quit to the title, side by side (under the
// sound toggle on touch). Wide enough for the longest key name in front of the label.
const BTN_Y = TOUCH ? 300 : 246;
const RESTART_BTN = { x: 252, y: BTN_Y, w: 222, h: 42 };
const TITLE_BTN = { x: 486, y: BTN_Y, w: 222, h: 42 };
const BTN_PAD = 6; // half the gap between the two, so one's margin never reaches into the other
```

Add after the `frame` function:

```js

// A control's label with its key in front, or the label alone where the two don't fit or the
// action has no key.
function keyed(text, key, label, maxW) {
  text.setText(`${key} ${label}`);
  if (key === UNBOUND || text.width > maxW) text.setText(label);
  return text;
}
```

- [ ] **Step 2: The pause screen**

At the top of `create()`, before `this.g = this.add.graphics();`, add:

```js
    // ESC always pauses, so the pause screen can name a key even with pause unbound.
    const pauseKey = keymap.codes('pause').length ? keymap.name('pause') : 'ESC';
```

In the `this.pausedText = uiText(…)` statement, replace the string argument

```js
TOUCH ? 'PAUSED\n\ntap to resume' : 'PAUSED\n\nP: resume   N: mute   R: restart level'
```

with:

```js
TOUCH ? 'PAUSED\n\ntap to resume' : `PAUSED\n\n${pauseKey}: resume   ${keymap.name('mute')}: mute`
```

Replace the three lines that make `this.restartBox` and `this.restartText` (from `const { x: rx, …} = RESTART_BTN;`) with:

```js
    // The pause buttons, each naming its key on a keyboard.
    this.pauseButtons = [
      [RESTART_BTN, 'restart', 'restart level'],
      [TITLE_BTN, 'title', 'quit to title'],
    ].flatMap(([r, action, label]) => {
      const box = this.add.rectangle(r.x, r.y, r.w, r.h, 0x0d0d0d).setOrigin(0).setStrokeStyle(3, 0xd97757).setDepth(4).setVisible(false);
      const text = uiText(this, r.x + r.w / 2, r.y + r.h / 2, label, { size: 16, color: '#f5f5f5', ox: 0.5, oy: 0.5 }).setDepth(5).setVisible(false);
      if (!TOUCH) keyed(text, keymap.name(action), label, r.w - 24);
      return [box, text];
    });
```

Under `onAction(this, 'restart', () => this.restartLevel());` add:

```js
    onAction(this, 'title', () => this.toTitle());
```

Replace `this.talkPointer = null;` with:

```js
    this.talkPointer = null;
    this.armed = null; // the pause button a press began on
```

Replace:

```js
    // The restart button acts on release, and only for a press that began on it.
    this.input.on('pointerup', (p) => {
      if (this.restartArmed && hit(p, RESTART_BTN, 12)) this.restartLevel();
      this.restartArmed = false;
    });
```

with:

```js
    // A pause button acts on release, and only for a press that began on it.
    this.input.on('pointerup', (p) => {
      const btn = this.armed;
      this.armed = null;
      if (!btn || !hit(p, btn, BTN_PAD)) return;
      if (btn === TITLE_BTN) this.toTitle();
      else this.restartLevel();
    });
```

In `setPaused`, replace the two lines `this.restartBox.setVisible(on);` and `this.restartText.setVisible(on);` with:

```js
    for (const o of this.pauseButtons) o.setVisible(on);
```

In `tap`, replace:

```js
      this.restartArmed = hit(p, RESTART_BTN, 12);
      if (this.restartArmed || !TOUCH) return;
```

with:

```js
      this.armed = [RESTART_BTN, TITLE_BTN].find((b) => hit(p, b, BTN_PAD)) ?? null;
      if (this.armed || !TOUCH) return;
```

Add after `restartLevel()`:

```js

  // From the pause screen: leave the run for the title screen, which resets the run clock
  // (Title.create). Only while paused, as restartLevel.
  toTitle() {
    const play = this.playScene();
    if (!play?.sys.isPaused()) return;
    this.scene.stop(play.scene.key);
    this.scene.start('Title');
  }
```

Run: `grep -n "restartArmed\|restartBox\|restartText" src/scenes/HUD.js`
Expected: no output.

- [ ] **Step 3: Tests and build**

Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 96`, `ℹ pass 96`, `ℹ fail 0`.

Run: `npm run build 2>&1 | grep -iE "error|built in"`
Expected: one `built in` line, no error.

- [ ] **Step 4: Browser checks**

With nothing saved, `?park`, PLAY NOW, skip the intro:

1. Press T while playing: nothing happens. During the intro (reload to see it): nothing happens.
2. Press P. The pause screen reads `PAUSED`, `P: resume   N: mute`, and two buttons side by side, `R restart level` and `T quit to title`, neither over the help text below.
3. Press T. The title screen shows. In the console:

```js
[game.scene.getScenes(true).map((s) => s.scene.key), game.sound.sounds.filter((s) => s.isPlaying).length, run.state];
```

Expected: `[['Title'], 0, 'idle']`.

4. PLAY NOW again: the level starts from its intro, and `run.elapsed()` in the console is a few seconds, not the earlier run's time.
5. Pause, click `quit to title`: the title shows. Pause again, press the mouse on `quit to title`, drag off it and release: still paused. Click `restart level`: the level restarts.
6. R on the pause screen in Level 1 (no `?park`): a new run, as before this change.
7. `?touch&park`: pause with the button at the top. Sound sits above the two buttons, the help text clears them, a tap on `quit to title` goes to the title, and a tap anywhere else resumes.
8. With `localStorage.setItem('sc_keys', JSON.stringify({ v: 1, keys: { pause: [], title: [], restart: [32] } })); location.reload();`: ESC pauses, the headline reads `ESC: resume   N: mute`, the buttons read `SPACE restart level` and `quit to title`, and both still take a click. Then put the defaults back.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/HUD.js
git commit -m "Pause: quit to the title, by a key or a button beside restart level

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Every hint follows the map

**Files:**
- Modify: `src/voice.js` (`POWERS`, the `TALK` constant, every `this.status =`, a `status` accessor)
- Modify: `src/scenes/Title.js` (imports; the control lines, the command table's key column, the mic line)
- Modify: `src/scenes/HUD.js` (`create`: the power slots, the strip, the pause help; `update`: the two status lines)
- Modify: `src/scenes/Level1.js` (imports; `this.beats`), `src/scenes/Park.js:247`, `src/scenes/Tower.js:152`, `src/scenes/PlayScene.js:220,432`, `src/entities/Player.js:47`, `src/scenes/Landing.js:84`, each with a `keymap` import

**Interfaces:**
- Consumes: `keymap.name`, `keymap.names`, `keymap.pair` (Task 1); `keyed`, `pauseKey` (Task 3).
- Produces: `POWERS[name]` no longer has a `key` field. Nothing outside this task reads it once the task is done.

- [ ] **Step 1: The microphone's status and the powers' keys**

In `src/voice.js`, delete `key: '1', `, `key: '2', ` and `key: '3', ` from the three `POWERS` entries, and replace

```js
const TALK = TOUCH ? 'talk' : 'M'; // the push-to-talk control: the M key, or the HUD's talk slot
```

with:

```js
// What the status line calls the push-to-talk control (its key, or the HUD's talk slot) and
// the powers' keys. A status that names a key is a function, read when the line is drawn: the
// keys can be rebound between runs (keymap.js).
const talkKey = () => (TOUCH ? 'talk' : keymap.name('talk'));
const powerKeys = () => Object.keys(POWERS).map((name) => keymap.name(name)).join('/');
const IDLE = () => `hold ${talkKey()} to talk`;
const NO_SPEECH = () => `no speech API here: use keys ${powerKeys()}`;
```

Change the comment above the class to:

```js
// Push-to-talk: hold the talk key (M unless rebound), say a command, release. The command fires
// on release, so ordinary talking (demo narration!) never triggers powers. The powers' own keys
// (1, 2 and 3 unless rebound) always work too, because Chrome's speech recognition needs network
// and demo rooms are loud.
```

Add as the first members of the class body, after the constructor:

```js

  // A status can be a function, so a line that names a key names the one bound now.
  get status() {
    return typeof this.statusNow === 'function' ? this.statusNow() : this.statusNow;
  }

  set status(s) {
    this.statusNow = s;
  }
```

Then change each status that names a key:

| Now | Becomes |
|---|---|
| ``this.status = `hold ${TALK} to talk`;`` (five places: the constructor, `prime`, `onend`, `release`, `fireFromTranscript`) | `this.status = IDLE;` |
| `this.status = 'no speech API here: use keys 1/2/3';` (two places: `prime`, `press`) | `this.status = NO_SPEECH;` |
| ``this.status = `listening... release ${TALK}`;`` | ``this.status = `listening... release ${talkKey()}`;`` |
| the `mic error` line's `` `mic error: ${e.error}, keys 1/2/3 work` `` | `` `mic error: ${e.error}, keys ${powerKeys()} work` `` |

In `onend`, the comparison `this.status === 'processing...'` stays as it is (the getter returns the string).

Run: `grep -n "TALK\|1/2/3\|key: '" src/voice.js`
Expected: no output.

- [ ] **Step 2: The title screen**

In `src/scenes/Title.js`, add an import:

```js
import { keymap } from '../keymap.js';
```

Replace the first and third entries of `lines` and add two constants above it, so the block reads:

```js
    const key = (action) => keymap.name(action);
    const powerKeys = Object.keys(POWERS).map(key);
    const lines = [
      TOUCH ? '← → move    ↑ jump    >_ fire (hold it)' : `${keymap.pair('left', 'right')} move    ${keymap.names('jump', ' / ')} jump    ${key('fire')} fire prompts`,
      '',
      TOUCH ? `powers: tap the terminal bar${voice.supported ? ', or hold talk' : ''}` : `voice: HOLD ${key('talk')}, say a command, let go`,
```

(the rest of `lines` is unchanged). Replace

```js
    if (!TOUCH) uiText(this, left + 230, 296, '1\n2\n3', { size: 16, color: '#8b8b8b' });
```

with (right-aligned where the digits' right edge was, so a long name grows to the left, away from the next column):

```js
    if (!TOUCH) uiText(this, left + 242, 296, powerKeys.join('\n'), { size: 16, color: '#8b8b8b', ox: 1 }).setRightAlign();
```

and in `showMic`, replace `'no speech here: keys 1/2/3'` with `` `no speech here: keys ${powerKeys.join('/')}` ``.

- [ ] **Step 3: The HUD's slots, strip and pause help**

In `src/scenes/HUD.js` `create()`, add above the `// Bottom terminal strip.` comment:

```js
    // The status lines that name keys, built once: the map can't change during a run.
    const key = (action) => keymap.name(action);
    const powerKeys = Object.keys(POWERS).map(key).join(' ');
    this.lines = {
      powers: voice.supported ? `powers: ${powerKeys}, or hold ${key('talk')} and say one` : `powers: press ${powerKeys}`,
      full: `CONTEXT FULL → hold ${key('talk')}: "refactor" (or ${key('refactor')})`,
    };
```

In the `this.powers = Object.entries(POWERS).map(…)` callback, replace:

```js
      const text = TOUCH ? p.label : `${p.key} ${p.label}`;
      return { name, p, x, w: slotW, label: uiText(this, x + slotW / 2, 495, text, { size: 16, color: '#0d0d0d', ox: 0.5, oy: 0.5 }).setDepth(1) };
```

with:

```js
      const label = uiText(this, x + slotW / 2, 495, p.label, { size: 16, color: '#0d0d0d', ox: 0.5, oy: 0.5 }).setDepth(1);
      if (!TOUCH) keyed(label, key(name), p.label, slotW - 12);
      return { name, p, x, w: slotW, label };
```

Replace:

```js
      uiText(this, 942, 522, '←→ move  ↑ jump  SPACE fire  P pause', { size: 16, color: '#8b8b8b', ox: 1, oy: 0.5 });
```

with:

```js
      // The controls hint shares its row with the status line on the left: as much of it as
      // fits beside the widest line this map can put there (long key names are wide).
      const hints = [
        `${keymap.pair('left', 'right')} move  ${key('jump')} jump  ${key('fire')} fire  ${pauseKey} pause`,
        `${key('jump')} jump  ${key('fire')} fire  ${pauseKey} pause`,
        `${pauseKey} pause`,
      ];
      const hint = uiText(this, 942, 522, '', { size: 16, color: '#8b8b8b', ox: 1, oy: 0.5 });
      const room = 942 - 18 - 24 - Math.max(...Object.values(this.lines).map((line) => hint.setText(`$ ${line}`).width));
      hint.setText(hints.find((h) => hint.setText(h).width <= room) ?? '');
```

Replace the two statements that build `powerLines` and `help` with:

```js
    const powerLines = Object.entries(POWERS).map(([name, p]) => `${TOUCH ? '' : `${key(name)}  `}${p.label}: ${p.does}`);
    const help = TOUCH
      ? [`>_ fire   ↑ jump   powers: tap the bar${voice.supported ? ', or hold talk and say one' : ''}`, ...powerLines]
      : [`${keymap.pair('left', 'right')} move   ${keymap.names('jump')} jump   ${key('fire')} fire`, ...powerLines, ...(voice.supported ? [`or hold ${key('talk')}, say the power, let go`] : [])];
```

In `update`, in the `const cta = …` statement replace the last alternative `'CONTEXT FULL → hold M: "refactor" (or 3)'` with `this.lines.full`, and in the `const heard = …` statement replace

```js
(cta ?? (voice.supported ? 'powers: 1 2 3, or hold M and say one' : 'powers: press 1 2 3'))
```

with:

```js
(cta ?? this.lines.powers)
```

- [ ] **Step 4: The level tips**

In `src/scenes/Level1.js`, add `import { keymap } from '../keymap.js';` and replace the `this.beats = [ … ];` statement with:

```js
    const key = (action) => keymap.name(action);
    this.beats = [
      [70, `${key('fire')} fires prompts at bad prompts`, '>_ fires prompts at bad prompts', null, () => this.shots > 0],
      [640, `Swarmed? HOLD ${key('talk')}, say "refactor" (or press ${key('refactor')})`, 'Swarmed? Tap "refactor" below', 'refactor', () => this.lastPower === 'refactor' || this.player.x > SWARM_PAST_X],
      [1372, 'Too far to jump. Hop on the cable car roof', null, null],
      [1760, `Save a big one for the park: HOLD ${key('talk')}, "ship it" (or ${key('ship')})`, 'Save a big one for the park: tap "ship it"', 'ship'],
    ];
```

In `src/scenes/Park.js`, add the same import and replace `'Demo day! Clear the stage. "ship it" helps (1)'` with:

```js
`Demo day! Clear the stage. "ship it" helps (${keymap.name('ship')})`
```

In `src/scenes/Tower.js`, add the same import and replace `'Locked in? "refactor" voids the contract (or 3)'` with:

```js
`Locked in? "refactor" voids the contract (or ${keymap.name('refactor')})`
```

In `src/scenes/PlayScene.js`, add the same import, replace `'Took a hit? HOLD M, say "rollback" (or 2)'` with:

```js
`Took a hit? HOLD ${keymap.name('talk')}, say "rollback" (or ${keymap.name('rollback')})`
```

and replace ``this.toast(`MAX: hold ${TOUCH ? '>_' : 'SPACE'} to stream tokens`);`` with:

```js
    this.toast(`MAX: hold ${TOUCH ? '>_' : keymap.name('fire')} to stream tokens`);
```

- [ ] **Step 5: The founder's chip and the canopy's hint**

In `src/entities/Player.js`, add `import { keymap } from '../keymap.js';` and in the `this.trapChip = worldText(…)` statement replace `TOUCH ? 'MASH!' : 'MASH ↑'` with:

```js
TOUCH ? 'MASH!' : `MASH ${keymap.name('jump')}`
```

In `src/scenes/Landing.js`, add `import { keymap } from '../keymap.js';` and in the `const hint = worldText(…)` statement replace `'← → steer · land on the Waymo'` with:

```js
`${keymap.name('left')} ${keymap.name('right')} steer · land on the Waymo`
```

- [ ] **Step 6: No key name is left as text**

Run (the second `grep` drops comment lines, two of which say `1/2/3`):

```bash
grep -rnE "HOLD M|hold M|\(or [123]\)|press [123]|1 2 3|1/2/3|SPACE fire|SPACE to stream|SPACE fires|MASH ↑|p\.key" src | grep -vE ":[0-9]+: *//"
```

Expected: no output.

- [ ] **Step 7: Tests and build**

Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 96`, `ℹ pass 96`, `ℹ fail 0`.

Run: `npm run build 2>&1 | grep -iE "error|built in"`
Expected: one `built in` line, no error.

- [ ] **Step 8: Browser checks**

With nothing saved, compare against `docs/screenshots/01-title.png` and `05-street-combat.png`:

1. Title: `←→ move    ↑ / W / Z jump    SPACE fire prompts`, `voice: HOLD M, say a command, let go`, and the command table's `1 2 3` column where it was.
2. Level 1: the power slots read `1 ship it`, `2 rollback`, `3 refactor`; the strip reads `$ powers: 1 2 3, or hold M and say one` on the left and `←→ move  ↑ jump  SPACE fire  P pause` on the right; the first tip reads `SPACE fires prompts at bad prompts`; the mic line reads `hold M to talk`.
3. Pause: the help reads `←→ move   ↑ W Z jump   SPACE fire`, then `1  ship it: big forward blast` and the other two, then `or hold M, say the power, let go`.

With the custom map:

4. Title: `←→ move    SPACE jump    SHIFT fire prompts`, `voice: HOLD K, …`, and the table's column reads Q, E, F, right-aligned, clear of the column beside it.
5. Level 1: slots `Q ship it`, `E rollback`, `F refactor`; the strip's left reads `$ powers: Q E F, or hold K and say one`; its right reads the full hint or a shortened one, and never overlaps the left; the tips name SHIFT, K and F; the mic line reads `hold K to talk`. Hold K: `listening... release K`.
6. Take a hit: `Took a hit? HOLD K, say "rollback" (or E)`. Grab MAX: `MAX: hold SHIFT to stream tokens`. `?park`: a founder's chip reads `MASH SPACE`. `?landing`: `← → steer · land on the Waymo`.

With the widest names:

```js
localStorage.setItem('sc_keys', JSON.stringify({ v: 1, keys: { left: [16], right: [32], jump: [97], fire: [98], ship: [99], rollback: [100], refactor: [101], talk: [102], pause: [103] } }));
location.reload();
```

7. Title: no line runs into another or off the window (the first line may reach the key art; say so in the report if it does). Level 1: each slot shows its key and name inside its frame; the strip's right hint has shortened (to `NUM7 pause` at the least) and does not touch the left line; a tip's frame stays inside the screen. `?boss`, let the context fill: the left line `CONTEXT FULL → hold NUM6: "refactor" (or NUM5)` does not touch the right hint. Pause: both buttons hold their text.
8. With jump unbound (`keys: { jump: [] }`): the title reads `? jump`, the strip `? jump`, the chip `MASH ?`. Then put the defaults back.

- [ ] **Step 9: Commit**

```bash
git add src/voice.js src/scenes/Title.js src/scenes/HUD.js src/scenes/Level1.js src/scenes/Park.js src/scenes/Tower.js src/scenes/PlayScene.js src/entities/Player.js src/scenes/Landing.js
git commit -m "Controls: every hint names the key that is bound

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The controls screen

**Files:**
- Create: `src/scenes/Controls.js`
- Modify: `src/scenes/Settings.js` (imports; `create`: the data, the rows, the menu's start)
- Modify: `src/main.js` (the import and the scene list)

**Interfaces:**
- Consumes: `ACTIONS`, `LABELS`, `keyName`, `keymap.codes`, `keymap.names`, `keymap.bind`, `keymap.reset`, `keymap.isDefault` (Task 1); `menu`, `textRow` (`src/menu.js`: an item is `{ bounds(), focus(on), activate?(via), adjust?(dir) }`, and `menu()` returns `{ index }`).
- Produces: the scene key `'Controls'`. It returns with `this.scene.start('Settings', { from: 'controls' })`.

- [ ] **Step 1: The screen**

Create `src/scenes/Controls.js`:

```js
import Phaser from 'phaser';
import { uiText } from '../util.js';
import { applyScreenFX } from '../fx.js';
import { ACTIONS, LABELS, keyName, keymap } from '../keymap.js';
import { terminalWindow } from '../terminal.js';
import { menu, textRow } from '../menu.js';

const X_LABEL = 70;
const X_VALUE = 380;
const ROW_Y = 78; // the first action's line, from the window's top
const ROW_H = 26;
const GREY = 0x8b8b8b;

// A refused key's name for the status line, in characters the font has ("Enter" → ENTER).
const spoken = (key) => (/^[ -~]+$/.test(key) ? key.toUpperCase() : 'that key');

// The controls screen, from Settings, on keyboards only. ENTER or a click on an action, then a
// key, makes that key the action's one key; a key another action had is taken from it. The map
// applies from the next level started and is remembered in this browser (keymap.js).
export default class Controls extends Phaser.Scene {
  constructor() {
    super('Controls');
  }

  create() {
    applyScreenFX(this.cameras.main);
    const win = terminalWindow(this, 'vim ~/.config/survive-coders/keys');
    uiText(this, X_LABEL, win.y + 48, '" controls: saved in this browser', { size: 16, color: '#8b8b8b' });
    this.capturing = null; // the action waiting for a key
    this.rows = ACTIONS.map((action, i) => this.row(win.y + ROW_Y + i * ROW_H, action));
    const below = win.y + ROW_Y + ACTIONS.length * ROW_H + 4;
    // What the last key did, beside RESET ALL.
    this.note = uiText(this, X_VALUE, below, '', { size: 16, color: '#e3b341' });
    const back = () => this.scene.start('Settings', { from: 'controls' });
    const items = [
      ...this.rows,
      textRow(this, X_LABEL, below, 'RESET ALL', { size: 16, onPick: () => this.resetAll() }),
      textRow(this, X_LABEL, below + ROW_H, 'BACK', { size: 16, onPick: back }),
    ];
    uiText(this, X_LABEL, win.y + win.h - 28, '↑↓ choose   ENTER rebind   BACKSPACE default   ESC back', { size: 16, color: '#8b8b8b' });

    // In the capture phase, so while an action waits for a key this listener sees the key
    // before any other on the window and stops it there: the menu (ESC would leave, SPACE
    // would pick), Phaser, and the voice keys (M would open the microphone) never get it.
    const onKey = (e) => this.onKey(e);
    window.addEventListener('keydown', onKey, true);
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey, true));
    this.menu = menu(this, items, { onBack: back });
  }

  // An action's line: `> label` on the left, its keys on the right (`press a key_` while it
  // waits for one, `unbound` in red when it has none).
  row(y, action) {
    const name = uiText(this, X_LABEL, y, '', { size: 16 });
    const val = uiText(this, X_VALUE, y, '', { size: 16 });
    let focused = false;
    const row = {
      action,
      bounds: () => new Phaser.Geom.Rectangle(X_LABEL - 10, y - 5, 820, ROW_H),
      focus: (on) => {
        focused = on;
        row.redraw();
      },
      redraw: () => {
        const waiting = this.capturing === action;
        const bound = keymap.codes(action).length > 0;
        name.setText(`${focused ? '>' : ' '} ${LABELS[action]}`).setTint(focused ? 0x3fb950 : GREY);
        val.setText(waiting ? 'press a key_' : bound ? keymap.names(action, '  ') : 'unbound');
        val.setTint(waiting ? 0xe3b341 : !bound ? 0xe5534b : focused ? 0xf5f5f5 : GREY);
      },
      activate: () => this.capture(action),
    };
    row.redraw();
    return row;
  }

  // Start waiting for `action`'s key (or stop waiting, with null).
  capture(action) {
    this.capturing = action;
    this.say('');
  }

  // Every row is redrawn: a bind or a reset can change another action's keys too.
  say(text) {
    this.note.setText(text);
    for (const row of this.rows) row.redraw();
  }

  resetAll() {
    keymap.reset();
    this.capturing = null;
    this.say('defaults restored');
  }

  onKey(e) {
    // Ctrl, Alt and Meta combinations stay the browser's (reload, close), and can't be bound.
    if (!this.sys.isActive() || e.metaKey || e.ctrlKey || e.altKey) return;
    const action = this.capturing;
    if (!action) {
      // BACKSPACE (or DELETE) on an action puts its defaults back.
      const row = this.rows[this.menu.index];
      if (row && !e.repeat && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        keymap.reset(row.action);
        this.say(`${LABELS[row.action]}: defaults`);
      }
      return;
    }
    e.stopImmediatePropagation();
    if (!/^F\d+$/.test(e.key)) e.preventDefault(); // the F-keys stay the browser's too
    if (e.repeat) return; // the ENTER that began the capture, still held
    if (e.key === 'Escape') return this.capture(null);
    const bound = keymap.bind(action, e.keyCode);
    if (!bound) return this.say(`${spoken(e.key)} can't be bound`); // still waiting
    this.capturing = null;
    this.say(bound.from ? `${keyName(e.keyCode)}: taken from ${LABELS[bound.from]}` : '');
  }
}
```

- [ ] **Step 2: Register the scene**

In `src/main.js`, add under the `Settings` import:

```js
import Controls from './scenes/Controls.js';
```

and in the game config's `scene` list put `Controls` after `Settings`:

```js
  scene: [Boot, Songs, Title, Settings, Controls, Leaderboard, Level1, Park, Tower, Elevator, Chute, Landing, Ride, Arrival, BossHQ, HUD, Cine, Terminal, End],
```

- [ ] **Step 3: The row in Settings**

In `src/scenes/Settings.js`, add an import:

```js
import { keymap } from '../keymap.js';
```

Change `create() {` to `create(data) {` and add as its first lines:

```js
    // Phaser keeps a scene's last data when it's started with none, so a later visit from the
    // title would open on the controls row again: take it and clear it.
    const from = data?.from;
    this.sys.settings.data = {};
```

Add as the last entry of `rows`, after the `run timer` entry (its fourth element stops ←→ from opening the screen):

```js
      !TOUCH && ['controls', () => (keymap.isDefault() ? 'default keys' : 'custom keys'), () => this.scene.start('Controls'), () => {}],
```

Replace `menu(this, items, { onBack: back });` with:

```js
    // Back from the controls screen: on the row that opened it.
    menu(this, items, { onBack: back, start: from === 'controls' ? rows.findIndex((r) => r[0] === 'controls') : 0 });
```

Change the comment above the class to:

```js
// The settings screen, from the title. Everything applies at once and is remembered in this
// browser (settings.js); the controls row opens the key map's own screen (Controls.js).
```

- [ ] **Step 4: Tests and build**

Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 96`, `ℹ pass 96`, `ℹ fail 0`.

Run: `npm run build 2>&1 | grep -iE "error|built in"`
Expected: one `built in` line, no error.

- [ ] **Step 5: Browser checks**

With nothing saved:

1. Title, SETTINGS: a `controls` row reads `default keys`, under `run timer`, with BACK and the hint clear below it. ←→ on it does nothing. ENTER opens the controls screen: twelve rows, `move left  ←  A` to `quit to title  T`, then RESET ALL and BACK, all inside the window, the hint clear of BACK.
2. On `jump`, press ENTER: `press a key_`. Hold ENTER a moment longer: nothing more happens. Press ENTER again: the note reads `ENTER can't be bound` and the row still waits. Press TAB: `TAB can't be bound`, focus stays in the game. Press ESC: the row shows `↑  W  Z` again and the screen is still the controls screen (`game.scene.isActive('Controls')` is `true`).
3. ENTER on `jump`, then SPACE: the row reads `SPACE`, the note `SPACE: taken from fire`, and `fire` reads `X  J`. The row was not picked again by the SPACE (it does not read `press a key_`).
4. In Chrome, ENTER on `talk (hold)`, then M, its own key: the row reads `M`, the note is empty, `voice.listening` in the console is `false`, and no microphone prompt appeared. (M is still talk's key as the event travels, so a key that leaked past the capture would open the microphone here.)
5. ENTER on `mute`, then M: the note reads `M: taken from talk (hold)` and `talk (hold)` reads `unbound` in red.
6. BACKSPACE on `fire`: it reads `SPACE  X  J`, the note `fire: defaults`, and `jump`, which held SPACE, reads `unbound`. BACKSPACE on `talk (hold)`: it reads `M`, and `mute` reads `unbound`.
7. Click a row with the mouse, then press a key: it binds. Click RESET ALL: the note reads `defaults restored` and every row is back.
8. Bind the custom map (jump SPACE, fire SHIFT, ship Q, rollback E, refactor F, talk K). ESC: Settings opens on the `controls` row, which reads `custom keys`. ESC, then SETTINGS again from the title: it opens on the first row. Reload the page: the map is still there. PLAY NOW: SPACE jumps, SHIFT fires, the slots read Q, E and F.
9. `?touch`: SETTINGS has no `controls` row.
10. Leave jump unbound, PLAY NOW: no error, the hints read `?`. Then RESET ALL.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/Controls.js src/scenes/Settings.js src/main.js
git commit -m "Settings: a controls screen that remaps the keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: R and T after a post

**Files:**
- Modify: `src/scoreForm.js` (the note at the top; `scoreForm`'s parameters; the form's `keydown` listener; `done`)
- Modify: `src/scenes/End.js` (`create`: the retry keys; `offerSubmit`)

**Interfaces:**
- Produces: `scoreForm({ profile, touch, submit, view, close, share, again, title })`. `again()` and `title()` are called from a keydown inside the form, only once the post is in.

The other open branch, `claude/hold-for-review`, also edits `done()` in `src/scoreForm.js`. If it has landed on master before this task runs, rebase first and make these edits on top of its version; the `posted = true;` line belongs wherever the form reaches its posted state, held or not.

- [ ] **Step 1: The form hands R and T on**

In `src/scoreForm.js`, add to the note at the top of the file, after the paragraph that ends `(W A D Z X J, space).`:

```js
//
// Once the run is posted the form hands two keys on itself: R (`again`) and T (`title`). The
// inputs are disabled by then, so nothing is being typed.
```

Change the signature to:

```js
export function scoreForm({ profile, touch, submit, view, close, share, again, title }) {
```

Replace:

```js
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
```

with:

```js
  let posted = false;
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    if (!posted || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'r' || e.key === 'R') again();
    else if (e.key === 't' || e.key === 'T') title();
  });
```

In `done`, replace:

```js
    hint.textContent = touch ? '' : 'ESC close';
```

with:

```js
    posted = true;
    hint.textContent = touch ? '' : 'R new run · T title';
```

- [ ] **Step 2: The end screen passes them, and R plays again**

In `src/scenes/End.js`, replace:

```js
    this.input.keyboard.once('keydown-ENTER', playAgain);
    this.input.keyboard.once('keydown-T', toTitle);
```

with:

```js
    // The posted form hands R and T back here (scoreForm.js), so R plays again wherever
    // ENTER does.
    this.playAgain = playAgain;
    this.toTitle = toTitle;
    this.input.keyboard.once('keydown-ENTER', playAgain);
    this.input.keyboard.once('keydown-R', playAgain);
    this.input.keyboard.once('keydown-T', toTitle);
```

In `offerSubmit`, add to the object passed to `scoreForm`, after the `share:` entry:

```js
      again: () => this.playAgain(),
      title: () => this.toTitle(),
```

- [ ] **Step 3: Tests and build**

Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 96`, `ℹ pass 96`, `ℹ fail 0`.

Run: `npm run build 2>&1 | grep -iE "error|built in"`
Expected: one `built in` line, no error.

- [ ] **Step 4: Browser checks**

The form shows only after a ranked win, and the plain dev server has no API to post to. On the dev build (`npm run dev`), from the title screen, this shows the win screen with the form and answers the post locally. Use a private window, so the name typed is not saved to a real profile; a reload undoes it. (Tried on master, 2026-10-01: the form shows with focus in the name field, and a post reaches the posted state with `your bests stand: time #1 · ★ #1 of 1`, saving no best.)

```js
const real = run.summary.bind(run);
run.summary = (stars) => ({ ...real(stars), timeMs: 200000, eligible: true, reasons: [] });
const realFetch = window.fetch;
window.fetch = (url, init) =>
  String(url).includes('/api/scores') && init?.method === 'POST'
    ? Promise.resolve(new Response(JSON.stringify({ you: { rank: 1, total: 1, best: false, fastest: { rank: 1, best: false } }, top: [], fastest: [], total: 1, asOf: new Date().toISOString() }), { status: 201, headers: { 'content-type': 'application/json' } }))
    : realFetch(url, init);
game.scene.getScene('Title').scene.start('End', { win: true });
```

Run it again from the title for each check below that says "win and post again".

1. Before the post, type `Art T Rr` into the name field: all eight characters arrive, the screen does not change, no run starts.
2. Post. The hint reads `R new run · T title`, the buttons are `copy link`, `view the board`, `close`, and focus is on `view the board`.
3. Press T: the title screen shows.
4. Win and post again, press R: a new run starts in Level 1, `run.elapsed()` is small, stars are 0.
5. Win and post again, press ENTER: the board opens (the focused button), as before this change. ESC there goes to the title.
6. After a death (no form): ENTER retries, R retries, T goes to the title, S shares.
7. `?touch`, after a death: a tap retries and the *title* button works, as before.

- [ ] **Step 5: Commit**

```bash
git add src/scoreForm.js src/scenes/End.js
git commit -m "End screen: R and T work straight from the posted form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The README, the screenshots and the whole pass

**Files:**
- Modify: `README.md` (the stack block at 28; the walkthrough's settings paragraph at 61; Features at 262 and 264; the Controls table; the Tests section; the verification table)
- Modify: `docs/screenshots/01a-settings.png` (retaken); Create: `docs/screenshots/01c-controls.png`

- [ ] **Step 1: The counts**

In `README.md`, change `83 unit tests` to `96 unit tests` in the stack block (line 28) and in the Tests section's first line, and in the console block under it change `ℹ tests 83` and `ℹ pass 83` to `96`.

Add to the Tests section's list, after the bullet about the run clock and the settings store:

```markdown
- the key map (`src/keymap.js`): the defaults checked against Phaser's own key-code table, no
  key on two actions through two thousand random binds and resets, saved maps that are partly
  bad or hold one key twice, and storage that throws
```

- [ ] **Step 2: The walkthrough and the features**

Replace the walkthrough paragraph's first sentence (`Settings holds … all saved in the browser.`) with:

```markdown
Settings holds music and sound-effect volume, sound on or off, the CRT filter, screen shake,
flashes, fullscreen, a run timer, and, on a keyboard, a controls screen that remaps the keys,
all saved in the browser.
```

and add under the settings screenshot:

```markdown
![The controls screen](docs/screenshots/01c-controls.png)
```

In Features, change the pause bullet's opening from `Pause (with a restart for the level you are on), mute,` to `Pause (with a restart for the level you are on and a way back to the title), mute,`, and in the settings bullet change `and a run timer in the HUD; saved in the browser` to:

```markdown
a run timer in the HUD, and, on a keyboard, a controls screen that remaps twelve actions (move, jump, fire, the three powers, talk, pause, mute, restart level, quit to title), with every on-screen hint naming the key that is bound; saved in the browser
```

- [ ] **Step 3: The Controls table**

Add above the table:

```markdown
The keyboard column gives the defaults. Settings, then *controls*, remaps moving, jumping,
firing, the powers, talk, pause, mute, restart level and quit to title; the menu keys, Esc and
the intro skip stay as they are.
```

Replace these rows' keyboard and touch cells:

```markdown
| Powers without voice | 1 ship it, 2 rollback, 3 refactor (the number pad's too) | Tap the power in the terminal bar |
| Pause / mute / restart / quit | P or Esc / N / R (while paused) restarts the level / T (while paused) quits to the title; the pause screen lists the controls and powers | Pause button at the top; *sound*, *restart level* and *quit to title* on the pause screen, with the controls and powers |
| Settings | ↑ ↓ choose, ← → change, Enter toggles, Esc back; *controls* opens the key map | Tap a setting to change it; tap the volume dots to set a level |
| End screen | Enter or R retry (from the park, the floor, the fall, or the boss you died on), T title | Tap retries; *title* button |
| Posting a win | Type a name and an optional handle or profile URL; Enter posts, Esc skips; once posted, R starts a new run and T goes to the title | The same form, with the phone's keyboard; tap the prompt to play again |
```

and add a row under `Settings`:

```markdown
| Controls | ↑ ↓ choose, Enter then a key rebinds, Backspace puts an action's defaults back, Esc cancels a rebind or goes back | Keyboards only |
```

- [ ] **Step 4: The whole pass**

Run, each on its own:

```bash
npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'
```

Expected: `ℹ tests 96`, `ℹ pass 96`, `ℹ fail 0`.

```bash
npm run stars 2>&1 | tail -1
```

Expected: `total     382  (MAX_STARS 382)`.

```bash
npm run build 2>&1 | grep -iE "error|built in"
```

Expected: one `built in` line, no error.

Then, on `npm run preview` (the production build), with nothing saved: one run from the title through Level 1 on the default keys, with no console errors or warnings. Then bind the custom map on the controls screen and play Level 1 again.

- [ ] **Step 5: The screenshots**

The other screenshots are 1920x1080: the 960x540 game at twice the pixels. With the browser at a 960x540 viewport and a device pixel ratio of 2, and nothing saved, take the settings screen (focus on `music volume`) as `docs/screenshots/01a-settings.png` and the controls screen (focus on `move left`) as `docs/screenshots/01c-controls.png`.

Run: `file docs/screenshots/01a-settings.png docs/screenshots/01c-controls.png`
Expected: both `PNG image data, 1920 x 1080`. If the tool can't produce that size, leave `01a-settings.png` as it is, drop the `01c-controls.png` line from the README, and say so in the report.

- [ ] **Step 6: The verification table**

Add a row to the README's verification table, under `Restart from the pause screen (2026-09-29)`, dated the day the checks ran. It records what was seen, so cut any clause the pass did not show:

```markdown
| Key remapping and quit to title (DATE) | With jump on SPACE, fire on SHIFT, the powers on Q, E and F and talk on K: the keys play, the old ones do nothing, and the title, the HUD, the tips and the pause screen name the new keys; the map survives a reload. Binding M does not open the microphone, ESC cancels a rebind without leaving the screen, and a key taken from an action leaves it `unbound`, with which the game still runs. T on the pause screen leaves one scene active, no music and an idle clock, and the next run starts on a fresh one. A name with `r` and `t` in it types whole; after the post, R starts a new run and T goes to the title |
```

Replace `DATE` with the date in the table's format (`2026-10-02`, for example).

- [ ] **Step 7: Commit**

```bash
git add README.md docs/screenshots/01a-settings.png docs/screenshots/01c-controls.png
git commit -m "README: the controls screen, quit to title, and the keys after a post

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(If Step 5 left the screenshots alone, stage only `README.md`.)

- [ ] **Step 8: Stop**

Do not push. Report to Travis: the commits, the test and build output, each browser check that passed, and any that could not be run.
