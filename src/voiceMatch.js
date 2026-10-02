// What counts as a spoken command, and when one fires. No Phaser and no window here, so it
// runs under node (test/voiceMatch.test.js), like keymap.js.

export const COMMANDS = ['ship', 'rollback', 'refactor'];

// Open mic: the whole phrase, and what a recognizer writes for it. Every sound-alike is a real
// word or pair (a recognizer only writes real words) that never turned up in 677,000 words of
// ordinary writing, so talk about the game fires nothing. "chip it", "reflect it", "reflector",
// "refector" and "throwback" are what Chrome wrote for the commands on 2026-10-02. Kept off
// because people say them: shipped, shipped it, shipping, react, factor, fallback, callback.
const OPEN = {
  ship: /\b(?:ship ?it|chip it|sheep it|cheap it|ship at|shop it)\b/g,
  rollback: /\b(?:roll ?back|throw ?back|role back|roll bag|row back|rule back|troll back)\b/g,
  refactor: /\b(?:re-? ?factor|refector|reflector|reflect it|refractor|reactor|refract it|reflect her)\b/g,
};

// Hold to talk: the key is the guard, so the looser words the game always took count too.
const HOLD = {
  ship: /\b(?:ship(?:ped|ping|s)?(?: ?it| at)?|chip it|sheep it|cheap it|shop it)\b/g,
  rollback: /\b(?:roll ?backs?|throw ?back|role ?back|roll bag|row back|rule back|troll back)\b/g,
  refactor: /\b(?:re-? ?factor(?:ed|ing|s)?|refector|reflector|reflect it|refractor|reactor|refract it|reflect her)\b/g,
};

// What was heard was not the command's own words: the HUD says "close enough".
const OWN_WORDS = /^(?:ship(?:ped|ping|s)?(?: ?it)?|roll ?backs?|re-? ?factor(?:ed|ing|s)?)$/;

// A recognizer on the device writes "Ship it." where the cloud wrote "ship it".
export const clean = (text) => ` ${text.toLowerCase().replace(/[^a-z' -]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

export const REPEAT_MS = 1500;

// Counts each command over a session's whole transcript, in order, and fires one when its count
// rises. Counting per result is not enough: a recognizer reuses a result's place for the next
// thing said, and can move words from one result to the one before. The count follows the text
// down as well as up, so a command the recognizer takes back never blocks the next real one.
// A rise within REPEAT_MS of the command's last fire is the same command: with phrases
// favoured, Chrome was seen to write "ship it" 34 times over in one result.
export function createCounter(mode = 'open') {
  const patterns = mode === 'hold' ? HOLD : OPEN;
  let had = {};
  const firedAt = {};
  return {
    // A new recognizer session starts its transcript again.
    reset() {
      had = {};
    },
    // The session's transcript so far, and the time. Returns what fires, in spoken order:
    // [{ name, heard, alike }]. `taken(name)` says whether the game would run that command
    // now: one heard where it cannot run is counted and dropped, and is not a fire for the
    // next one to be a repeat of.
    feed(transcript, now, taken = () => true) {
      const text = clean(transcript);
      const fires = [];
      for (const name of COMMANDS) {
        const found = [...text.matchAll(patterns[name])];
        const before = had[name] ?? 0;
        had[name] = found.length;
        if (found.length <= before || !taken(name)) continue;
        if (now - (firedAt[name] ?? -Infinity) < REPEAT_MS) continue;
        firedAt[name] = now;
        const heard = found[before][0];
        fires.push({ name, heard, alike: !OWN_WORDS.test(heard), at: found[before].index });
      }
      return fires.sort((a, b) => a.at - b.at).map(({ name, heard, alike }) => ({ name, heard, alike }));
    },
  };
}

// Hold to talk: a command counts from key down until this long after key up. The latest a
// command fired after the release was 270 ms on the device and 433 ms on the cloud.
export const HOLD_TAIL_MS = 600;
export const inHoldWindow = (now, down, up) => down != null && now >= down && (up == null || now <= up + HOLD_TAIL_MS);
