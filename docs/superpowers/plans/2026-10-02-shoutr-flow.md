# Shoutr Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a keyboard, a player says "ship it", "rollback" or "refactor" out loud and the power fires, recognised on their own computer, after a one-time mic check that proves it works; hold-to-talk and keys-only are settings, and phones are unchanged.

**Architecture:** Three new modules and one new scene. `src/voiceMatch.js` decides what counts as a command and when it fires (pure, tested under node against the recognizer's recorded events). `src/micStream.js` opens the microphone once and gives out its track and its level. `src/voice.js` keeps its interface and gains an on-device recognizer session, fed from that track, that `src/run.js` keeps running exactly while a level is being played. `src/scenes/MicCheck.js` sits between the title's PLAY NOW and the run, once per browser. The HUD, the title, the tips and the settings screen read one value, `voice.hint` (`open`, `hold` or `keys`), for everything they say about voice.

**Tech Stack:** Phaser 3.90 + Vite 8, plain JavaScript (ES modules), `node --test`. The Web Speech API's on-device mode (`processLocally`, Chrome 139 and later, desktop). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-02-open-mic-design.md` (read it first; its decision numbers are cited below).

## Global Constraints

- Work on branch `claude/shoutr-flow`, off `master`. `master` auto-deploys to production: no push, no merge, no PR without Travis's go. Before any push, run `git fetch` and check the behind count as a separate step, and read the output before doing anything else.
- Stage explicit paths only. `feed/` has unrelated uncommitted edits and the probe's raw results; none of it is committed by this plan.
- The repo is public. Name no player or playtester. God mode stays undocumented. The test fixture holds only prompted command lines: no narration, no room audio.
- Front end only: no change under `api/`, `db/`, `shared/` or the environment.
- The feature's name is **Shoutr Flow**, spelled exactly so, everywhere a player sees it. There is no "Overflow" variant.
- On a keyboard the recognizer is created with `processLocally = true` and no phrases. There is no cloud recognizer on a keyboard and no fallback to one.
- Phones (`TOUCH`, `src/touch.js`) behave exactly as on `master`: the talk slot, `voice.press()` and `voice.release()`, `voice.prime()`, the fall's spoken lines in `src/scenes/Terminal.js`. Not one line of `Terminal.js` changes.
- The mic check costs no run time: it runs before `beginRun` (where the run clock starts), only from the title's PLAY NOW, and a browser that has passed never sees it.
- Settings: `mic` is one of `open`, `hold`, `off`, default `open`, stored in `sc_settings`. A passed check is `sc_mic_ok` = `1`, stored on its own.
- The sound-alike list, the 1.5 s repeat rule and the 600 ms hold tail are the spec's (decisions 5 to 7), verbatim in Task 1's code.
- Match the surrounding code: comments explain why, in the codebase's voice. No em dashes.
- `npm run stars` must still print `total     382  (MAX_STARS 382)`.
- Baseline before this plan: `npm test` 97 pass, 0 fail; `npm run build` clean. After Task 1: 111 pass. After Task 2: 114.
- Commit messages follow the repo's `Area: sentence` style and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

The conditions most likely to bite a person. None can be pinned by a node test (they need a browser, a microphone or a drawn frame), so each is pinned by a named browser check in the task that owns the code:

1. **The mic left on where nobody is playing.** On the pause screen, a hidden tab, the death screen, the win screen and the title, the session must be stopped and the mic's track ended, and playing again must bring both back. (Task 3, Step 7.)
2. **A command heard while it cannot fire.** One said during an intro, on the pause screen or in the fall's typing must not fire then, and must not fire later when the game resumes. (Task 3, Step 7.)
3. **A browser with no on-device recognition.** With the API missing, or reporting `unavailable`, PLAY NOW starts the run at once, the hints name only the keys, `V` does nothing, and there is no error anywhere. (Task 4, Step 6.)
4. **A microphone that is refused, missing or silent.** The check names which, `PLAY WITH THE KEYS` still starts the run, and a session that dies mid-run leaves a red line in the HUD and a game that plays on. (Task 4, Step 6; Task 5, Step 6.)
5. **Phones.** With `?touch`, the talk slot, the title's mic line and the pause screen read exactly as on `master`, and a hold still starts and stops the recognizer. (Task 3, Step 7; Task 5, Step 6.)

Measured on 2026-10-02 in the game's own font (size 16 unless said), so the layouts below are not guesses. The HUD's right-hand line has 366 px beside the last power slot: `Shoutr Flow stopped: keys 1/2/3` is 330 px, `refactor: cooling down 10s` 264, `✓ close enough: refactor` 240, `● Shoutr Flow: hold SPACE` 270. The HUD's left-hand line: `$ powers: 1 2 3, or just say one` is 330 px and `$ CONTEXT FULL → say "refactor" (or 3)` 428, both under today's widest (464). Tips: the longest new one, `Save a big one for the park: say "ship it" (or 1)`, is 488 px. The title's mic line starts at x 590 in a window that ends at 920: `needs Chrome on a computer` is 276 px. The mic check's longest line is 808 px in a window 880 wide. `●`, `○`, `✓` and `→` are all in the font.

## Browser checks: how

Node cannot load a Phaser scene, and automation cannot speak, so Tasks 3 to 6 are checked in the browser with a stand-in recognizer and a stand-in microphone.

- `npm run dev`, then open `http://localhost:5173/`. `?park`, `?tower=60` and `?boss` after the URL start a run at that level once PLAY NOW is picked (such a run is never ranked). `?touch` forces the phone controls.
- `window.game` is on every build; `window.run`, `window.voice` and (from Task 3) `window.mic` are on the dev build only.
- Key presses must be real ones: by hand, or a browser tool's key press.
- **The stand-ins.** Paste this in the console on the title screen, then run `await voice.probe()`:

```js
(() => {
  // A microphone: a silent stream whose level you set with level(0.2) / level(0.001).
  window.__level = 0.001;
  window.level = (v) => (window.__level = v);
  AnalyserNode.prototype.getFloatTimeDomainData = function (buf) { buf.fill(window.__level); };
  window.micFails = null; // 'NotAllowedError' or 'NotFoundError' to make opening it fail
  navigator.mediaDevices.getUserMedia = async () => {
    if (window.micFails) throw new DOMException('stand-in', window.micFails);
    return new AudioContext().createMediaStreamDestination().stream;
  };
  // A recognizer that hears what you tell it to: say('ship it').
  let live = null;
  window.pack = 'available'; // or 'downloadable' / 'unavailable', then: await voice.probe()
  class StandIn {
    static async available() { return window.pack; }
    static async install() { window.pack = 'available'; return true; }
    start() {
      if (this.on) throw new DOMException('started', 'InvalidStateError');
      this.on = true;
      live = this;
      this.results = [];
      setTimeout(() => this.on && this.onstart?.(), 100);
    }
    abort() { this.end(); }
    stop() { this.end(); }
    end(error) {
      if (!this.on) return;
      this.on = false;
      if (error) this.onerror?.({ error });
      setTimeout(() => this.onend?.(), 20);
    }
  }
  StandIn.prototype.processLocally = false;
  window.SpeechRecognition = StandIn;
  window.say = (text) => {
    if (!live?.on) return 'not listening';
    const i = live.results.length;
    const put = (isFinal) => {
      live.results[i] = Object.assign([{ transcript: text, confidence: 1 }], { isFinal });
      live.onresult?.({ resultIndex: i, results: live.results });
    };
    put(false);
    setTimeout(() => live.on && put(true), 400);
    return 'said';
  };
  window.dropSession = (error) => live?.end(error); // the recognizer ends on its own, with or without an error
})();
```

- A browser that has passed the mic check: `localStorage.setItem('sc_mic_ok', '1'); location.reload();` (paste the stand-ins again after a reload). One that has not: `localStorage.removeItem('sc_mic_ok'); location.reload();`
- The mic mode: `localStorage.setItem('sc_settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('sc_settings') ?? '{"v":1}'), v: 1, mic: 'hold' })); location.reload();` (or use the settings row once Task 6 has built it).
- Every check also expects no console errors.
- What these checks cannot show: a real voice. Travis closed the probing on 2026-10-02; nothing here waits on him.
- **Already run once.** On 2026-10-02 every code block in Tasks 1 to 6 was applied to a scratch copy of the repo and exercised with these stand-ins: 114 tests passed, the build was clean, and the mic check, the pass into a run, pause and hidden-tab behaviour, the three-strikes error, hold mode, the three hint modes, the settings rows and the `?touch` path behaved as the tables below say. That is evidence the code is sound, not a substitute for running the checks on the real branch.

---

## Setup (before Task 1)

The working tree holds an unrelated, finished change on another branch: the level 1 street's cyan neon (`src/sprites.js`, `src/scenes/PlayScene.js`), uncommitted on `claude/level1-contrast`. Commit it there first so it does not ride along.

- [ ] **Commit the colour change on its own branch** (each command on its own, and read the output):

```bash
git -C ~/Developer/survive-coders status -sb
```

Expected: `## claude/level1-contrast`, with `M src/scenes/PlayScene.js` and `M src/sprites.js` among the lines.

```bash
cd ~/Developer/survive-coders && git add src/sprites.js src/scenes/PlayScene.js && git commit -m "$(cat <<'EOF'
Level 1: the street's neon is cyan, so the blocks stand out from the sunset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Confirm master is current, as its own step:**

```bash
cd ~/Developer/survive-coders && git fetch && git rev-list --left-right --count master...origin/master
```

Expected: `0	0`. If the second number is not 0, stop and tell Travis: master moved.

- [ ] **Branch off master and confirm the baseline:**

```bash
cd ~/Developer/survive-coders && git switch -c claude/shoutr-flow master && git status -sb | head -3
```

Expected: `## claude/shoutr-flow`, and no `M src/` lines.

```bash
cd ~/Developer/survive-coders && npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)' && npm run stars 2>&1 | tail -1
```

Expected: `ℹ tests 97`, `ℹ pass 97`, `ℹ fail 0`, and `total     382  (MAX_STARS 382)`.

- [ ] **Commit the design and this plan:**

```bash
cd ~/Developer/survive-coders && git add docs/superpowers/specs/2026-10-02-open-mic-design.md docs/superpowers/plans/2026-10-02-shoutr-flow.md && git commit -m "$(cat <<'EOF'
Shoutr Flow: the design and the plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: What counts as a command, and when it fires

**Files:**
- Create: `src/voiceMatch.js`
- Create: `test/voiceMatch.test.js`
- Create: `test/fixtures/voice-probe-2026-10-02.json` (generated in Step 1)

**Interfaces:**
- Consumes: nothing.
- Produces, from `src/voiceMatch.js`:
  - `COMMANDS`: `['ship', 'rollback', 'refactor']`, the same names as the keys of `POWERS` in `src/voice.js`.
  - `clean(text: string): string`: lower-cased, punctuation dropped, single spaces, padded with one space each end.
  - `createCounter(mode?: 'open' | 'hold')` returning `{ reset(): void, feed(transcript: string, now: number, taken?: (name: string) => boolean): Array<{ name: string, heard: string, alike: boolean }> }`. `transcript` is the session's whole transcript so far (every result, in order, joined with spaces); `now` is `performance.now()`; `taken` says whether the game would run that command right now (default: always).
  - `REPEAT_MS` (1500), `HOLD_TAIL_MS` (600).
  - `inHoldWindow(now: number, down: number | null, up: number | null): boolean`.

- [ ] **Step 1: Build the fixture from the probe's recorded events**

The raw file is local and untracked (`feed/mic-probe-r2-20261002T173220674Z.json`). This writes only the prompted command lines into the test fixture.

```bash
cd ~/Developer/survive-coders && mkdir -p test/fixtures && node -e '
const fs = require("fs");
const d = JSON.parse(fs.readFileSync("feed/mic-probe-r2-20261002T173220674Z.json", "utf8"));
// One recognizer session as [ms, transcript so far]: the probe logged only the results that
// changed in each event, so rebuild the whole list.
function stream(session, t0 = -Infinity, t1 = Infinity) {
  const results = [];
  const out = [];
  for (const e of d.events) {
    if (e.s !== session || e.type !== "result") continue;
    e.r.forEach((r, k) => (results[e.ri + k] = r[2]));
    results.length = e.n;
    if (e.t >= t0 && e.t <= t1) out.push([e.t, results.join(" ")]);
  }
  return out;
}
const plainSession = d.sessions.find((s) => s.cfg.includes("no phrases")).n;
const loopAt = d.events.find((e) => e.type === "result" && e.r.some((r) => /think we should/.test(r[2])));
const fixture = {
  source: "One speaker, a webcam microphone, Chrome 154, recognised on the device, 2026-10-02 (the mic probe, round 2). Only prompted lines: no narration and no room audio.",
  plain: { lines: d.steps.plain.map((t) => [t.cmd, Math.round(t.tPrompt)]), events: stream(plainSession) },
  loop: { said: "okay I think we should ship it now and see what happens", events: stream(loopAt.s, loopAt.t - 2000, loopAt.t + 4000) },
};
fs.writeFileSync("test/fixtures/voice-probe-2026-10-02.json", JSON.stringify(fixture));
console.log("plain events", fixture.plain.events.length, "lines", fixture.plain.lines.length, "| loop events", fixture.loop.events.length, "| bytes", fs.statSync("test/fixtures/voice-probe-2026-10-02.json").size);
'
```

Expected: `plain events 91 lines 24 | loop events 23 | bytes 14265` (the byte count may differ by a few). If the raw file is missing, stop and ask Travis for it: the fixture cannot be written from memory.

- [ ] **Step 2: Write the failing tests**

Create `test/voiceMatch.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMMANDS, HOLD_TAIL_MS, REPEAT_MS, clean, createCounter, inHoldWindow } from '../src/voiceMatch.js';

// Feed a counter a list of [ms, transcript so far] and collect what fires, with when.
function replay(events, mode = 'open') {
  const counter = createCounter(mode);
  const fires = [];
  for (const [t, text] of events) for (const f of counter.feed(text, t)) fires.push({ ...f, t });
  return fires;
}
const names = (fires) => fires.map((f) => f.name);

test('a result that grows fires its command once', () => {
  const fires = replay([[0, 'ship'], [200, 'ship it'], [400, 'ship it now'], [900, 'Ship it now.']]);
  assert.deepEqual(names(fires), ['ship']);
  assert.equal(fires[0].t, 200);
});

test('a recognizer on the device writes capitals and full stops; the command still fires', () => {
  assert.equal(clean('Ship it.'), ' ship it ');
  assert.deepEqual(names(replay([[0, 'Roll back, then re-factor!']])), ['rollback', 'refactor']);
});

test('two commands in one result fire in the order they were said', () => {
  assert.deepEqual(names(replay([[0, 'refactor this and then ship it']])), ['refactor', 'ship']);
});

// Known answers from outside this module: what Chrome wrote for each command on 2026-10-02
// (the mic probe's transcripts), and the one it wrote that no list should rescue.
test('what the recognizer really wrote for a command fires that command, and says so', () => {
  const heard = { 'chip it': 'ship', 'throwback': 'rollback', 'Throwback': 'rollback', 'reflect it': 'refactor', 'reflector': 'refactor', 'refector': 'refactor' };
  for (const [text, name] of Object.entries(heard)) {
    const [fire, ...rest] = replay([[0, text]]);
    assert.deepEqual([fire?.name, fire?.alike, rest.length], [name, true, 0], text);
  }
  const [own] = replay([[0, 'ship it']]);
  assert.equal(own.alike, false);
  assert.deepEqual(replay([[0, 'ref']]), []);
});

test('ordinary talk about the game fires nothing on an open mic', () => {
  const talk = [
    'we shipped it late and the fallback fired',
    'any feedback on the React callback',
    'shipping is a factor here, so come back to it',
    'a vector, a detector and a reflection walk into a ship',
  ];
  for (const line of talk) assert.deepEqual(replay([[0, line]]), [], line);
});

test('held, the looser words the game always took count too', () => {
  assert.deepEqual(names(replay([[0, 'ship']], 'hold')), ['ship']);
  assert.deepEqual(names(replay([[0, 'ship'], [150, 'ship it']], 'hold')), ['ship']);
  assert.deepEqual(names(replay([[0, 'refactoring']], 'hold')), ['refactor']);
  assert.deepEqual(names(replay([[0, 'ship']], 'open')), []);
});

// The red-team's failing sequence for a count kept per result: the tail of a sentence moves into
// the result before it, then the next thing said takes the tail's old place.
test('words that move between results fire once, and the next command still fires', () => {
  const fires = replay([
    [0, 'okay  ship it'], // results: "okay" | " ship it", both unsettled
    [300, 'okay ship it'], // settled as one result
    [4000, 'okay ship it  ship it'], // a second command, in the place the tail had
  ]);
  assert.deepEqual(fires.map((f) => f.t), [0, 4000]);
});

test('a command the recognizer takes back never blocks the next real one', () => {
  const fires = replay([[0, 'ship it'], [300, 'chip in'], [600, 'chip in for lunch'], [5000, 'chip in for lunch ship it']]);
  assert.deepEqual(fires.map((f) => f.t), [0, 5000]);
});

test('the same command again inside the repeat window is one command', () => {
  assert.equal(replay([[0, 'ship it'], [REPEAT_MS - 1, 'ship it ship it']]).length, 1);
  assert.equal(replay([[0, 'ship it'], [REPEAT_MS, 'ship it ship it']]).length, 2);
});

test('a command heard where it cannot run is dropped, and the next real one is not its repeat', () => {
  const counter = createCounter();
  assert.deepEqual(counter.feed('ship it', 0, () => false), []);
  assert.deepEqual(names(counter.feed('ship it ship it', 500)), ['ship']);
  assert.deepEqual(counter.feed('ship it ship it', 600), []);
});

test('a new session starts its count again', () => {
  const counter = createCounter();
  assert.equal(counter.feed('ship it', 0).length, 1);
  counter.reset();
  assert.equal(counter.feed('ship it', 5000).length, 1);
});

test('hold to talk: a command counts from key down until the tail after key up', () => {
  assert.equal(inHoldWindow(50, null, null), false);
  assert.equal(inHoldWindow(99, 100, null), false);
  assert.equal(inHoldWindow(100, 100, null), true);
  assert.equal(inHoldWindow(5000, 100, null), true); // still held
  assert.equal(inHoldWindow(1000 + HOLD_TAIL_MS - 1, 100, 1000), true);
  assert.equal(inHoldWindow(1000 + HOLD_TAIL_MS + 1, 100, 1000), false);
});

// Calibration: the recognizer's own events, recorded on 2026-10-02 (see the fixture's `source`).
const probe = JSON.parse(readFileSync(new URL('./fixtures/voice-probe-2026-10-02.json', import.meta.url)));

test('replayed: every one of the 24 commands said to the on-device recognizer fires', () => {
  const fires = replay(probe.plain.events);
  const hit = probe.plain.lines.filter(([name, t]) => fires.some((f) => f.name === name && f.t > t && f.t <= t + 5100));
  assert.equal(probe.plain.lines.length, 24);
  assert.equal(hit.length, 24);
  // Which way would a broken matcher look like success? One that fires on everything: 24 lines
  // were said, so 24 fires, and all three commands among them.
  assert.equal(fires.length, 24);
  assert.deepEqual([...new Set(names(fires))].sort(), [...COMMANDS].sort());
});

test('replayed: "ship it" written many times over in one result is one command', () => {
  const repeats = Math.max(...probe.loop.events.map(([, text]) => (clean(text).match(/ship it/g) ?? []).length));
  assert.ok(repeats >= 10, `the fixture should hold the loop: ${repeats}`);
  assert.deepEqual(names(replay(probe.loop.events)), ['ship']);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd ~/Developer/survive-coders && node --test test/voiceMatch.test.js 2>&1 | tail -6`
Expected: FAIL, with `Cannot find module` naming `src/voiceMatch.js`.

- [ ] **Step 4: Write the module**

Create `src/voiceMatch.js`:

```js
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd ~/Developer/survive-coders && node --test test/voiceMatch.test.js 2>&1 | grep -E '^(✔|✖|ℹ (tests|pass|fail))'`
Expected: 14 lines starting `✔`, then `ℹ tests 14`, `ℹ pass 14`, `ℹ fail 0`.

Run: `cd ~/Developer/survive-coders && npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 111`, `ℹ pass 111`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
cd ~/Developer/survive-coders && git add src/voiceMatch.js test/voiceMatch.test.js test/fixtures/voice-probe-2026-10-02.json && git commit -m "$(cat <<'EOF'
Voice: what counts as a command, counted over the whole transcript, with its sound-alikes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The mic mode, and whether the check has passed

**Files:**
- Modify: `src/settings.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces, from `src/settings.js`:
  - `MIC_MODES`: `['open', 'hold', 'off']`.
  - `settings.get('mic')`: one of those; `settings.set('mic', mode)`.
  - `micCheck.passed(): boolean` and `micCheck.pass(): void`.

- [ ] **Step 1: Write the failing tests**

In `test/settings.test.js`, change the loader so a case can seed more than the settings (replace the `load` function):

```js
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
```

Append to the end of the file:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Developer/survive-coders && node --test test/settings.test.js 2>&1 | grep -E '^(✔|✖|ℹ (pass|fail))'`
Expected: the four old tests `✔`, the three new ones `✖`, `ℹ fail 3`.

- [ ] **Step 3: Add the mode and the flag**

In `src/settings.js`, add `mic` to `DEFAULTS` and the list of modes above it:

```js
// Shoutr Flow on a keyboard: say it, hold the talk key and say it, or keys only (voice.js).
export const MIC_MODES = ['open', 'hold', 'off'];

export const DEFAULTS = {
  music: 1, // volume multipliers, 0-1 in tenths
  sfx: 1,
  mute: false,
  crt: true,
  shake: !REDUCED_MOTION,
  flash: !REDUCED_MOTION,
  timer: false, // the run clock in the HUD
  mic: 'open',
};
```

In `load()`, after `values.sfx = level(values.sfx);`:

```js
    if (!MIC_MODES.includes(values.mic)) values.mic = DEFAULTS.mic;
```

At the end of the file:

```js
// Whether this browser has passed the mic check (scenes/MicCheck.js). Kept apart from the
// settings: it records something that happened, not a choice. With storage blocked it holds
// until the page is closed, and the check is offered again next visit.
const MIC_OK = 'sc_mic_ok';
let micOk = false;
try {
  micOk = localStorage.getItem(MIC_OK) === '1';
} catch {
  // blocked: not passed yet
}

export const micCheck = {
  passed: () => micOk,
  pass() {
    micOk = true;
    try {
      localStorage.setItem(MIC_OK, '1');
    } catch {
      // still holds for this session
    }
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/Developer/survive-coders && npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 114`, `ℹ pass 114`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd ~/Developer/survive-coders && git add src/settings.js test/settings.test.js && git commit -m "$(cat <<'EOF'
Settings: a mic mode (open, hold, off), and a passed mic check kept on its own

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 3: The on-device session, and when it runs

**Files:**
- Create: `src/micStream.js`
- Modify: `src/voice.js` (the whole file is replaced; the phone's code is kept as it is, under new method names)
- Modify: `src/run.js` (two functions added at the end)
- Modify: `src/main.js:24-25` and `:70`
- Modify: `src/scenes/Title.js:8` and `:97-105` (the run's start moves to `run.js`)

**Interfaces:**
- Consumes: `createCounter`, `inHoldWindow` from `src/voiceMatch.js` (Task 1); `settings`, `micCheck` from `src/settings.js` (Task 2).
- Produces, from `src/micStream.js`: `mic.open(): Promise<{ ok: true } | { ok: false, reason: 'blocked' | 'none' | 'failed' }>`, `mic.track(): MediaStreamTrack | null`, `mic.level(): number`, `mic.speaking(): boolean`, `mic.close(): void`.
- Produces, on the `voice` object from `src/voice.js` (everything already there stays: `press`, `release`, `trigger`, `heard`, `listening`, `status`, `gate`, `keysSuspended`, `supported`, `prime`, `primed`, `remaining`, `resetCooldowns`, `lastEvent`, the `power` event):
  - `voice.onDevice: boolean`, `voice.local: null | 'available' | 'downloadable' | 'downloading' | 'unavailable'`, `voice.probe(): Promise<string>`, `voice.install(): Promise<boolean>`.
  - `voice.mode: 'open' | 'hold' | 'off'`, `voice.ready: boolean`, `voice.hint: 'open' | 'hold' | 'keys'`, `voice.checkDue: boolean`.
  - `voice.running: boolean`, `voice.speaking: boolean`, `voice.error: string | null`.
  - `voice.listenWhile(on: boolean): void`, `voice.beginCheck(): Promise<void>`, `voice.endCheck(keep: boolean): void`.
  - Events: `heard` `(text: string, final: boolean)`, `command` `({ name, heard, alike })`.
  - `voice.lastEvent` gains `heard` and `alike` on a voice fire.
- Produces, from `src/voice.js`: `powerKeys(): string` (now exported), `howTo(name: string, opts?: { short?: boolean, first?: boolean }): string`.
- Produces, from `src/run.js`: `beginFromTitle(scene): void`, `installVoiceSession(game): void`.

- [ ] **Step 1: Write the microphone module**

Create `src/micStream.js`:

```js
// The microphone on a keyboard, opened once for the two things that need it: the recognizer
// (voice.js feeds it this stream's track, which keeps a session alive through the quiet between
// commands, where Chrome's own mic path ends one after 8 to 15 seconds) and the level (the
// Shoutr Flow light, the mic check's meter). Closing it ends the track, so the browser's own
// "mic in use" mark goes out whenever the game is not listening.
let stream = null;
let context = null;
let source = null;
let analyser = null;
let samples = null;
let opening = null;
let floor = 0.003; // the room's own level, followed slowly

const REASONS = { NotAllowedError: 'blocked', SecurityError: 'blocked', NotFoundError: 'none', OverconstrainedError: 'none' };
const threshold = () => Math.max(0.012, floor * 4);

export const mic = {
  // { ok: true }, or { ok: false, reason }: 'blocked' (refused), 'none' (no input device) or
  // 'failed'. The recognizer cannot tell the first two apart (both are its `not-allowed`), which
  // is why the reason comes from here.
  async open() {
    if (mic.track()?.readyState === 'live') return { ok: true };
    opening ??= (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        context ??= new AudioContext();
        context.resume();
        source = context.createMediaStreamSource(stream);
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        samples = new Float32Array(analyser.fftSize);
        source.connect(analyser);
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: REASONS[err?.name] ?? 'failed' };
      } finally {
        opening = null;
      }
    })();
    return opening;
  },

  track: () => stream?.getAudioTracks()[0] ?? null,

  // The level right now (0 with the mic closed). Each reading also moves the room's level: fast
  // toward a quiet reading, very slowly toward a loud one, so a sentence stays a voice from its
  // first word to its last, and a room that is simply noisy stops reading as one in a minute.
  level() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    const rms = Math.sqrt(sum / samples.length);
    floor += (rms - floor) * (rms > threshold() ? 0.0002 : 0.05);
    return rms;
  },

  speaking: () => mic.level() > threshold(),

  close() {
    for (const t of stream?.getTracks() ?? []) t.stop();
    source?.disconnect();
    stream = source = analyser = null;
  },
};
```

- [ ] **Step 2: Replace `src/voice.js`**

The phone's push-to-talk is today's code, moved under `pressTouch`, `releaseTouch`, `makeRecognizer`, `startSession` → `startTouch` and `fireFromTranscript`, unchanged in behaviour. Everything else is new. Write the whole file:

```js
import Phaser from 'phaser';
import { TOUCH } from './touch.js';
import { keymap } from './keymap.js';
import { micCheck, settings } from './settings.js';
import { mic } from './micStream.js';
import { createCounter, inHoldWindow } from './voiceMatch.js';

// "Shoutr Flow": spoken keywords fire powers. On a keyboard the browser recognises them on this
// computer (Chrome's on-device speech recognition; nothing said leaves it), from a session that
// runs for as long as a level is being played: say it, or hold the talk key and say it
// (settings). On a phone it is hold-to-talk through the browser's own recognizer, as it always
// was. `re` is what a phone's hold matches; a keyboard's patterns are in voiceMatch.js.
export const POWERS = {
  ship: { label: 'ship it', does: 'big forward blast', cooldown: 6000, re: /\bship(ped|ping|s)?\b|\bshipit\b/ },
  rollback: { label: 'rollback', does: 'rewind 3s, heal', cooldown: 8000, re: /\broll ?backs?\b|\brole ?back\b|\broll bag\b|\brollback\b/ },
  refactor: { label: 'refactor', does: 'clear enemies; shrink the Hydra', cooldown: 10000, re: /\bre-? ?factor(ed|ing|s)?\b|\breactor\b|\brefractor\b/ },
};

// What a status line calls the push-to-talk control (its key, or the HUD's talk slot) and
// the powers' keys: listed, or just "the keys" when their names are long, since the line sits
// beside the power slots and a long one ran over them. A status that names a key is a
// function, read when the line is drawn: the keys can be rebound between runs (keymap.js).
const talkKey = () => (TOUCH ? 'talk' : keymap.name('talk'));
export const powerKeys = () => {
  const list = keymap.short(Object.keys(POWERS), '/');
  return list ? `keys ${list}` : 'the keys';
};
const IDLE = () => `hold ${talkKey()} to talk`;
const NO_SPEECH = () => `no speech API here: use ${powerKeys()}`;

const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const LOCAL = { langs: ['en-US'], processLocally: true };
const HEARD_MS = 2500; // how long the HUD shows what Shoutr Flow last heard
// Errors a session does not get over by being started again.
const HARD = ['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'];
const MIC_ERRORS = { blocked: 'mic blocked', none: 'no microphone', failed: 'mic failed' };

// How a tip tells the player to run a power, by how voice is set up here. `short` for the tips
// that are already long; `first` when it starts a sentence.
export function howTo(name, { short = false, first = false } = {}) {
  const key = keymap.name(name);
  const said = `"${POWERS[name].label}"`;
  const talk = keymap.name('talk');
  const text = {
    open: short ? `say ${said} (or ${key})` : `say ${said} (or press ${key})`,
    hold: short ? `HOLD ${talk}, ${said} (or ${key})` : `HOLD ${talk}, say ${said} (or press ${key})`,
    keys: short ? `${key} is ${said}` : `press ${key} for ${POWERS[name].label}`,
  }[voice.hint];
  return first ? text[0].toUpperCase() + text.slice(1) : text;
}

class VoiceControl extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.readyAt = {};
    this.heardText = ''; // what was last heard (the `heard` getter lets it lapse on a keyboard)
    this.heardUntil = 0;
    this.transcript = '';
    this.listening = false; // the talk key or the talk slot is held
    this.keysSuspended = false; // while typing (the Chute's terminal), the talk and power keys are just letters
    this.gate = null; // set by the play scene: true while an intro owns the controls
    this.status = IDLE;

    // A phone: one recognizer session per hold.
    this.touchRunning = false;
    this.pendingFire = false;
    this.heldLocked = false; // this push-to-talk hold began under the gate

    // A keyboard: one session for as long as a level is being played.
    this.local = null; // what the browser says of its speech pack: available | downloadable | downloading | unavailable
    this.session = null; // the on-device recognizer, while one is wanted
    this.running = false; // it is really listening (between its start and its end)
    this.started = false;
    this.opening = false; // the mic is being opened for a session
    this.wanted = false; // a level is being played (run.js)
    this.checking = false; // the mic check owns the session (scenes/MicCheck.js)
    this.error = null; // why voice stopped, for the HUD
    this.lastError = null;
    this.strikes = 0;
    this.down = null; // the talk key's last hold, for hold-to-talk's window
    this.up = null;
    this.counter = createCounter('open');
    this.said = ''; // the session's transcript so far

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
    window.addEventListener('blur', () => this.release());
  }

  // A status can be a function, so a line that names a key names the one bound now.
  get status() {
    return typeof this.statusNow === 'function' ? this.statusNow() : this.statusNow;
  }

  set status(s) {
    this.statusNow = s;
  }

  // What was last heard. On a keyboard the mic is always open, so it lapses after HEARD_MS
  // instead of sitting in the HUD until the next thing is said.
  get heard() {
    return this.heardUntil && performance.now() > this.heardUntil ? '' : this.heardText;
  }

  set heard(text) {
    this.heardText = text;
    this.heardUntil = 0;
  }

  get supported() {
    return Boolean(SR());
  }

  // Speech can be recognised on this computer: Chrome 139 and later, on a keyboard. Phones have
  // no such mode and keep the browser's own recognizer.
  get onDevice() {
    const rec = SR();
    return !TOUCH && Boolean(rec && 'processLocally' in rec.prototype && rec.available && rec.install);
  }

  get mode() {
    return settings.get('mic');
  }

  // Voice is set up here: possible, wanted, proven by the mic check, and the speech pack is on
  // this computer (a browser can drop it; until it has answered, a passed check is trusted).
  get ready() {
    return this.onDevice && this.mode !== 'off' && micCheck.passed() && (this.local === null || this.local === 'available');
  }

  // What the hints tell a player to do for a power: say it, hold the key and say it, or press.
  get hint() {
    return this.ready ? this.mode : 'keys';
  }

  // PLAY NOW should go by the mic check first: it has not been passed here, or the speech pack
  // has gone and only the check can fetch it. Only once the browser has said which: an answer
  // still on its way does not hold up a run.
  get checkDue() {
    if (!this.onDevice || this.mode === 'off') return false;
    const packGone = this.local === 'downloadable' || this.local === 'downloading';
    return packGone || (this.local === 'available' && !micCheck.passed());
  }

  get speaking() {
    return this.running && mic.speaking();
  }

  // Ask the browser whether its English speech pack is here.
  async probe() {
    if (!this.onDevice) return (this.local = 'unavailable');
    try {
      this.local = await SR().available(LOCAL);
    } catch {
      this.local = 'unavailable';
    }
    return this.local;
  }

  // Fetch the speech pack (about 60 MB, once). Chrome only starts it from inside the key press
  // or click that asked for it, so nothing may be awaited before this is called.
  install() {
    let asked;
    try {
      asked = SR().install(LOCAL);
    } catch {
      return Promise.resolve(false);
    }
    return asked.then(
      async (ok) => {
        if (!ok) return false;
        // The browser can report the pack a moment after the download says it is done.
        for (let i = 0; i < 40 && (await this.probe()) !== 'available'; i++) await new Promise((r) => setTimeout(r, 250));
        return this.local === 'available';
      },
      () => false,
    );
  }

  // Ask for mic permission on the title screen so the first hold doesn't pop a prompt mid-fight.
  // A phone's setup; a keyboard has the mic check.
  async prime() {
    if (!this.supported) {
      this.status = NO_SPEECH;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      this.primed = true;
      this.status = IDLE;
    } catch {
      this.primed = false;
      this.status = 'mic blocked: allow it in the address bar';
    }
  }

  // ---- A keyboard: the on-device session ----

  // Called every frame by run.js with whether a level is being played. Only a change does
  // anything: start listening when one begins, stop (and end the mic's track) when it pauses,
  // hides or ends. A stopped session's error is forgotten at the next start, which tries again.
  listenWhile(on) {
    if (TOUCH || this.checking || on === this.wanted) return;
    this.wanted = on;
    if (!on) return this.stopSession();
    this.error = null;
    this.strikes = 0;
    if (this.ready) this.startSession();
  }

  // The mic check takes the session before the run exists, and hands it over (keep) or ends it.
  beginCheck() {
    this.checking = true;
    this.error = null;
    this.strikes = 0;
    return this.startSession();
  }

  endCheck(keep) {
    this.checking = false;
    if (!keep) return this.stopSession();
    // The session goes on into the run with the mode's own patterns. The new count starts level
    // with what has been said, or the "ship it" that passed the check would fire in level 1.
    this.counter = createCounter(this.mode === 'hold' ? 'hold' : 'open');
    this.counter.feed(this.said, performance.now());
  }

  async startSession() {
    if (this.session || this.opening) return;
    this.opening = true;
    const opened = await mic.open();
    this.opening = false;
    // Paused, hidden or left while the mic was opening.
    if (!this.wanted && !this.checking) return mic.close();
    if (!opened.ok) {
      this.error = MIC_ERRORS[opened.reason];
      return;
    }
    // The check listens for the command itself, whatever the mode.
    this.counter = createCounter(this.mode === 'hold' && !this.checking ? 'hold' : 'open');
    this.session = this.makeLocal();
    // The track can end by itself (the mic unplugged, its permission withdrawn), and Chrome tells
    // the recognizer nothing: it would sit there deaf, the light still lit. Our own mic.close()
    // fires no `ended`.
    mic.track().onended = () => this.session && this.retry();
    this.begin();
  }

  begin() {
    this.started = false;
    this.lastError = null;
    try {
      this.session.start(mic.track());
    } catch {
      this.retry(); // the track is not live: nothing started, and no event will ever say so
    }
  }

  // The session cannot go on as it is: its track ended, or it would not start. Close it, open
  // the mic again and start another, three times at most.
  retry() {
    const on = this.wanted || this.checking;
    this.stopSession();
    if (++this.strikes >= 3) this.error = 'Shoutr Flow stopped';
    else if (on) this.startSession();
  }

  stopSession() {
    const session = this.session;
    this.session = null;
    this.running = false;
    this.heard = '';
    this.listening = false;
    this.down = this.up = null;
    try {
      session?.abort();
    } catch {
      // not running
    }
    mic.close();
  }

  makeLocal() {
    const rec = new (SR())();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.processLocally = true; // recognised on this computer: nothing said is sent anywhere
    // No phrases are favoured: measured on 2026-10-02, favouring the three commands made the
    // recognizer write them when nobody had said them.
    rec.onstart = () => {
      if (rec !== this.session) return;
      this.started = true;
      this.running = true;
      this.said = '';
      this.counter.reset();
    };
    rec.onresult = (e) => {
      if (rec !== this.session) return;
      const now = performance.now();
      this.strikes = 0;
      const said = [...e.results].map((r) => r[0].transcript);
      this.said = said.join(' ');
      this.heardText = (said.at(-1) ?? '').trim().toLowerCase();
      this.heardUntil = now + HEARD_MS;
      this.emit('heard', this.heardText, e.results[e.results.length - 1].isFinal);
      // Commands fire on unsettled results: waiting for the settled one costs a third of a
      // second, and the recognizer was seen to settle a "rollback" it had heard as "back".
      // The mic check takes any command; a run takes one only where its power could run.
      for (const fire of this.counter.feed(this.said, now, () => this.checking || this.takes(now))) {
        this.emit('command', fire);
        if (!this.checking) this.trigger(fire.name, 'voice', { heard: fire.heard, alike: fire.alike });
      }
    };
    rec.onerror = (e) => {
      if (rec !== this.session) return;
      this.lastError = e.error;
      // The speech pack is not on this computer after all. Chrome sends no `end` after this
      // one, so nothing else would notice; the title's next look offers the mic check again.
      if (e.error === 'language-not-supported') {
        this.stopSession();
        this.error = 'speech pack missing';
        this.probe();
      }
    };
    rec.onend = () => {
      if (rec !== this.session) return; // stopped on purpose
      this.running = false;
      // Fed from the mic's track a session should not end by itself; if it does, start it again
      // at once. One that never started, or ended in an error that starting again will not fix,
      // is a strike; three in a row, with nothing heard between, and it stays stopped.
      if (!this.started || HARD.includes(this.lastError)) this.strikes++;
      if (this.strikes >= 3) {
        this.error = 'Shoutr Flow stopped';
        this.session = null;
        mic.close();
        return;
      }
      this.begin();
    };
    return rec;
  }

  // Whether a command heard now would run its power. One heard where it would not (an intro,
  // a pause, a typing screen, no level, a talk key that is up) is dropped, never kept for later.
  takes(now) {
    if (this.keysSuspended || this.gate?.() || this.listenerCount('power') === 0) return false;
    return this.mode !== 'hold' || inHoldWindow(now, this.down, this.up);
  }

  // The talk key, or a phone's talk slot. On a keyboard it only opens hold-to-talk's window:
  // the recognizer is already listening.
  press() {
    if (TOUCH) return this.pressTouch();
    if (this.listening) return;
    this.listening = true;
    this.down = performance.now();
    this.up = null;
  }

  release() {
    if (TOUCH) return this.releaseTouch();
    if (!this.listening) return;
    this.listening = false;
    this.up = performance.now();
  }

  // ---- A phone: push-to-talk. Hold the talk slot, say a command, release. The command fires
  // on release, through the browser's own recognizer, which needs the network. ----

  makeRecognizer() {
    const rec = new (SR())();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += `${e.results[i][0].transcript} `;
      this.transcript = text.toLowerCase().trim();
      this.heard = this.transcript;
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.status = e.error === 'not-allowed' ? 'mic blocked: allow it in the address bar' : `mic error: ${e.error}, ${powerKeys()} work`;
    };
    rec.onend = () => {
      this.touchRunning = false;
      if (this.pendingFire) {
        this.pendingFire = false;
        if (!this.fireFromTranscript() && this.status === 'processing...') this.status = IDLE;
      }
      // Pressed again (or the browser timed out mid-hold): keep listening.
      if (this.listening) this.startTouch();
    };
    return rec;
  }

  startTouch() {
    if (this.touchRunning) return;
    try {
      this.rec.start();
      this.touchRunning = true;
    } catch {
      /* still shutting down; onend restarts */
    }
  }

  pressTouch() {
    if (this.listening) return;
    if (!this.supported) {
      this.status = NO_SPEECH;
      return;
    }
    this.listening = true;
    this.heldLocked = Boolean(this.gate?.());
    this.pendingFire = false;
    this.transcript = '';
    this.heard = '';
    this.status = `listening... release ${talkKey()}`;
    this.rec ??= this.makeRecognizer();
    this.startTouch();
  }

  releaseTouch() {
    if (!this.listening) return;
    this.listening = false;
    // A hold that began or ends while an intro owns the controls is dropped, so the browser's
    // late final result can't fire it after the intro lifts.
    if (this.heldLocked || this.gate?.()) {
      this.heldLocked = false;
      this.transcript = '';
      this.status = IDLE;
      try {
        this.rec.abort();
      } catch {
        /* not running */
      }
      return;
    }
    if (this.fireFromTranscript()) {
      try {
        this.rec.abort();
      } catch {
        /* not running */
      }
      return;
    }
    // Command not in the interim text yet: stop and fire from the final result in onend.
    this.pendingFire = true;
    this.status = 'processing...';
    try {
      this.rec.stop();
    } catch {
      /* not running */
    }
  }

  // Fire the earliest command spoken in this hold. Returns true if one fired.
  fireFromTranscript() {
    const text = this.transcript;
    let best = null;
    let bestAt = Infinity;
    for (const [name, p] of Object.entries(POWERS)) {
      const m = p.re.exec(text);
      if (m && m.index < bestAt) {
        best = name;
        bestAt = m.index;
      }
    }
    if (!best) {
      if (text) this.status = `no command heard, try again`;
      return false;
    }
    this.transcript = '';
    this.status = IDLE;
    this.trigger(best, 'voice');
    return true;
  }

  // ---- Both ----

  // Returns true if the power fired. Powers only fire while a play scene is listening.
  // `lastEvent` lets the HUD tell "heard" apart from "ran" and "cooling down"; a voice fire on
  // a keyboard carries what was heard and whether it was only a sound-alike (`said`).
  trigger(name, source, said = {}) {
    if (this.listenerCount('power') === 0 || this.gate?.()) return false; // refused, no cooldown spent
    const now = performance.now();
    if ((this.readyAt[name] ?? 0) > now) {
      this.lastEvent = { type: 'cooldown', name, source, left: this.readyAt[name] - now, at: now, ...said };
      return false;
    }
    this.readyAt[name] = now + POWERS[name].cooldown;
    this.lastEvent = { type: 'fired', name, source, at: now, ...said };
    this.emit('power', name, source);
    return true;
  }

  remaining(name) {
    return Math.max(0, (this.readyAt[name] ?? 0) - performance.now());
  }

  resetCooldowns() {
    this.readyAt = {};
  }
}

export const voice = new VoiceControl();
```

- [ ] **Step 3: Keep the session running exactly while a level is played**

In `src/run.js`, append:

```js
// A run from the title screen (PLAY NOW, or the mic check it leads to): the intros and the
// tips play again.
export function beginFromTitle(scene) {
  scene.registry.set({ bossIntroSeen: false, introSeen: false, parkIntroSeen: false, rollbackTaught: false, lockTaught: false });
  beginRun(scene);
}

// Shoutr Flow listens while a level is being played and at no other time: not on the title, a
// death or win screen, the pause screen or a hidden tab. Checked every frame, and when the tab
// hides (a hidden tab draws no frames). voice.listenWhile only acts on a change.
export function installVoiceSession(game) {
  // Phaser only pauses a scene on the next frame, and a hidden tab draws none, so a pause that
  // has been asked for counts too (HUD.setPaused's flag): without it the mic opened for a frame
  // or two behind the pause screen on every return to a tab that had paused itself.
  const paused = (s) => s.sys.isPaused() || (s.pauseAsked && s.sys.isActive());
  const playing = () => run.state === 'running' && !document.hidden && !game.scene.isActive('End') && !game.scene.scenes.some(paused);
  const sync = () => voice.listenWhile(playing());
  game.events.on('step', sync);
  document.addEventListener('visibilitychange', sync);
}
```

In `src/scenes/Title.js`, the title's `go` uses the new function. Replace:

```js
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      // A run from the title plays the intros and tips again. Dev shortcuts: ?park,
      // ?tower=59|60|61, ?chute, ?landing, ?ride, ?boss jump straight to a level (unranked).
      this.registry.set({ bossIntroSeen: false, introSeen: false, parkIntroSeen: false, rollbackTaught: false, lockTaught: false });
      beginRun(this);
    };
```

with:

```js
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      // Dev shortcuts: ?park, ?tower=59|60|61, ?chute, ?landing, ?ride, ?boss jump straight
      // to a level (unranked).
      beginFromTitle(this);
    };
```

and change the import on line 8 from `import { beginRun, run } from '../run.js';` to `import { beginFromTitle, run } from '../run.js';`.

- [ ] **Step 4: Install it, and expose the mic to the dev console**

In `src/main.js`, change line 25 from:

```js
import { installRunClock } from './run.js';
```

to:

```js
import { installRunClock, installVoiceSession } from './run.js';
import { mic } from './micStream.js';
```

After `installRunClock(window.game);` add:

```js
installVoiceSession(window.game);
```

and change the last line from:

```js
if (import.meta.env.DEV) window.voice = voice; // debugging hook for dev builds only
```

to:

```js
if (import.meta.env.DEV) Object.assign(window, { voice, mic }); // debugging hooks for dev builds only
```

- [ ] **Step 5: Run the tests and the build**

Run: `cd ~/Developer/survive-coders && npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)' && npm run build 2>&1 | tail -3`
Expected: `ℹ tests 114`, `ℹ pass 114`, `ℹ fail 0`, and a build that ends with `✓ built in` and no error.

- [ ] **Step 6: Browser check, the session itself**

`npm run dev`, open `http://localhost:5173/`, paste the stand-ins, then in the console:

```js
localStorage.setItem('sc_mic_ok', '1'); location.reload();
```

Paste the stand-ins again, run `await voice.probe()` (expected: `'available'`), and confirm `voice.ready` is `true` and `voice.hint` is `'open'`.

Pick PLAY NOW and skip the intro (ENTER). Then:

| Do | Expect |
|---|---|
| `voice.running`, `mic.track()?.readyState` | `true`, `'live'` |
| `say('ship it')` | `'said'`; the blast fires once; `voice.lastEvent` is `{ type: 'fired', name: 'ship', source: 'voice', heard: 'ship it', alike: false, ... }` |
| `say('ship it')` again at once | nothing: inside 1.5 s it is the same command |
| wait 2 s, `say('ship it')` | no second blast; `voice.lastEvent.type` is `'cooldown'` |
| `say('throwback')` | rollback runs; `voice.lastEvent.alike` is `true`, `.heard` is `'throwback'` |
| `say('we shipped it and the fallback fired')` | nothing fires |
| `dropSession()` | within a frame or two `voice.running` is `true` again; `say('refactor')` clears the screen |
| `dropSession('not-allowed')` three times, a second apart | `voice.error` is `'Shoutr Flow stopped'`, `voice.running` is `false`, `mic.track()` is `null`; keys 1, 2 and 3 still fire the powers |

- [ ] **Step 7: Browser check, where it must not listen (Review Focus 1, 2 and 5)**

Reload, paste the stand-ins, `await voice.probe()`, PLAY NOW.

| Do | Expect |
|---|---|
| During the Waymo intro: `say('ship it')` | nothing fires; after the intro ends (ENTER), still nothing fires; `voice.remaining('ship')` is `0` |
| Press P | `voice.running` is `false` and `mic.track()` is `null` |
| On the pause screen: `say('refactor')` | `'not listening'` |
| Press P again | `voice.running` is `true`, `mic.track().readyState` is `'live'`; nothing fired from the pause |
| Pause, press T (quit to title) | on the title `voice.running` is `false`, `mic.track()` is `null` |
| A pass kept into a run (after Task 4): pass the mic check with `say('ship it')`, skip the intro, wait 8 s, `say('refactor')` | only refactor runs: the check's "ship it" does not fire in the level |
| PLAY NOW, run `setTimeout(() => console.log('hidden:', voice.running, mic.track()), 3000); document.addEventListener('visibilitychange', () => !document.hidden && console.log('on return, wanted:', voice.wanted))`, switch to another tab for 5 s and come back | the console shows `hidden: false null` and `on return, wanted: false` (the mic is not opened behind the pause screen); the game is on the pause screen (as on `master`) and stays not listening until resumed |
| In a run: `mic.track().dispatchEvent(new Event('ended'))` (the mic unplugged) | within a second `voice.running` is `true` again and `mic.track().readyState` is `'live'`: a new track, a new session |
| In a run: `voice.session.onerror({ error: 'language-not-supported' })` (the speech pack has gone) | `voice.error` is `'speech pack missing'`, `voice.running` is `false`, `mic.track()` is `null` |
| With `?boss` in the URL and god mode off: lose all health | on the death screen `voice.running` is `false`; ENTER (retry) brings it back to `true` |
| Settings stored with `mic: 'hold'` (see "Browser checks: how"), PLAY NOW, `say('ship it')` without holding M | nothing fires |
| At once (inside 1.5 s): hold M, `say('ship it')`, release M | fires once: the one that was dropped is not a fire for this to repeat |
| Tap M and release, wait 1 s, `say('ship it')` | nothing fires (the 600 ms tail has passed) |
| Settings stored with `mic: 'off'`, PLAY NOW | `voice.running` stays `false`, `mic.track()` stays `null` |

Then the phone path. Open `http://localhost:5173/?touch` (no stand-ins: a fresh page) and confirm in the console: `voice.onDevice` is `false`, `voice.hint` is `'keys'`. Start a run, press and hold the *talk* slot with the mouse: the slot turns green and the centre line reads `$ listening... let go to run it`, as on `master`. Release: it returns to grey.

- [ ] **Step 8: Commit**

```bash
cd ~/Developer/survive-coders && git add src/micStream.js src/voice.js src/run.js src/main.js src/scenes/Title.js && git commit -m "$(cat <<'EOF'
Shoutr Flow: on a keyboard, speech is recognised on the device, by a session that runs while a level is played

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The mic check, and the title that leads to it

**Files:**
- Create: `src/scenes/MicCheck.js`
- Modify: `src/main.js` (the scene list)
- Modify: `src/scenes/Title.js:37-77` and `:109-125`

**Interfaces:**
- Consumes: `voice.probe`, `voice.install`, `voice.local`, `voice.onDevice`, `voice.mode`, `voice.checkDue`, `voice.beginCheck`, `voice.endCheck`, `voice.error`, the `heard` and `command` events (Task 3); `mic.open`, `mic.level`, `mic.close` (Task 3); `micCheck.pass`, `micCheck.passed` (Task 2); `beginFromTitle` (Task 3).
- Produces: the scene `MicCheck`, started with `{ then: 'run' | 'title' | 'settings' }`. On a pass or a skip it starts the run, the `Title` scene, or the `Settings` scene with `{ from: 'mic' }`.

- [ ] **Step 1: Write the scene**

Create `src/scenes/MicCheck.js`:

```js
import Phaser from 'phaser';
import { voice } from '../voice.js';
import { mic } from '../micStream.js';
import { micCheck } from '../settings.js';
import { keymap } from '../keymap.js';
import { uiText } from '../util.js';
import { applyScreenFX } from '../fx.js';
import { terminalWindow } from '../terminal.js';
import { menu, textRow } from '../menu.js';
import { beginFromTitle } from '../run.js';

const QUIET_MS = 4000; // no sound at all for this long: say so
const NO_WORDS_MS = 6000; // sound, but no words
const TRIES = 3; // things said that were not a command
const LOUD = 0.02;
const METER = { x: 70, y: 292, w: 420, h: 12 };
const WHY = {
  blocked: 'The microphone is blocked: allow it from the address bar.',
  none: 'No microphone found.',
  failed: 'The microphone could not be opened.',
};

// The mic check: once per browser, between the title's PLAY NOW and the run (and from V on the
// title, or the settings screen, at any time). It fetches the speech pack if this browser has
// none, asks for the microphone, and has the player say a command: hearing one proves the
// whole chain before a fight depends on it. Nothing here is timed: the run clock starts in
// beginRun, after it.
export default class MicCheck extends Phaser.Scene {
  constructor() {
    super('MicCheck');
  }

  // data.then: where a pass or a skip leads: 'run' (from PLAY NOW), 'title' or 'settings'.
  create(data) {
    this.then = data?.then ?? 'title';
    this.sys.settings.data = {}; // Phaser would hand the next visit this one's data
    this.state = 'idle'; // idle | pack | mic | listen | passed
    this.left = false; // Phaser reuses this scene object: a second visit must not start as gone
    this.visit = (this.visit ?? 0) + 1;
    this.tries = 0;
    this.heardText = '';
    this.listenAt = this.soundAt = this.wordsAt = null;
    applyScreenFX(this.cameras.main);
    const win = terminalWindow(this, 'vibecoder@sf: ~/survive-coders - shoutr-flow --setup');
    const left = win.x + 30;
    uiText(this, left, 82, '$ shoutr-flow --setup', { size: 16, color: '#8b8b8b' });
    uiText(this, left, 118, 'SHOUTR FLOW', { size: 48, color: '#d97757' });
    const how = voice.mode === 'hold' ? `hold ${keymap.name('talk')} and say a power to run it` : 'say a power out loud to run it. no key.';
    uiText(this, left, 184, `your voice is a weapon: ${how}`, { size: 16, color: '#f5f5f5' });
    this.prompt = uiText(this, left, 226, '', { size: 48, color: '#39c5cf' });
    this.g = this.add.graphics();
    this.heardLine = uiText(this, left, 316, '', { size: 16, color: '#e3b341' });
    this.note = uiText(this, left, 346, '', { size: 16, color: '#f5f5f5', wrap: 820 });
    uiText(this, left, 386, 'Your voice is recognised on this computer. Nothing you say is sent anywhere.', { size: 16, color: '#8b8b8b' });
    if (this.then === 'run') uiText(this, left, 482, 'shown once. Shoutr Flow can be turned off in settings.', { size: 16, color: '#555555' });

    const rows = [
      textRow(this, left, 414, () => ({ idle: 'SET UP SHOUTR FLOW', pack: 'GETTING THE SPEECH PACK', mic: 'WAITING FOR THE MIC', listen: 'LISTENING', passed: 'HEARD YOU' })[this.state], {
        onPick: () => this.setUp(),
        enabled: () => this.state === 'idle',
      }),
      textRow(this, left, 446, this.then === 'run' ? 'PLAY WITH THE KEYS' : 'BACK', { onPick: () => this.leave(false) }),
    ];
    this.rows = rows;
    this.menu = menu(this, rows, { onBack: () => this.back() });

    const onHeard = (text, final) => {
      if (this.state !== 'listen') return;
      this.heardText = text;
      this.wordsAt = performance.now();
      if (final) this.tries++;
    };
    const onCommand = () => this.state === 'listen' && this.pass();
    voice.on('heard', onHeard);
    voice.on('command', onCommand);
    this.events.once('shutdown', () => {
      voice.off('heard', onHeard);
      voice.off('command', onCommand);
    });
    if (voice.local === 'downloadable') this.say('First time here: this fetches a speech pack (about 60 MB, once).');
  }

  say(text, bad = false) {
    this.note.setText(text).setTint(bad ? 0xe5534b : 0xf5f5f5);
  }

  to(state) {
    this.state = state;
    for (const row of this.rows) row.redraw();
    this.menu.refresh();
    if (state === 'idle') this.menu.select(0);
  }

  // Runs inside the key press or click that picked the row: the speech pack's download must be
  // asked for there, before anything is awaited.
  setUp() {
    if (this.state !== 'idle') return;
    const pack = voice.local === 'available' ? Promise.resolve(true) : voice.install();
    this.proceed(pack, voice.local !== 'available');
  }

  async proceed(pack, fetching) {
    // A wait here can outlive the visit: the download, or a mic prompt nobody answers. Phaser
    // reuses this scene object, and only leaves a scene on the next frame, so "still here" is
    // this visit and not left: an old wait must not carry on into the next visit, or a run.
    const visit = this.visit;
    const here = () => this.visit === visit && !this.left && this.sys.isActive();
    if (fetching) {
      this.to('pack');
      this.say('getting the speech pack (about 60 MB, once)...');
    }
    const got = await pack;
    if (!here()) return;
    if (!got) return this.fail("Couldn't get the speech pack. Try again, or play with the keys.");
    this.to('mic');
    this.say("allow the microphone in the browser's prompt");
    const opened = await mic.open();
    // Gone: close the mic this visit opened, unless a run has since taken it for itself.
    if (!here()) return void (voice.session || voice.opening || voice.checking || mic.close());
    if (!opened.ok) return this.fail(WHY[opened.reason]);
    await voice.beginCheck();
    if (!here()) return; // leaving has already ended the check
    if (voice.error) return this.fail(`${voice.error}. The keys always work.`);
    this.to('listen');
    this.say('');
    this.prompt.setText('say SHIP IT').setTint(0x39c5cf);
    this.listenAt = performance.now();
    this.soundAt = this.wordsAt = null;
    this.tries = 0;
  }

  fail(why) {
    voice.endCheck(false);
    this.prompt.setText('');
    this.heardLine.setText('');
    this.to('idle');
    this.say(why, true);
  }

  pass() {
    micCheck.pass();
    this.to('passed');
    this.say('');
    this.prompt.setText('✓ heard you').setTint(0x3fb950);
    this.time.delayedCall(600, () => this.leave(true));
  }

  // On to the run (keeping the session a pass left listening), or back where the check was
  // opened from.
  leave(passed) {
    if (this.left) return;
    this.left = true;
    if (this.then === 'run') {
      // A pass keeps its session, also when the keys row is picked in the moment after it.
      voice.endCheck(passed || this.state === 'passed');
      beginFromTitle(this);
      return;
    }
    voice.endCheck(false);
    if (this.then === 'settings') this.scene.start('Settings', { from: 'mic' });
    else this.scene.start('Title', {});
  }

  // ESC: from PLAY NOW's check it is a change of mind, back to the title.
  back() {
    if (this.then !== 'run') return this.leave(false);
    if (this.left) return;
    this.left = true;
    voice.endCheck(false);
    this.scene.start('Title', {});
  }

  update() {
    const g = this.g.clear();
    if (this.state !== 'listen' && this.state !== 'passed') return;
    const now = performance.now();
    const level = mic.level();
    if (level > LOUD) this.soundAt = now;
    g.fillStyle(0x1a1719).fillRect(METER.x, METER.y, METER.w, METER.h);
    g.fillStyle(0x3fb950).fillRect(METER.x, METER.y, Math.round(METER.w * Math.min(1, level / 0.25)), METER.h);
    this.heardLine.setText(this.heardText ? `heard "${this.heardText.slice(-44)}"` : '');
    if (this.state !== 'listen') return;
    if (voice.error) return this.fail(`${voice.error}. The keys always work.`);
    if (this.tries >= TRIES) this.say(`Heard "${this.heardText.slice(-30)}". Voice may be unreliable on this mic; the keys always work.`, true);
    else if (this.soundAt == null && now - this.listenAt > QUIET_MS) this.say('No sound is reaching the mic: check the input device in your system sound settings.', true);
    else if (this.soundAt != null && this.wordsAt == null && now - this.listenAt > NO_WORDS_MS) this.say('Heard sound but no words. Move closer, or check which microphone is selected.', true);
    else this.say('');
  }
}
```

- [ ] **Step 2: Register the scene**

In `src/main.js`, after `import Controls from './scenes/Controls.js';` add:

```js
import MicCheck from './scenes/MicCheck.js';
```

and in the game's `scene:` list, change `Settings, Controls, Leaderboard,` to `Settings, Controls, MicCheck, Leaderboard,`.

- [ ] **Step 3: The title's lines and its mic line**

In `src/scenes/Title.js`, replace the voice line in `lines` (line 42):

```js
      TOUCH ? `powers: tap the terminal bar${voice.supported ? ', or hold talk' : ''}` : `voice: HOLD ${key('talk')}, say a command, let go`,
```

with:

```js
      TOUCH
        ? `powers: tap the terminal bar${voice.supported ? ', or hold talk' : ''}`
        : { open: 'voice: say a command out loud', hold: `voice: HOLD ${key('talk')}, say a command, let go`, keys: 'powers: the keys below' }[voice.hint],
```

Replace the mic block (from the comment `// Explicit mic setup (V, or a tap)` down to and including `this.input.keyboard.on('keydown-V', primeMic);`) with:

```js
    // Mic setup, so a permission prompt never interrupts a run: on a keyboard V opens the mic
    // check (PLAY NOW leads to it once by itself); on a phone a tap asks for the mic. The keys
    // and the power taps always work.
    const micText = uiText(this, left + 520, 428, '', { size: 16 });
    const showMic = () => {
      if (TOUCH) {
        micText.setText(voice.primed ? 'mic ready ✓' : voice.supported ? 'tap: set up mic' : 'no speech: tap powers');
        micText.setTint(voice.primed ? 0x3fb950 : 0x8b8b8b);
        return;
      }
      const possible = voice.onDevice && voice.local !== 'unavailable';
      const how = { open: 'open', hold: `hold ${key('talk')}`, off: 'off' }[voice.mode];
      const set = possible && voice.ready;
      micText.setText(!possible ? 'needs Chrome on a computer' : voice.mode === 'off' ? 'V  Shoutr Flow: off' : set ? `V  Shoutr Flow: ${how} ✓` : 'V  set up Shoutr Flow');
      micText.setTint(set ? 0x3fb950 : 0x8b8b8b);
    };
    showMic();
    const primeMic = async () => {
      await voice.prime();
      showMic();
    };
    // The browser's answer about its speech pack decides the line, and whether PLAY NOW goes
    // by the check.
    if (!TOUCH) voice.probe().then(() => micText.active && showMic());
    const openCheck = () => voice.onDevice && voice.local && voice.local !== 'unavailable' && this.scene.start('MicCheck', { then: 'title' });
    this.input.keyboard.on('keydown-V', () => (TOUCH ? primeMic() : openCheck()));
```

Replace PLAY NOW's row:

```js
        textRow(this, left, 414, 'PLAY NOW', {
          onPick: (via) => {
            if (via === 'pointer') enterFullscreen();
            go();
          },
        }),
```

with:

```js
        textRow(this, left, 414, 'PLAY NOW', {
          onPick: (via) => {
            if (via === 'pointer') enterFullscreen();
            // Once per browser, the mic check comes first. It is before the run's clock.
            if (voice.checkDue) this.scene.start('MicCheck', { then: 'run' });
            else go();
          },
        }),
```

- [ ] **Step 4: Run the tests and the build**

Run: `cd ~/Developer/survive-coders && npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)' && npm run build 2>&1 | tail -3`
Expected: `ℹ tests 114`, `ℹ pass 114`, `ℹ fail 0`, and a clean build.

- [ ] **Step 5: Browser check, the check itself**

`npm run dev`, open `http://localhost:5173/`, `localStorage.removeItem('sc_mic_ok'); location.reload();`, paste the stand-ins, `await voice.probe()`, then go to SETTINGS and back (the title redraws its mic line).

| Do | Expect |
|---|---|
| Look at the title | the voice line reads `powers: the keys below`; the mic line reads `V  set up Shoutr Flow` in grey |
| PLAY NOW | the mic check, not the level: `SHOUTR FLOW`, two rows, `SET UP SHOUTR FLOW` selected; `run.state` is `'idle'` |
| ENTER on `SET UP SHOUTR FLOW` | the row reads `LISTENING` (greyed), the selection moves to `PLAY WITH THE KEYS`, the prompt reads `say SHIP IT` |
| Wait 5 s with `level(0.001)` | red: `No sound is reaching the mic: ...` |
| `level(0.2)`, wait 7 s | the meter fills; red: `Heard sound but no words. ...` |
| `say('hello there')` three times, 1 s apart | `heard "hello there"`; red: `Heard "hello there". Voice may be unreliable on this mic; the keys always work.` |
| `say('ship it')` | `✓ heard you` in green; about 0.6 s later level 1's intro starts; `localStorage.sc_mic_ok` is `'1'`; `voice.running` is `true`; `run.elapsed()` is under 2000 (the check was not timed) |
| Pause, T (title) | the mic line reads `V  Shoutr Flow: open ✓` in green; the voice line `voice: say a command out loud` |
| PLAY NOW | level 1 at once, no check |
| On the title, press V | the check, with `BACK` as its second row; `say('rollback')` after setting up passes it and returns to the title |

- [ ] **Step 6: Browser check, the ways it fails (Review Focus 3 and 4)**

Each from a fresh `localStorage.removeItem('sc_mic_ok'); location.reload();`, stand-ins pasted.

| Set up | Do | Expect |
|---|---|---|
| `window.pack = 'downloadable'; await voice.probe()` | PLAY NOW, then `SET UP` | the note first reads `First time here: this fetches a speech pack (about 60 MB, once).`; after the pick, `LISTENING`, and `window.pack` is `'available'` |
| `window.pack = 'downloadable'; SpeechRecognition.install = async () => false; await voice.probe()` | PLAY NOW, `SET UP` | red: `Couldn't get the speech pack. Try again, or play with the keys.`; the first row is `SET UP SHOUTR FLOW` again |
| `window.micFails = 'NotAllowedError'; await voice.probe()` | PLAY NOW, `SET UP` | red: `The microphone is blocked: allow it from the address bar.` |
| `window.micFails = 'NotFoundError'; await voice.probe()` | PLAY NOW, `SET UP` | red: `No microphone found.` |
| any of the above | `PLAY WITH THE KEYS` | level 1 starts; `voice.running` is `false`; keys 1, 2, 3 fire; `localStorage.sc_mic_ok` is `null`; back on the title, PLAY NOW offers the check again |
| the check open | ESC | the title |
| on the title: `window.pack = 'downloadable'; SpeechRecognition.install = () => new Promise((r) => (window.finishInstall = () => { window.pack = 'available'; r(true); })); await voice.probe()` | V, `SET UP` (it waits on the pack), ESC, V again, then `finishInstall()` | the second visit stays on `SET UP SHOUTR FLOW`: the first visit's wait does not carry on; `mic.track()` is `null` |
| a browser that has not passed | PLAY NOW, `SET UP`, `say('ship it')`, and at once ENTER (on `PLAY WITH THE KEYS`) | the run starts with `voice.running` `true` and voice working: the pass is kept |
| a browser that has passed, then `window.pack = 'downloadable'; await voice.probe()`, SETTINGS and back | look at the title, then PLAY NOW | the mic line reads `V  set up Shoutr Flow`; PLAY NOW goes by the check again (the pack has gone) |
| `window.pack = 'unavailable'; await voice.probe()` | PLAY NOW | level 1 at once; on the title the mic line reads `needs Chrome on a computer`; V does nothing |
| no stand-ins, a browser with no speech API at all: `window.SpeechRecognition = window.webkitSpeechRecognition = undefined; await voice.probe()` | SETTINGS and back, then PLAY NOW | the mic line reads `needs Chrome on a computer`; level 1 at once; no console error |

- [ ] **Step 7: Commit**

```bash
cd ~/Developer/survive-coders && git add src/scenes/MicCheck.js src/scenes/Title.js src/main.js && git commit -m "$(cat <<'EOF'
Shoutr Flow: a mic check before the first run, which proves the mic and costs the run no time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 5: The light, and hints that follow the mode

**Files:**
- Modify: `src/scenes/HUD.js:2`, `:94-100`, `:146-148`, `:391-404`
- Modify: `src/scenes/Level1.js:1-8` and `:81-87`
- Modify: `src/scenes/PlayScene.js:7` and `:221`

**Interfaces:**
- Consumes: `voice.hint`, `voice.running`, `voice.speaking`, `voice.listening`, `voice.error`, `voice.heard`, `voice.lastEvent.alike`, `powerKeys()`, `howTo(name, { short, first })` (Task 3).
- Produces: nothing other tasks use.

- [ ] **Step 1: The HUD's lines**

In `src/scenes/HUD.js`, change line 2 from `import { POWERS, voice } from '../voice.js';` to:

```js
import { POWERS, powerKeys, voice } from '../voice.js';
```

Replace:

```js
    // The status lines that name keys, built once: the map can't change during a run.
    const key = (action) => keymap.name(action);
    const powerKeys = Object.keys(POWERS).map(key).join(' ');
    this.lines = {
      powers: voice.supported ? `powers: ${powerKeys}, or hold ${key('talk')} and say one` : `powers: press ${powerKeys}`,
      full: `CONTEXT FULL → hold ${key('talk')}: "refactor" (or ${key('refactor')})`,
    };
```

with:

```js
    // The status lines that name keys, built once: the map and the mic's mode can't change
    // during a run. `say` is how voice is set up here: open, hold, or keys only (voice.js).
    const key = (action) => keymap.name(action);
    const keys = Object.keys(POWERS).map(key).join(' ');
    const say = (this.say = voice.hint);
    this.talkKey = key('talk');
    this.lines = {
      powers: { open: `powers: ${keys}, or just say one`, hold: `powers: ${keys}, or hold ${key('talk')} and say one`, keys: `powers: press ${keys}` }[say],
      full: {
        open: `CONTEXT FULL → say "refactor" (or ${key('refactor')})`,
        hold: `CONTEXT FULL → hold ${key('talk')}: "refactor" (or ${key('refactor')})`,
        keys: `CONTEXT FULL → press ${key('refactor')} for refactor`,
      }[say],
    };
```

In the pause screen's help, replace:

```js
      : [`${keymap.pair('left', 'right')} move   ${keymap.names('jump')} jump   ${key('fire')} fire`, ...powerLines, ...(voice.supported ? [`or hold ${key('talk')}, say the power, let go`] : [])];
```

with:

```js
      : [
          `${keymap.pair('left', 'right')} move   ${keymap.names('jump')} jump   ${key('fire')} fire`,
          ...powerLines,
          ...{ open: ['or just say the power out loud'], hold: [`or hold ${key('talk')}, say the power, let go`], keys: [] }[say],
        ];
```

- [ ] **Step 2: The light**

In `update`, replace the block that ends the function:

```js
    // Left: what the mic heard. Right: what actually happened (ran / cooling down) for ~2s,
    // otherwise the mic state. Speech recognized is not the same as a power firing.
    const heard = voice.heard ? `heard "${voice.heard.slice(-26)}"` : voice.listening ? 'listening...' : (cta ?? this.lines.powers);
    this.heard.setText(`$ ${heard}`).setTint(!voice.heard && !voice.listening && cta ? 0xe5534b : 0xf5f5f5);
    if (fresh && ev.type === 'fired') {
      this.mic.setText(`✓ ran: ${POWERS[ev.name].label}`);
      this.mic.setTint(0x3fb950);
    } else if (fresh && ev.type === 'cooldown') {
      this.mic.setText(`${POWERS[ev.name].label}: cooling down ${Math.ceil(ev.left / 1000)}s`);
      this.mic.setTint(0xe3b341);
    } else {
      this.mic.setText(`${voice.listening ? '●' : '○'} ${voice.status}`);
      this.mic.setTint(voice.listening ? 0x3fb950 : 0x8b8b8b);
    }
```

with:

```js
    // Left: what Shoutr Flow heard (it lapses after a moment). Right: what actually happened
    // (ran / cooling down) for ~2s, otherwise the light. Speech recognized is not the same as a
    // power firing; a power that ran on a sound-alike says so.
    const heard = voice.heard ? `heard "${voice.heard.slice(-26)}"` : (cta ?? this.lines.powers);
    this.heard.setText(`$ ${heard}`).setTint(!voice.heard && cta ? 0xe5534b : 0xf5f5f5);
    if (fresh && ev.type === 'fired') {
      this.mic.setText(`✓ ${ev.alike ? 'close enough' : 'ran'}: ${POWERS[ev.name].label}`);
      this.mic.setTint(0x3fb950);
    } else if (fresh && ev.type === 'cooldown') {
      this.mic.setText(`${POWERS[ev.name].label}: cooling down ${Math.ceil(ev.left / 1000)}s`);
      this.mic.setTint(0xe3b341);
    } else if (voice.error) {
      // Why voice stopped, in red, until it works again; the keys are the way on.
      this.mic.setText(`${voice.error}: ${powerKeys()}`);
      this.mic.setTint(0xe5534b);
    } else if (this.say === 'keys') {
      this.mic.setText('');
    } else {
      // The light: lit only while a session is really running, and white the moment a voice
      // comes in, from the mic's level. A result takes most of a second; this is what tells the
      // player they were heard, so they don't say it again. The game draws it, so it shows in
      // fullscreen, where the browser's own mark does not.
      this.mic.setText(`${voice.running ? '●' : '○'} Shoutr Flow${this.say === 'hold' ? `: hold ${this.talkKey}` : ''}`);
      this.mic.setTint(voice.speaking || voice.listening ? 0xf5f5f5 : voice.running ? 0x3fb950 : 0x8b8b8b);
    }
```

(The touch branch above it returns early and is not changed.)

- [ ] **Step 3: The tips**

In `src/scenes/Level1.js`, add after the `keymap` import:

```js
import { howTo } from '../voice.js';
```

and replace the two tips that name the talk key:

```js
      [640, `Swarmed? HOLD ${key('talk')}, say "refactor" (or press ${key('refactor')})`, 'Swarmed? Tap "refactor" below', 'refactor', () => this.lastPower === 'refactor' || this.player.x > SWARM_PAST_X],
```

with:

```js
      [640, `Swarmed? ${howTo('refactor', { first: true })}`, 'Swarmed? Tap "refactor" below', 'refactor', () => this.lastPower === 'refactor' || this.player.x > SWARM_PAST_X],
```

and:

```js
      [1760, `Save a big one for the park: HOLD ${key('talk')}, "ship it" (or ${key('ship')})`, 'Save a big one for the park: tap "ship it"', 'ship'],
```

with:

```js
      [1760, `Save a big one for the park: ${howTo('ship', { short: true })}`, 'Save a big one for the park: tap "ship it"', 'ship'],
```

In `src/scenes/PlayScene.js`, change line 7 from `import { voice } from '../voice.js';` to `import { howTo, voice } from '../voice.js';`, and in `teachRollback` replace:

```js
    this.toast(TOUCH ? 'Took a hit? Tap "rollback" below' : `Took a hit? HOLD ${keymap.name('talk')}, say "rollback" (or ${keymap.name('rollback')})`, 'rollback');
```

with:

```js
    this.toast(TOUCH ? 'Took a hit? Tap "rollback" below' : `Took a hit? ${howTo('rollback', { first: true })}`, 'rollback');
```

(In hold mode this tip gains one word, `press`: `HOLD M, say "rollback" (or press 2)`. The other two read exactly as on `master` in hold mode.)

- [ ] **Step 4: Run the tests, the build and the star count**

Run: `cd ~/Developer/survive-coders && npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)' && npm run build 2>&1 | tail -3 && npm run stars 2>&1 | tail -1`
Expected: `ℹ tests 114`, `ℹ pass 114`, `ℹ fail 0`, a clean build, and `total     382  (MAX_STARS 382)`.

- [ ] **Step 5: Browser check, each mode's words**

`npm run dev`, stand-ins pasted, `await voice.probe()`. For each row, set the state, start a run, and read the screen.

| State | The title's voice line | HUD, left | HUD, right | Tip at the first swarm (walk right to x 640) | Pause help's last line |
|---|---|---|---|---|---|
| `sc_mic_ok` = 1, mic `open` | `voice: say a command out loud` | `$ powers: 1 2 3, or just say one` | `● Shoutr Flow`, green | `Swarmed? Say "refactor" (or press 3)` | `or just say the power out loud` |
| `sc_mic_ok` = 1, mic `hold` | `voice: HOLD M, say a command, let go` | `$ powers: 1 2 3, or hold M and say one` | `● Shoutr Flow: hold M`, green | `Swarmed? HOLD M, say "refactor" (or press 3)` | `or hold M, say the power, let go` |
| `sc_mic_ok` = 1, mic `off` | `powers: the keys below` | `$ powers: press 1 2 3` | empty | `Swarmed? Press 3 for refactor` | no voice line |
| `sc_mic_ok` unset, then PLAY WITH THE KEYS | `powers: the keys below` | `$ powers: press 1 2 3` | empty | `Swarmed? Press 3 for refactor` | no voice line |

In the `open` state also:

| Do | Expect |
|---|---|
| `level(0.2)` | the light turns white; `level(0.001)`: green again within a second |
| `say('throwback')` | left: `$ heard "throwback"` for about 2.5 s, then the powers line again; right: `✓ close enough: rollback` in green for 2 s |
| `say('ship it')` | right: `✓ ran: ship it` |
| wait 2 s, `say('ship it')` again | right: `ship it: cooling down 4s` in yellow |
| With `?boss`, wait for the context to fill | left, in red: `$ CONTEXT FULL → say "refactor" (or 3)`; `say('refactor')` clears it |
| Press P | the light reads `○ Shoutr Flow` in grey behind the pause screen |

- [ ] **Step 6: Browser check, errors and long names (Review Focus 4 and 5)**

| Do | Expect |
|---|---|
| In a run, `dropSession('not-allowed')` three times, a second apart | right, in red: `Shoutr Flow stopped: keys 1/2/3`; it stays; the game plays on and the keys fire |
| Pause and resume | the red line is gone and the light is back (a fresh try); `say('ship it')` fires |
| `window.micFails = 'NotAllowedError'`, pause and resume | right, in red: `mic blocked: keys 1/2/3` |
| Bind talk to SPACE and the powers to SHIFT, NUM1 and NUM2 on the controls screen, mic `hold`, start a run | right: `● Shoutr Flow: hold SPACE`, clear of the last power slot; a red error reads `... : the keys`; the bottom hint shortens as it does on `master` |
| `http://localhost:5173/?touch`, start a run, pause | the HUD's centre line, the talk slot and the pause help read exactly as on `master` (`$ tap a power, or hold talk and say it`; `>_ fire   ↑ jump   powers: tap the bar, or hold talk and say one`) |

- [ ] **Step 7: Commit**

```bash
cd ~/Developer/survive-coders && git add src/scenes/HUD.js src/scenes/Level1.js src/scenes/PlayScene.js && git commit -m "$(cat <<'EOF'
Shoutr Flow: a light in the HUD, hints that follow the mic's mode, and "close enough" for a sound-alike

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The settings rows

**Files:**
- Modify: `src/scenes/Settings.js:5-13`, `:25-52`, `:79`

**Interfaces:**
- Consumes: `MIC_MODES`, `settings`, `micCheck` (Task 2); `voice.onDevice`, `voice.local` (Task 3); the `MicCheck` scene with `{ then: 'settings' }`, which returns with `{ from: 'mic' }` (Task 4).
- Produces: nothing other tasks use.

- [ ] **Step 1: Two rows, in a list that still fits its window**

Eleven rows and BACK do not fit at 36 px a row (BACK would sit at y 520 in a window that ends at 510), so the rows close up to 30 px: BACK at 454, clear of the hint at 476.

In `src/scenes/Settings.js`, change the settings import and add the voice import:

```js
import { MIC_MODES, REDUCED_MOTION, micCheck, settings } from '../settings.js';
```

```js
import { voice } from '../voice.js';
```

Under `const DOTS = 10;` add:

```js
const ROW_H = 30; // eleven rows and BACK, above the hint
```

In `create`, after the `toggle` helper, add:

```js
    // Shoutr Flow: how the mic listens on a keyboard. Where the browser can't recognise speech
    // on the device there is nothing to choose.
    const micPossible = voice.onDevice && voice.local !== 'unavailable';
    const micValue = () =>
      micPossible ? { open: 'open: say it, no key', hold: `hold ${keymap.name('talk')} to talk`, off: 'off: keys only' }[settings.get('mic')] : 'needs Chrome on a computer';
    const micStep = (dir = 1) => {
      if (!micPossible) return;
      const at = MIC_MODES.indexOf(settings.get('mic'));
      settings.set('mic', MIC_MODES[(at + dir + MIC_MODES.length) % MIC_MODES.length]);
    };
```

In `rows`, after the `run timer` row, add:

```js
      !TOUCH && ['Shoutr Flow', micValue, () => micStep(1), micStep],
      !TOUCH && micPossible && ['test microphone', () => (micCheck.passed() ? 'passed ✓' : 'not set up'), () => this.scene.start('MicCheck', { then: 'settings' }), () => {}],
```

Replace the three lines that lay the rows out and start the menu:

```js
    const items = rows.map((r, i) => (Array.isArray(r) ? this.row(win.y + 92 + i * 36, ...r) : r(win.y + 92 + i * 36)));
    const back = () => this.scene.start('Title', { from: 'settings' });
    items.push(textRow(this, X_LABEL, win.y + 92 + items.length * 36 + 2, 'BACK', { size: 16, onPick: back }));
    // Back from the controls screen: on the row that opened it.
    menu(this, items, { onBack: back, start: from === 'controls' ? rows.findIndex((r) => r[0] === 'controls') : 0 });
```

with:

```js
    const items = rows.map((r, i) => (Array.isArray(r) ? this.row(win.y + 92 + i * ROW_H, ...r) : r(win.y + 92 + i * ROW_H)));
    const back = () => this.scene.start('Title', { from: 'settings' });
    items.push(textRow(this, X_LABEL, win.y + 92 + items.length * ROW_H + 2, 'BACK', { size: 16, onPick: back }));
    // Back from the controls screen or the mic check: on the row that opened it.
    const opened = { controls: 'controls', mic: 'test microphone' }[from];
    menu(this, items, { onBack: back, start: opened ? rows.findIndex((r) => r[0] === opened) : 0 });
```

In `row`, the bounds follow the new height. Replace:

```js
      bounds: () => new Phaser.Geom.Rectangle(X_LABEL - 10, y - 8, 820, 32),
```

with:

```js
      bounds: () => new Phaser.Geom.Rectangle(X_LABEL - 10, y - 7, 820, ROW_H),
```

`voice.local` is already known on this screen: the title, which it is reached from, has run `voice.probe()`.

- [ ] **Step 2: Run the tests and the build**

Run: `cd ~/Developer/survive-coders && npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)' && npm run build 2>&1 | tail -3`
Expected: `ℹ tests 114`, `ℹ pass 114`, `ℹ fail 0`, and a clean build.

- [ ] **Step 3: Browser check**

`npm run dev`, stand-ins pasted, `await voice.probe()`, SETTINGS.

| Do | Expect |
|---|---|
| Look at the screen | eleven rows and BACK, none touching the hint line at the bottom; `Shoutr Flow    open: say it, no key`; `test microphone    not set up` (or `passed ✓`) |
| ↓ to `Shoutr Flow`, → twice, ← once | `hold M to talk`, then `off: keys only`, then `hold M to talk`; `JSON.parse(localStorage.sc_settings).mic` is `'hold'` |
| ENTER on `Shoutr Flow` | `off: keys only` (ENTER steps forward) |
| Click each of the eleven rows | the row under the pointer is the one selected and changed: no row answers for its neighbour |
| ENTER on `test microphone` | the mic check with `BACK`; pass it with `say('ship it')`; back on settings with `test microphone` selected, reading `passed ✓` |
| `window.pack = 'unavailable'; await voice.probe()`, SETTINGS | `Shoutr Flow    needs Chrome on a computer`, ← → do nothing, and no `test microphone` row |
| `http://localhost:5173/?touch`, SETTINGS | neither row is there; the screen is as on `master` but 6 px tighter a row |
| ESC, then reload, SETTINGS | the mode that was set is still set |

- [ ] **Step 4: Commit**

```bash
cd ~/Developer/survive-coders && git add src/scenes/Settings.js && git commit -m "$(cat <<'EOF'
Settings: Shoutr Flow's mode, and a row that tests the microphone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The README, and the whole thing once through

**Files:**
- Modify: `README.md` (the passages below)
- Modify: `docs/superpowers/specs/2026-10-02-open-mic-design.md` (one row of its Parts table)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: The opening paragraph, the stack table, the title screen**

In `README.md`, replace:

```
lie to you. The idea that shaped it is that your voice is a weapon: hold **M**, say *ship it*,
*rollback*, or *refactor*, and the power fires when you let go. Speech is never required;
every voice power has a keyboard key and a tap target on phones, and ordinary talking during a
demo fires nothing, because `src/voice.js` only acts on release and only on a recognized
command. It plays with a keyboard or, on phones and tablets, with touch controls.
```

with:

```
lie to you. The idea that shaped it is that your voice is a weapon: say *ship it*, *rollback*,
or *refactor* out loud and the power fires. The game calls it Shoutr Flow. In Chrome on a
computer the speech is recognised on the machine itself, so nothing said leaves it. Speech is
never required: every voice power has a keyboard key and a tap target on phones, and talk
about the game fires nothing, because `src/voiceMatch.js` only takes the whole phrase or a
word that sounds like it. It plays with a keyboard or, on phones and tablets, with touch
controls.
```

Replace `Voice      Web Speech API in the browser (Chrome or Edge), keys 1/2/3 or taps as fallback` with:

```
Voice      Speech recognised on the device (Chrome on a computer); hold-to-talk on phones; keys 1/2/3 or taps always
```

Replace `Tests      97 unit tests` with `Tests      114 unit tests`.

Replace the paragraph that begins `**1. Title screen.** A terminal window with the controls` (two lines, ending `SETTINGS.`) with:

```
**1. Title screen.** A terminal window with the controls, the vibe coder as key art, `V` to set
up Shoutr Flow, and a menu: PLAY NOW, LEADERBOARD, SETTINGS. The first PLAY NOW in a browser
goes by a mic check: say *ship it*, and the run starts when it is heard.
```

- [ ] **Step 2: The feature list, the controls table, the stack table**

Replace the bullet that begins `- Push-to-talk voice powers` with:

```
- Shoutr Flow: voice powers (`ship it`, `rollback`, `refactor`) said out loud with no key, recognised on the device in Chrome on a computer, with keyboard and tap equivalents; hold-to-talk and keys-only are settings; a mic check before the first run proves the microphone and names the reason when it fails; the HUD's light shows when it is listening and when it hears a voice, shows what was heard separately from what actually fired, says `close enough` when a sound-alike ran a power, and shows when a power is cooling down
```

In the controls table, replace the `Voice power` row with:

```
| Voice power | Say the command (or, with hold-to-talk set: hold M, say it, release) | Hold *talk* in the terminal bar, say it, release |
```

and the `Title screen` row with:

```
| Title screen | ↑ ↓ or W / S choose, Enter picks; V sets up Shoutr Flow | Tap PLAY NOW, LEADERBOARD, or SETTINGS; tap *set up mic* |
```

and the `Settings` row with:

```
| Settings | ↑ ↓ choose, ← → change, Enter toggles, Esc back; *controls* opens the key map; *Shoutr Flow* sets how the mic listens (open, hold, off) and *test microphone* opens the mic check | Tap a setting to change it; tap the volume dots to set a level |
```

In the stack-choices table, replace the `Voice` row with:

```
| Voice | The browser's Web Speech API, recognising on the device (`processLocally`) on a keyboard; push-to-talk through the browser's own recognizer on phones | No API key, no server, no cost, and on a computer no audio leaves the machine. It heard 24 of 24 test commands where the cloud recognizer heard 19 of 24. Keyboard keys cover every browser without it. |
```

- [ ] **Step 3: The architecture diagram**

Replace the line `│  src/voice.js ── hold M ──→ Web Speech API                              │` with (same width):

```
│  src/voice.js ── the mic ──→ speech recognition on the device (Chrome)  │
```

and the four lines under the box:

```
          trust boundary: in Chrome, microphone audio is sent to the
          browser vendor's speech service for recognition
                               ▼
                    browser speech recognition service
```

with:

```
          trust boundary: on a phone, hold-to-talk sends microphone audio
          to the browser vendor's speech service. On a computer nothing
          leaves the machine: Chrome recognises speech on the device.
                               ▼
              browser speech recognition service (phones only)
```

- [ ] **Step 4: The design decision**

Replace the whole of the section `### The design decision worth explaining` (its heading and the one paragraph under it, down to `one wins.`) with:

```
### The design decision worth explaining

Voice is the game's hook, and it shipped as push-to-talk: hold M, say the command, let go. That
was built for a loud demo room, where the presenter talks the whole time. Played alone from a
shared link it failed: measured on 2026-10-02, a held command fired 4 times in 9. The
recognizer only started when the key went down, so it missed the first syllable, and stopped
when the key came up, so letting go a moment early lost the word.

Shoutr Flow replaces it on a keyboard. The recognizer runs for as long as a level is being
played and a command fires the moment it is heard, with no key (hold-to-talk and keys-only are
settings). Three choices came from what was measured:

- **Recognised on the device.** Chrome can recognise speech on the computer itself
  (`processLocally`). It heard 24 of 24 commands where Chrome's cloud recognizer heard 19 of
  24, at the same speed, and nothing said leaves the machine. Browsers without it play with the
  keys; there is no cloud fallback on a keyboard.
- **No favoured phrases.** Chrome lets a page name phrases to favour. Favouring the three
  commands made the recognizer write them when nobody had said them (once, 34 times over in a
  single result), so the game favours none.
- **A list of sound-alikes, not a distance.** The recognizer writes "chip it" and "throwback".
  `src/voiceMatch.js` takes those, from a list of real words that never appeared in 677,000
  words of ordinary writing. A similarity threshold wide enough to catch "throwback" also
  caught "shipped", "react" and "fallback".

Commands are counted over the whole transcript, so one fires once however the recognizer
rewrites what it heard, and one heard during an intro or a pause is dropped, never saved for
later. A mic check before the first run proves the microphone works and names the reason when
it does not; it sits before the run's clock, so it costs a run no time. Every power also has a
key (1, 2, 3), so a failed microphone or another browser never blocks play. On phones voice is
still push-to-talk through the browser's own recognizer.
```

- [ ] **Step 5: The verification log and the limits**

Replace the row `| Push-to-talk parsing | The four cases in [Architecture](#the-design-decision-worth-explaining) pass with a simulated recognizer |` with these two rows. In the second, keep only the sentences whose check in Tasks 3 to 6 you ran and saw pass; if one failed and was fixed, say what it is now, not what the plan expected:

```
| Shoutr Flow's matching (2026-10-02) | Under `npm test`: a recorded session of the on-device recognizer's own events replays to 24 fires for the 24 commands said; a result in which the recognizer wrote "ship it" many times over fires once; "chip it", "throwback", "reflect it" and "reflector" fire their commands, and "we shipped it late", "the fallback" and "a React callback" fire nothing; a hold-to-talk command counts until 600 ms after the key comes up |
| Shoutr Flow in the game (2026-10-02) | With a stand-in recognizer and microphone: the session starts with a run and the mic's track ends on the pause screen, a hidden tab, a death, a win and the title; a command said during an intro or a pause never fires, then or later; a session that ends is started again, and three hard errors leave a red line and a game that plays on. The mic check fetches the speech pack, names a refused microphone, a missing one, silence, and sound without words, passes on a command and starts the run with the clock under two seconds; a browser that has passed, or has no on-device recognition, goes straight to the run. The HUD, the title, the tips and the pause screen name the right way to run a power in each of open, hold and off; a sound-alike reads `close enough`. Phones (`?touch`) are as before |
```

In the paragraph that begins `Not verified by automation:`, leave `real spoken commands through a microphone` as it is: it is still true.

Replace the first two bullets of `## Known limitations and what I would do next`:

```
- **Voice needs Chrome or Edge and a network connection**, and Chrome sends the audio to its
  speech service. Next: on-device recognition in the browser, so voice works offline and
  audio never leaves the machine.
- **No gameplay tests in CI.** The unit tests cover the rules, the clock, and the API; the
  gameplay checks above are scripted browser runs. Next: unit tests for the command parsing
  in `src/voice.js` and a headless smoke test (title, level, boss, win) in CI.
```

with:

```
- **Voice on a keyboard needs Chrome on a computer** and a one-time download of its speech
  pack (about 60 MB). Everywhere else the keys work and the game says so. Every number behind
  it is one speaker on one microphone in a quiet room: how often ordinary talk fires a power
  on the shipped setup was not measured. On phones, hold-to-talk still sends audio to the
  browser's speech service. Next: other voices and rooms, and voice on phones without that.
- **No gameplay tests in CI.** The unit tests cover the rules, the clock, the API and the
  command matching; the gameplay checks above are scripted browser runs. Next: a headless
  smoke test (title, level, boss, win) in CI.
- **Four screenshots above show the old voice hints** (`hold M to talk`). They are re-shot
  once this and the level 1 colour change are both on `master`.
```

- [ ] **Step 6: One row of the spec**

The phone's setup keeps `voice.prime()`, so the spec's Parts table is wrong to say it goes. In `docs/superpowers/specs/2026-10-02-open-mic-design.md`, in the `src/voice.js` row, replace `` `prime()` goes; the check replaces it.`` with `` `prime()` stays for phones; on a keyboard the check replaces it.``

- [ ] **Step 7: Everything, once**

Run: `cd ~/Developer/survive-coders && npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)' && npm run build 2>&1 | tail -3 && npm run stars 2>&1 | tail -1 && git status --short`
Expected: `ℹ tests 114`, `ℹ pass 114`, `ℹ fail 0`; a clean build; `total     382  (MAX_STARS 382)`; and the only modified tracked files are `README.md` and the spec.

Then one run in the browser, stand-ins pasted, from a browser that has not passed the check: PLAY NOW, set up, `say('ship it')`, play level 1 to the transit centre using `say()` for each power at least once and the keys for each at least once, pause and resume once, and finish the level. Expected: no console errors, and `voice.running` true whenever the level is being played.

- [ ] **Step 8: Commit**

```bash
cd ~/Developer/survive-coders && git add README.md docs/superpowers/specs/2026-10-02-open-mic-design.md && git commit -m "$(cat <<'EOF'
README: Shoutr Flow, what was measured to choose it, and what was checked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Stop here**

Do not push, merge or open a PR. Tell Travis the branch is ready, what was checked, and the two things only he can do: say the commands with his own voice in the real game, and decide when it goes to `master`.

---

## After this plan

- The four README screenshots that show the HUD's voice hints (04 to 07) are re-shot once this branch and `claude/level1-contrast` are both on `master`.
- Not measured, by Travis's choice on 2026-10-02: false fires in narration and room talk, and commands after a long quiet, on the shipped setup. `feed/shots/mic-probe/v2.html` has steps 10 to 13 ready if that changes. If open mic misfires in real play, the default in `src/settings.js` is one word.
