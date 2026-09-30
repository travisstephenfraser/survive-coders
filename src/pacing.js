// Reading pace for text that goes by on its own: cutscene lines, Slack cards, and the pop-ups
// over enemies. A playtest (2026-09-29) found most of it gone before it could be read. Pure, so
// node --test covers it.

export const TYPE_MS = 28; // Cine's typewriter, per character
export const READ_CPS = 17; // reading speed, characters a second (subtitle guidance for adults)
export const HOLD_MIN_MS = 1200; // a typed line stays at least this long after its last letter
export const FLOAT_MS = 900; // floatText's rise and fade
export const JOKE_HOLD_MS = FLOAT_MS / 2; // a joke sits still this long first: 1.5x in all

// Characters as the player sees them (a ★ is one).
const chars = (text) => [...text].length;
const readMs = (text) => Math.round((chars(text) * 1000) / READ_CPS);

// A typed line, from its first letter: long enough to read (you read along as it types), and
// never cleared sooner than HOLD_MIN_MS after the last letter.
export function lineMs(text) {
  return Math.max(chars(text) * TYPE_MS + HOLD_MIN_MS, readMs(text));
}

// A card shown whole (a Slack ping): long enough to read.
export function cardMs(text) {
  return Math.max(HOLD_MIN_MS, readMs(text));
}

// Items played back to back from `start`: when each starts, and when the last one is done.
export function sequence(start, durations) {
  const starts = [];
  let end = start;
  for (const d of durations) {
    starts.push(end);
    end += d;
  }
  return { starts, end };
}
