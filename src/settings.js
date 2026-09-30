// The player's settings, kept in this browser. They're conveniences: when storage is blocked,
// cleared or partitioned (the game inside another site's iframe), the defaults simply apply.
const KEY = 'sc_settings';
const VERSION = 1;

// Shake and flashes start off for players who ask their system for less motion.
export const REDUCED_MOTION = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const DEFAULTS = {
  music: 1, // volume multipliers, 0-1 in tenths
  sfx: 1,
  mute: false,
  crt: true,
  shake: !REDUCED_MOTION,
  flash: !REDUCED_MOTION,
  timer: false, // the run clock in the HUD
};

const level = (x) => Math.min(1, Math.max(0, Math.round(x * 10) / 10));

function load() {
  const values = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved?.v !== VERSION) return values;
    for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === typeof DEFAULTS[k]) values[k] = saved[k];
    values.music = level(values.music);
    values.sfx = level(values.sfx);
  } catch {
    // unreadable or blocked: defaults
  }
  return values;
}

const values = load();

export const settings = {
  get: (k) => values[k],
  set(k, v) {
    values[k] = k === 'music' || k === 'sfx' ? level(v) : v;
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...values }));
    } catch {
      // still applies for this session
    }
  },
};
