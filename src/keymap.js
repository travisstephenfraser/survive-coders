// The keys for each action, kept in this browser like the settings (settings.js), under a key
// of their own so a saved map and saved settings never touch. A key is its key code
// (event.keyCode), the number Phaser's keyboard goes by. One key, one action: binding a key
// takes it from the action that had it. No Phaser and no window here, so it runs under node.
const KEY = 'sc_keys';
const VERSION = 1;
const MAX_KEYS = 4; // per action, in a saved map

// In the order the controls screen lists them.
export const ACTIONS = ['left', 'right', 'jump', 'fire', 'ship', 'rollback', 'refactor', 'talk', 'pause', 'mute', 'restart', 'newrun', 'title'];

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
  newrun: 'new run',
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
  newrun: [71], // G
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
