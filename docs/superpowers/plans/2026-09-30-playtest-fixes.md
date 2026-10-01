# Playtest Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what a playtest found: joke text and cutscene lines vanish before they can be read, the controls aren't learned, the Hydra has no ramp, the skyline rides up with the player, and the H100 doesn't stand out. Also lock controls during the boss entrance.

**Architecture:** One new pure module (`src/pacing.js`) owns every reading-time number and is unit-tested with `node --test`. Everything else is a targeted change to existing Phaser scenes and entities. Scene behavior is checked by scripted browser checks in `feed/shots/playtest.js` (dev-only, gitignored, like `feed/shots/capture.js`). Each check measures the real game and fails on the code before its task.

**Tech Stack:** Phaser 3.90 (Arcade physics), Vite 8, plain JS modules, `node --test`, Chrome DevTools MCP for the browser checks.

**Spec:** `docs/superpowers/specs/2026-09-30-playtest-fixes-design.md` (read it first, including its "Two corrections" section).

## Global Constraints

- Work on branch `claude/playtest-fixes`, stacked on `origin/claude/title-screen-credit-vqfi4n` (Travis's share work from 2026-09-29, 4 commits on `3e4a4ba`, not yet on master). Stacking avoids a `Title.js` conflict, and it means merging this branch ships the share work too, so the share work gets its Preview and smoke test first. `master` auto-deploys to production: no push, no merge, no PR without Travis's go. Before any push, run `git fetch` and check the behind count as a separate step, and read the result.
- Stage explicit paths only. `feed/` has unrelated uncommitted edits.
- The repo is public. Name no playtester, and include no emails. God mode stays undocumented.
- `npm run stars` must print `total     382  (MAX_STARS 382)`. Add no new `addStars(` call and no new write to `registry.set('stars'`.
- Only lengthen a segment of the run, never shorten one (the server rejects runs faster than `SEGMENT_FLOOR_MS` in `shared/leaderboard.js`).
- Keep every joke's text. This plan changes when lines appear and for how long, never what they say.
- Keep the Hydra's peak difficulty. `TURN_MS`, `MAX_GROWTH`, `BASE_HP`, `MAX_MINIONS`, `RESPAWN_MS`, `TELEGRAPH_MS` and the attack cadence formula stay as they are. The ramp's only easing is the first 10 s, and the notifications head makes up its skulls when it wakes (Task 7).
- Shared run cards (`shared/share.js` `placeOf`, from the share branch) read Level 1's neighbourhood labels, the tower floors and the scene keys passed as `retry`. Rename none of them.
- `scripts/count-stars.mjs` recognizes `addStars`'s definition by its exact text. Task 2 changes that signature and updates that one pattern, and nothing else in the guard changes.
- Leave the elevator's dialogue timing alone. The ding cutting Chad off mid-word is the joke.
- Match the surrounding code: comments explain why, in the codebase's voice. No em dashes.
- Browser checks reach the game through `window.game` only. The one exception is `/src/pacing.js`, which is stateless, so a second module instance after hot reload is harmless.
- Baseline before this plan (on the share branch): `npm test` 64 pass, 0 fail; stars 382; build ok.

## Review Focus

A red-team pass (2026-09-30) found where the first draft of this plan broke. These are the five inputs most likely to bite a player, each with a check assertion in the task that owns it:

1. **Pausing through the boss entrance or early in the fight.** The lock and the wake order must follow play time, not the wall clock. (Task 7, `hydraPause`.)
2. **Presses carried out of an intro.** A SPACE that skips an intro, a jump held through one, and a voice hold that straddles a lock. (Task 6, `skipInput` and `introLock`. The voice case needs a microphone, so it's checked in the Task 10 playthrough.)
3. **Two pop-ups crossing.** A kill's "+N★" and its held line must stay apart. (Task 2, `jokeHold`, `minGap`.)
4. **Shooting a sleeping head from the floor.** Auto-aim must not wear down or wake a head that can't hit back. (Task 7, `hydraSleep`.)
5. **The pause controls on a phone.** The new block must not overlap the sound and restart buttons at 844x390. (Task 4, `pauseHelp` with `?touch`.)

One accepted cost to look at, not assert: with the camera held still, a jump from one of the few highest platforms carries the player mostly off the top of the screen for a moment (Task 8, Step 4).

---

## Setup (before Task 1)

- [ ] **Branch off current master** (fetch first, as its own step, and read the output):

```bash
git -C ~/Developer/survive-coders fetch origin
git -C ~/Developer/survive-coders status -sb
```

Expected: `git log --oneline -1 origin/claude/title-screen-credit-vqfi4n` prints `f32c8b4 README: sharing a run, ...` (or a newer commit, if Travis pushed more), and `git rev-list --count origin/master..origin/claude/title-screen-credit-vqfi4n` prints 4 or more. Then:

```bash
git -C ~/Developer/survive-coders switch -c claude/playtest-fixes origin/claude/title-screen-credit-vqfi4n
```

The unrelated `feed/` edits carry over untouched. Don't stage them.

- [ ] **Start the dev server** (background, fixed port):

```bash
npm --prefix ~/Developer/survive-coders run dev -- --port 5199 --strictPort
```

- [ ] **Open the game** with the Chrome DevTools MCP: `new_page` at `http://localhost:5199/?fx=off`, `resize_page` to 1280x720, and wait for the title screen (`wait_for` text is unreliable on a canvas, so `evaluate_script` `() => Boolean(window.game?.scene.isActive('Title'))` until true).

**How a browser check runs** (used from Task 2 on). Checks outlive one devtools call, so they run in the background and print their result into the page:

1. `evaluate_script`: `() => import('/feed/shots/playtest.js?v=' + Date.now()).then((t) => t.start('NAME'))` (arguments go after the name, e.g. `t.start('dialogue', 'Park')`).
2. `wait_for` the text `CHECK DONE NAME` (timeout 60000).
3. `evaluate_script`: `() => window.__check`. It returns `{ ok, ...measurements }`.

---

### Task 1: Reading pace module

**Files:**
- Create: `src/pacing.js`
- Test: `test/pacing.test.js`

**Interfaces:**
- Produces: `TYPE_MS` (28), `READ_CPS` (17), `HOLD_MIN_MS` (1200), `FLOAT_MS` (900), `JOKE_HOLD_MS` (450), `lineMs(text) → ms`, `cardMs(text) → ms`, `sequence(start, durations) → { starts: number[], end: number }`. Tasks 2, 3 and the browser checks import these.

- [ ] **Step 1: Write the failing test**

`test/pacing.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOAT_MS, HOLD_MIN_MS, JOKE_HOLD_MS, TYPE_MS, cardMs, lineMs, sequence } from '../src/pacing.js';

// Known answers, worked by hand from the lines in the game.
test('a long typed line stays up for its reading time, the typing included', () => {
  const line = "We're pre-revenue but post-vibes. I'll circle back!"; // 51 characters
  assert.equal(lineMs(line), 3000); // 51 / 17 cps
  assert.ok(lineMs(line) > 1900, 'longer than the 1.9 s the park gave it before this fix');
});

test('a short typed line still gets HOLD_MIN_MS after its last letter', () => {
  const line = 'Rate your ride: ★★★★★?'; // 22 characters, each star one
  assert.equal(lineMs(line), 22 * TYPE_MS + HOLD_MIN_MS); // 1816
});

test('a card shown whole gets its reading time, never under HOLD_MIN_MS', () => {
  assert.equal(cardMs('also maybe dark mode'), HOLD_MIN_MS); // 20 chars read in 1176 ms
  assert.equal(cardMs("the office AI keeps forgetting what we tell it. that's not your change right?"), 4529);
});

test('sequence lays items back to back and says when the last is done', () => {
  assert.deepEqual(sequence(600, [4118, 1200]), { starts: [600, 4718], end: 5918 });
  assert.deepEqual(sequence(0, []), { starts: [], end: 0 });
});

test('a joke pop-up lasts 1.5x a status pop-up', () => {
  assert.equal(JOKE_HOLD_MS + FLOAT_MS, 1.5 * FLOAT_MS);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm --prefix ~/Developer/survive-coders test -- test/pacing.test.js`
Expected: FAIL, `Cannot find module '.../src/pacing.js'`.

- [ ] **Step 3: Write the module**

`src/pacing.js`:

```js
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
```

- [ ] **Step 4: Run the tests**

Run: `npm --prefix ~/Developer/survive-coders test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'ℹ (pass|fail)'`
Expected: `ℹ pass 69`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git -C ~/Developer/survive-coders add src/pacing.js test/pacing.test.js
git -C ~/Developer/survive-coders commit -m "Reading pace: one module for how long text stays up" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01C74BxrYDxsaerf1ymiEz2b"
```

---

### Task 2: Joke pop-ups hold before they fade

**Files:**
- Create: `feed/shots/playtest.js` (gitignored; not committed)
- Modify: `src/util.js:1,42-46`
- Modify: `src/scenes/PlayScene.js:8,385-388` (`addStars`)
- Modify: `scripts/count-stars.mjs:30` (the pattern that recognizes `addStars`'s own definition)
- Modify: `src/entities/enemies.js:2,52,130,212,284,309,322,422,453,477,483,547,592-599,613-619,624,671`
- Modify: `src/entities/Hydra.js:4,302,328`
- Modify: `src/scenes/BossHQ.js:4,150`
- Modify: `src/scenes/Tower.js:6,293`

**Interfaces:**
- Consumes: `FLOAT_MS`, `JOKE_HOLD_MS` from Task 1.
- Produces: `jokeText(scene, x, y, str, color = '#f5f5f5') → BitmapText` exported from `src/util.js` (`floatText` keeps its signature and behavior). `PlayScene.addStars(n, x, y, hold = false)`: with `hold`, the "+N★" pop holds and rises with a kill's line. Task 7 uses `jokeText` for the Hydra's wake line.

The red-team caught a side effect. A kill's "+N★" pop rose at once while its joke held still, so the two crossed and sat on top of each other at about 400 ms, on six enemy types. So a kill's reward now holds with its line. Two lines that start at the same height as their reward are nudged up so the pair stays apart, and the follow-up emails that spawn under a founder's death line stay quick.

- [ ] **Step 1: Write the check harness and the failing check**

`feed/shots/playtest.js`:

```js
// Playtest-fix checks (dev only: feed/*/ is gitignored). Each check drives the running game
// through window.game, measures what its fix is about, and fails on the code before that fix.
// Checks outlive one devtools call, so they run in the background:
//   start: () => import('/feed/shots/playtest.js?v=' + Date.now()).then((t) => t.start('jokeHold'))
//   wait:  wait_for text "CHECK DONE jokeHold"
//   read:  () => window.__check
import { goto, until, wait, sc, safe } from './capture.js';
import { FLOAT_MS, JOKE_HOLD_MS, cardMs, lineMs } from '/src/pacing.js';

const CHECKS = {};

export function start(name, ...args) {
  window.__check = { name, done: false };
  const show = (r) => {
    window.__check = { name, done: true, ...r };
    let el = document.getElementById('check-result');
    if (!el) {
      el = document.createElement('pre');
      el.id = 'check-result';
      el.style.cssText = 'position:fixed;left:0;bottom:0;margin:0;max-width:100vw;max-height:40vh;overflow:auto;background:#000c;color:#fff;font:11px monospace;z-index:9';
      document.body.append(el);
    }
    el.textContent = `CHECK DONE ${name} ${r.ok ? 'PASS' : 'FAIL'}\n${JSON.stringify(r, null, 1)}`;
  };
  CHECKS[name](...args).then(show, (e) => show({ ok: false, error: String(e?.stack ?? e) }));
  return 'started';
}

const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const find = (s, text) => s.children.list.find((o) => o.active && o.text === text);
// Phaser key presses without a keyboard: onDown/onUp are what Phaser's own listener calls.
const KEY_EVENT = { altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, location: 0 };
const hold = (key) => key.onDown({ ...KEY_EVENT, timeStamp: performance.now() });
const letGo = (key) => key.onUp({ ...KEY_EVENT, timeStamp: performance.now() });
// A power key as the voice module hears it (it listens on window for e.key).
const powerKey = (n) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: String(n) }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: String(n) }));
};

// A kill line and its "+N★" hold still together for JOKE_HOLD_MS, then rise and fade over
// FLOAT_MS, never closer than they started. A picked-up star's pop (a status line) still starts
// fading at once.
CHECKS.jokeHold = async () => {
  const s = await goto('Level1');
  safe(s.player);
  const h100 = s.enemies.getChildren().find((e) => e.constructor.name === 'H100');
  h100.die();
  const line = find(s, 'CUDA OOM');
  const reward = find(s, '+6★');
  let gone = null;
  line.once('destroy', () => (gone = s.time.now));
  s.addStars(1, 100, 100); // a pickup's pop
  const pickup = find(s, '+1★');
  const t0 = s.time.now;
  let minGap = Infinity;
  const sample = () => {
    if (line.active && reward.active) minGap = Math.min(minGap, Math.abs(reward.y - line.y));
  };
  await until(() => (sample(), s.time.now - t0 >= JOKE_HOLD_MS - 100), 5000, 'inside the hold');
  const held = { line: line.alpha, reward: reward.alpha, pickup: pickup.alpha };
  await until(() => (sample(), !line.active), 5000, 'line gone');
  const lifetime = gone - t0;
  const ok = held.line === 1 && held.reward === 1 && held.pickup < 1 && minGap >= 5 && Math.abs(lifetime - (JOKE_HOLD_MS + FLOAT_MS)) < 120;
  return { ok, held, minGap, lifetime };
};
```

- [ ] **Step 2: Run the check to see it fail**

Run it as described in Setup, with `NAME` = `jokeHold`.
Expected: `ok: false`, with `held.line` and `held.reward` about 0.6 and `lifetime` about 900.

- [ ] **Step 3: Add `jokeText` to `src/util.js`**

Add the import under the existing one on line 1:

```js
import { FLOAT_MS, JOKE_HOLD_MS } from './pacing.js';
```

Replace `floatText` (lines 42-46) with:

```js
// Text that rises and fades over the world. `hold` keeps it still and solid first.
function rise(scene, x, y, str, color, hold) {
  const t = worldText(scene, x, y, str, { color, depth: 50 });
  scene.tweens.add({ targets: t, y: y - 18, alpha: 0, delay: hold, duration: FLOAT_MS, onComplete: () => t.destroy() });
  return t;
}

// A status pop (+1★, GONG!, context +25%): quick, gone in FLOAT_MS.
export function floatText(scene, x, y, str, color = '#f5f5f5') {
  return rise(scene, x, y, str, color, 0);
}

// A joke (a kill line, an enemy's bark): it holds still for JOKE_HOLD_MS before the same rise
// and fade, 1.5x as long in all, so it can be read mid-fight.
export function jokeText(scene, x, y, str, color = '#f5f5f5') {
  return rise(scene, x, y, str, color, JOKE_HOLD_MS);
}
```

- [ ] **Step 4: A kill's reward holds with its line**

`src/scenes/PlayScene.js`: add `jokeText` to the `util.js` import on line 8. Replace `addStars` (lines 385-388) with:

```js
  // A kill's reward (hold) holds and rises with the kill's line, so the two never cross; a
  // pickup's pops at once.
  addStars(n, x, y, hold = false) {
    this.registry.set('stars', (this.registry.get('stars') ?? 0) + n);
    (hold ? jokeText : floatText)(this, x, y, `+${n}★`, '#e3b341');
  }
```

`src/entities/enemies.js:52`, in `Enemy.die`: change `if (this.reward) this.scene.addStars(this.reward, this.x, this.y - 10);` to:

```js
    if (this.reward) this.scene.addStars(this.reward, this.x, this.y - 10, true); // holds with the kill line
```

`scripts/count-stars.mjs:30` finds `addStars` calls by pattern and skips the definition by its exact text, which just changed. Update that one pattern:

```js
    const calls = count(text, /addStars\((?!n, x, y(, hold = false)?\) \{)/g);
```

Run `npm --prefix ~/Developer/survive-coders run -s stars`. Expected: no `addStars() calls, expected` line, and `total     382  (MAX_STARS 382)`. That the per-file call counts still match is what shows the guard still counts call sites, not the definition.

- [ ] **Step 5: Switch the joke lines to `jokeText`**

Add `jokeText` to each file's `util.js` import (`enemies.js:2`, `Hydra.js:4`, `BossHQ.js:4`, `Tower.js:6`). Then change exactly these calls from `floatText(` to `jokeText(`. Arguments stay the same, except the stray trailing size numbers (`, 6` and `, 7`, which `floatText` never read) are dropped, and the two marked lines move up to clear their reward:

| File:line | Line (after) |
|---|---|
| `enemies.js:130` blob death | ``jokeText(scene, x, y - 18, `"${Phaser.Utils.Array.GetRandom(BAD_PROMPTS)}"`, '#bc8cff');`` |
| `enemies.js:212` H100 death | `jokeText(this.scene, this.x, this.y - 16, 'CUDA OOM', '#3fb950');` |
| `enemies.js:284` founder pitch | `jokeText(s, this.x, this.y - 16, line, '#e3b341');` |
| `enemies.js:309` founder demo ends | `jokeText(this.scene, this.x, this.y - 18, escaped ? "wait, it's AI-native!" : 'it worked 5 min ago', '#e5534b');` |
| `enemies.js:322` founder death | `jokeText(s, x, y - 18, "I'll circle back!", '#f5f5f5');` |
| `enemies.js:422` coffee hit | `(pl) => jokeText(s, pl.x, pl.y - 16, '$9 pour-over', '#a8905e')` |
| `enemies.js:453` vested bro death | `jokeText(this.scene, this.x, this.y - 18, Phaser.Utils.Array.GetRandom(BRO_LINES), '#a8c8e8');` |
| `enemies.js:477` jogger bark | `jokeText(this.scene, this.x, this.y - 16, 'on your left!', '#f5f5f5');` |
| `enemies.js:483` jogger death | `jokeText(this.scene, this.x, this.y - 18, 'my Oura score!', '#f5f5f5');` |
| `enemies.js:547` CRM agent pitch | `jokeText(s, this.x, this.y - 16, Phaser.Utils.Array.GetRandom(AGENT_PITCHES), '#8fd0ff');` |
| `enemies.js:624` CRM agent death | `jokeText(this.scene, this.x, this.y - 18, Phaser.Utils.Array.GetRandom(AGENT_DEATHS), '#8fd0ff');` |
| `enemies.js:671` chatbot death (moved up, from `y - 14`) | `jokeText(this.scene, this.x, this.y - 18, 'escalating to a human...', '#8fd0ff');` |
| `Hydra.js:302` gaslight hit | `jokeText(scene, p.x, p.y - 20, 'controls? what controls?', '#bc8cff');` |
| `Hydra.js:328` head killed (moved up, from `y - 10`) | `jokeText(this.scene, head.x, head.y - 18, 'head -1', '#e5534b');` |
| `BossHQ.js:150` Furby | `jokeText(this, f.x, f.y - 20, phrase, '#ff9ecf');` |
| `Tower.js:293` chatbot logs off | `jokeText(this, bot.x, bot.y - 12, 'brb', '#8fd0ff');` |

These stay `floatText` (status lines, not jokes): `'VESTED'` (`enemies.js:430`) and `'unvested'` (`:444`, which fires on every shot). The follow-up emails' lines (`:339`) stay quick too, because they spawn right under a founder's held death line. So do `'notifications cleared'`, `'LAST HEAD: ENRAGED'`, `'context +25%'`, `'IMAGE FLOOD'`, `'new notification'`, a picked-up `+n★`, `'MAX'`, `'DING'`, `'GONG!'`, `'*tink*'`, `'*CRACK*'`, `'accepted!'`, `'context compacted'`, `'CONTEXT WINDOW FULL'`, `'context rot -1'`, `'contract voided: loophole!'`, and `shout()`. The Furby's `+5★` stays quick: it and the chatter start at the same height, and holding both would stack them.

- [ ] **Step 6: The sales team speaks one at a time and shoves on its own clock**

A closer's line now lasts 1.5x as long, so space the lines 1.5x apart. But `nextLine` was also each closer's shove cooldown (`onTouchPlayer`), so give shoving its own field, set on a spoken line exactly as `nextLine` used to be. The push rhythm doesn't change. In `enemies.js`, replace `say(line)` (lines 592-599) with:

```js
  say(line) {
    const s = this.scene;
    const now = s.time.now;
    if (now < this.nextLine || now < (s.closerLineAt ?? 0)) return;
    this.nextLine = now + 1350; // 1.5x, as the line itself now lasts 1.5x (jokeText)
    this.nextShove = now + 900; // the shove rhythm, unchanged from when nextLine paced it
    s.closerLineAt = now + 750;
    jokeText(s, this.x, this.y - 18, line, '#8fd0ff');
  }
```

In `onTouchPlayer` (lines 613-619), change `this.scene.time.now > this.nextLine` to:

```js
this.scene.time.now > (this.nextShove ?? 0)
```

- [ ] **Step 7: Run the check**

Run `jokeHold` again.
Expected: `ok: true`, `held.line` and `held.reward` both 1, `held.pickup` under 1, `minGap` 6, and `lifetime` about 1350.

- [ ] **Step 8: Build, stars, and commit**

```bash
npm --prefix ~/Developer/survive-coders run build 2>&1 | tail -2
npm --prefix ~/Developer/survive-coders run -s stars | tail -1
```

Expected: the build ends with `✓ built in`, and stars print `total     382  (MAX_STARS 382)`.

```bash
git -C ~/Developer/survive-coders add src/util.js src/scenes/PlayScene.js scripts/count-stars.mjs src/entities/enemies.js src/entities/Hydra.js src/scenes/BossHQ.js src/scenes/Tower.js
git -C ~/Developer/survive-coders commit -m "Kill lines and barks hold still before they fade, and a kill's reward holds with its line" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01C74BxrYDxsaerf1ymiEz2b"
```

---

### Task 3: Cutscene lines stay up long enough to read

**Files:**
- Modify: `src/scenes/Cine.js:1-10`
- Modify: `src/scenes/Elevator.js:1-15` (import `TYPE_MS` only; timing unchanged)
- Modify: `src/scenes/Level1.js:1-9,126-154`
- Modify: `src/scenes/Park.js:1-12,287-304`
- Modify: `src/scenes/Arrival.js:1-9,58,125`
- Modify: `src/scenes/Ride.js:1-27`
- Modify: `feed/shots/playtest.js` (append checks)

**Interfaces:**
- Consumes: `TYPE_MS`, `lineMs`, `cardMs`, `sequence` from Task 1.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing checks**

Append to `feed/shots/playtest.js`:

```js
// Every line and Slack card of an intro stays on screen at least as long as pacing.js says. A
// say()/phone() lasts until the next call on its channel (a clear, a hide, the next line) or the
// intro's end.
const INTROS = {
  Level1: { reg: { introSeen: false }, over: (s) => !s.cutscene },
  Park: { reg: { parkIntroSeen: false }, over: (s) => !s.cutscene },
  Arrival: { reg: {}, over: (s) => s.state === 'leaving' },
  Ride: { reg: {}, over: (s) => s.state === 'leaving' },
};

function tapCine(s, log) {
  const c = sc('Cine');
  const tap = (name, channel, textArg, need) => {
    const orig = Object.getPrototypeOf(c)[name];
    c[name] = function (...args) {
      log.push({ channel, text: textArg === null ? null : args[textArg], need, at: s.time.now });
      return orig.apply(this, args);
    };
  };
  tap('say', 'say', 1, lineMs);
  tap('phone', 'phone', 0, cardMs);
  tap('hidePhone', 'phone', null, null);
  return () => ['say', 'phone', 'hidePhone'].forEach((name) => delete c[name]);
}

CHECKS.dialogue = async (key) => {
  const { reg, over } = INTROS[key];
  const s = await goto(key, {}, reg);
  const log = [];
  const untap = tapCine(s, log);
  await until(() => over(s), 40000, `${key} intro over`);
  const end = s.time.now;
  const handoverX = s.player?.x; // the Park hands over control at the landing spot, not further on
  untap();
  const items = log
    .map((e, i) => ({ e, next: log.slice(i + 1).find((n) => n.channel === e.channel) }))
    .filter(({ e }) => e.text)
    .map(({ e, next }) => ({ text: e.text, shown: (next?.at ?? end) - e.at, need: e.need(e.text) }));
  const short = items.filter((i) => i.shown < i.need - 20);
  const ok = items.length > 0 && short.length === 0 && (key !== 'Park' || handoverX < 120);
  return { ok, items, short, handoverX };
};

// Enter halfway through the re-timed Waymo intro ends it cleanly: control back, overlay gone,
// and no line after the skip.
CHECKS.introSkip = async () => {
  const s = await goto('Level1', {}, { introSeen: false });
  const log = [];
  const untap = tapCine(s, log);
  const t0 = s.time.now;
  await until(() => s.time.now - t0 > 9000, 15000, 'mid-intro');
  s.skipIntro();
  const skippedAt = s.time.now;
  await wait(3000);
  untap();
  const after = log.filter((e) => e.at > skippedAt + 50 && e.text);
  const ok = !s.cutscene && s.player.visible && s.player.body.enable && !sc('Cine').sys.isActive() && after.length === 0;
  return { ok, cutscene: s.cutscene, cineActive: sc('Cine').sys.isActive(), linesAfterSkip: after.map((e) => e.text) };
};
```

- [ ] **Step 2: Run them to see them fail**

Run `dialogue` with arg `'Park'`. Expected: `ok: false`, with `short` including `"We're pre-revenue but post-vibes. I'll circle back!"` at `shown` about 1900 against `need` 3000, and `handoverX` about 234.
Run `dialogue` with `'Level1'`, `'Arrival'` and `'Ride'`. Expected: each `ok: false`. The Ride's `short` includes the "office AI keeps forgetting" card at `shown` about 3000 against `need` 4529.
Run `introSkip`. It may already pass; it guards the new schedule.

- [ ] **Step 3: One typewriter pace**

`src/scenes/Cine.js`: delete `const TYPE_MS = 28;` (line 10) and add to the imports:

```js
import { TYPE_MS } from '../pacing.js';
```

`src/scenes/Elevator.js`: delete line 15 (`const TYPE_MS = 28; // Cine's typewriter pace, so the ding lands on the last letter`) and add to the imports:

```js
import { TYPE_MS } from '../pacing.js'; // Cine's typewriter pace, so the ding lands on the last letter
```

- [ ] **Step 4: Re-time the Waymo intro**

`src/scenes/Level1.js`: add `import { cardMs, lineMs, sequence } from '../pacing.js';` to the imports. Replace lines 126-154 (from the `// ~12s to control` comment through `at(11900, () => this.endIntro());`) with:

```js
    // Every ping and line stays up long enough to read (pacing.js), so they take turns; the
    // beats hang off the lines, so the choreography holds: he hops out a beat into the second
    // line, and the car drives off still asking for a rating. About 17s, skippable.
    const PINGS = ["can you make one small change before the demo? it's literally one line", 'also maybe dark mode'];
    const LINES = ['You have arrived at the edge of my service area.', 'Anthropic HQ is 9.4 miles away. Please take your belongings.', 'Rate your ride: ★★★★★?'];
    const LAST_PING = 'btw the office AI has been acting weird today';
    const pings = sequence(600, PINGS.map(cardMs));
    const lines = sequence(pings.end, LINES.map(lineMs));
    const at = (ms, fn) => this.introEvents.push(this.time.delayedCall(ms, fn));
    this.introEvents = [];
    pings.starts.forEach((ms, i) => at(ms, () => cine.phone(PINGS[i])));
    at(lines.starts[0], () => {
      cine.hidePhone();
      cine.say('WAYMO', LINES[0]);
      this.sfx('start', 0.4);
    });
    at(lines.starts[1], () => cine.say('WAYMO', LINES[1]));
    at(lines.starts[1] + 900, () => {
      this.waymo.setTexture('waymo_open');
      p.setPosition(this.waymo.x - 5, 150).setVisible(true);
      p.body.enable = true;
      p.setVelocityY(-120);
      p.laptop.setPosition(p.x, p.y + 6).setVisible(true);
    });
    at(lines.starts[2], () => cine.say('WAYMO', LINES[2]));
    at(lines.starts[2] + 600, () => {
      this.waymo.setTexture('waymo');
      this.tweens.add({ targets: this.waymo, x: -80, duration: 1800, ease: 'Cubic.in' });
    });
    at(lines.end, () => {
      cine.say(null, null);
      cine.phone(LAST_PING);
    });
    at(lines.end + cardMs(LAST_PING), () => this.endIntro());
```

Known answer (from `src/pacing.js`): the lines start at 5918, 8742 and 12271 ms, and control returns at 16734 ms (was 11900).

- [ ] **Step 5: Re-time the gondola intro**

`src/scenes/Park.js`: add `import { cardMs, lineMs, sequence } from '../pacing.js';`. Replace lines 287-304 (from `const at = ...` through `at(9200, () => this.endIntro());`) with:

```js
    // Each line stays up long enough to read (pacing.js); you hop out a beat into the second,
    // before the founder promises to circle back.
    const LINES = ["Since we're stuck in this gondola for 90 seconds...", 'ever heard of Uber for gondolas?', "We're pre-revenue but post-vibes. I'll circle back!"];
    const PING = 'are you close?? demo is in 20 min';
    const lines = sequence(400, LINES.map(lineMs));
    const at = (ms, fn) => this.introEvents.push(this.time.delayedCall(ms, fn));
    this.introEvents = [];
    at(lines.starts[0], () => cine.say('FOUNDER', LINES[0]));
    at(lines.starts[1], () => cine.say('FOUNDER', LINES[1]));
    at(lines.starts[1] + 1700, () => {
      this.sfx('start', 0.4);
      p.setPosition(DOCK.x + 12, 150).setVisible(true);
      p.body.enable = true;
      p.setVelocity(40, -140);
      p.laptop.setPosition(p.x, p.y + 6).setVisible(true);
    });
    // Landed: stop there, rather than slide on toward the first founder while the intro plays out.
    at(lines.starts[1] + 1700 + 500, () => p.setVelocityX(0));
    at(lines.starts[2], () => cine.say('FOUNDER', LINES[2]));
    at(lines.end, () => {
      cine.say(null, null);
      this.tweens.add({ targets: this.gondola, x: FROM.x, y: FROM.y, duration: 2400, ease: 'Sine.in' });
    });
    at(lines.end + 400, () => cine.phone(PING));
    at(lines.end + 400 + cardMs(PING), () => this.endIntro());
```

Known answer: the hop at 5100 ms comes before the third line at 5496 ms (the gondola docks at 4200 ms), and control returns at 10837 ms (was 9200), with the player standing at about x 62. Before, the player slid right at 40 px/s until control returned: x 234 then, and x 271 with the longer intro, 14.5 px from the first founder.

- [ ] **Step 6: The drop-off waits for its rating to be read**

`src/scenes/Arrival.js`: add `import { lineMs } from '../pacing.js';`. Add two module constants under the imports:

```js
const ARRIVED = 'You have arrived at Anthropic HQ.';
const RATE = 'Rate your ride: ★★★★★?';
```

In `hopOut`, change `cine.say('WAYMO', 'You have arrived at Anthropic HQ.');` to `cine.say('WAYMO', ARRIVED);`. Replace line 58 with:

```js
    // The rating follows once the arrival has been read; the scene holds the walk-in's fade until
    // it has been read too (walkIn).
    this.readBy = 0;
    this.time.delayedCall(2400 + lineMs(ARRIVED), () => {
      if (this.state === 'leaving') return;
      cine.say('WAYMO', RATE);
      this.readBy = this.time.now + lineMs(RATE);
    });
```

In `walkIn`, replace `this.time.delayedCall(620, () => this.leave());` with:

```js
    this.time.delayedCall(Math.max(620, this.readBy - this.time.now), () => this.leave());
```

- [ ] **Step 7: The ride's Slack cards get their reading time**

`src/scenes/Ride.js`: add `import { cardMs, sequence } from '../pacing.js';`. Change line 21 to:

```js
const RIDE_MS = 12000; // ...and 1 minute this much later (room for the last Slack card to be read)
```

Keep `AUTO_START_MS` (line 22) as it is. Replace the `SLACK` array (lines 23-27) with:

```js
// Each card stays up as long as it did (3s) or long enough to read, whichever is longer.
const SLACK_TEXT = [
  'also can the one line do dark mode',
  "the office AI keeps forgetting what we tell it. that's not your change right?",
  'demo got moved up. you have 15 min',
];
const SLACK_AT = sequence(1600, SLACK_TEXT.map((t) => Math.max(3000, cardMs(t)))).starts;
const SLACK = SLACK_TEXT.map((t, i) => [SLACK_AT[i], t]);
```

Known answer: the cards start at 1600, 4600 and 9129 ms. `hidePhone` at `RIDE_MS - 500` = 11500 leaves the last card 2371 ms, which covers its `cardMs` of 2000.

- [ ] **Step 8: Run the checks**

Run `dialogue` for `'Level1'`, `'Park'`, `'Arrival'` and `'Ride'`, then `introSkip`.
Expected: every `ok: true` with `short: []`, and the Park's `handoverX` about 62. `introSkip` gives `linesAfterSkip: []` and `cineActive: false`.

- [ ] **Step 9: Tests, build, commit**

```bash
npm --prefix ~/Developer/survive-coders test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'ℹ (pass|fail)'
npm --prefix ~/Developer/survive-coders run build 2>&1 | tail -2
```

Expected: `ℹ pass 69`, `ℹ fail 0`, and the build ends with `✓ built in`.

```bash
git -C ~/Developer/survive-coders add src/scenes/Cine.js src/scenes/Elevator.js src/scenes/Level1.js src/scenes/Park.js src/scenes/Arrival.js src/scenes/Ride.js
git -C ~/Developer/survive-coders commit -m "Cutscene lines and Slack cards stay up long enough to read" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01C74BxrYDxsaerf1ymiEz2b"
```

---

### Task 4: The terminal bar teaches the keys, and pause shows the controls

**Files:**
- Modify: `src/voice.js:5-9` (POWERS gains `does`)
- Modify: `src/scenes/Title.js:2,50`
- Modify: `src/scenes/HUD.js:18-20,102-105,160-169,313`
- Modify: `feed/shots/playtest.js` (append check)

**Interfaces:**
- Produces: `POWERS[name].does` (a string: what the power does), used by Title and the pause screen. `HUD.helpText` (a BitmapText, visible only while paused).

- [ ] **Step 1: Write the failing check**

Append to `feed/shots/playtest.js`:

```js
// Paused: a controls block that clears the buttons and the terminal strip. The bar's idle line
// no longer pairs "ship it" with nothing.
CHECKS.pauseHelp = async () => {
  await goto('Level1');
  const hud = sc('HUD');
  await until(() => hud.sys.isActive() && hud.heard, 5000, 'HUD up');
  await wait(200);
  const idle = hud.heard.text;
  hud.setPaused(true);
  await wait(100);
  const help = hud.helpText;
  const b = help?.getBounds();
  const lowest = hud.restartBox.getBounds().bottom; // restart sits under sound on touch
  const ok = Boolean(help?.visible) && b.top > lowest + 8 && b.bottom < 474 && b.left >= 0 && b.right <= 960 && !idle.includes('ship it');
  const text = help?.text;
  hud.setPaused(false);
  return { ok, idle, text, bounds: b && [b.left, b.top, b.right, b.bottom], lowestButton: lowest };
};
```

- [ ] **Step 2: Run it to see it fail**

Run `pauseHelp`. Expected: `ok: false`, `idle: '$ hold M: "ship it"'`, and no `text`.

- [ ] **Step 3: Say what each power does, once**

`src/voice.js`, POWERS (lines 5-9). Add `does` to each entry, with the wording from the title screen:

```js
export const POWERS = {
  ship: { label: 'ship it', does: 'big forward blast', key: '1', cooldown: 6000, re: /\bship(ped|ping|s)?\b|\bshipit\b/ },
  rollback: { label: 'rollback', does: 'rewind 3s, heal', key: '2', cooldown: 8000, re: /\broll ?backs?\b|\brole ?back\b|\broll bag\b|\brollback\b/ },
  refactor: { label: 'refactor', does: 'clear enemies; shrink the Hydra', key: '3', cooldown: 10000, re: /\bre-? ?factor(ed|ing|s)?\b|\breactor\b|\brefractor\b/ },
};
```

`src/scenes/Title.js`: change line 2 to `import { POWERS, voice } from '../voice.js';` and line 50 to:

```js
    uiText(this, left + 280, 296, Object.values(POWERS).map((p) => p.does).join('\n'), { size: 16, color: '#f5f5f5' });
```

- [ ] **Step 4: The bar's idle line**

`src/scenes/HUD.js:313`: change `(cta ?? 'hold M: "ship it"')` to:

```js
(cta ?? (voice.supported ? 'powers: 1 2 3, or hold M and say one' : 'powers: press 1 2 3'))
```

- [ ] **Step 5: The controls block on the pause screen**

`src/scenes/HUD.js`: move the pause screen up to make room. Change lines 18-20 to:

```js
const SOUND_BTN = { x: 390, y: 246, w: 180, h: 42 };
// Paused, on every device: restart the level (under the sound toggle on touch).
const RESTART_BTN = { x: 390, y: TOUCH ? 300 : 246, w: 180, h: 42 };
```

On line 102, change the `pausedText` y from `250` to `190`. After the `pausedText` statement (ending `.setVisible(false);` near line 105), add:

```js
    // Paused: the controls and powers, for anyone the tips missed (a playtester spent three
    // minutes taking SPACE for "ship it"). Under the buttons, clear of the terminal strip.
    const powerLines = Object.values(POWERS).map((p) => `${TOUCH ? '' : `${p.key}  `}${p.label}: ${p.does}`);
    const help = TOUCH
      ? [`>_ fire   ↑ jump   powers: tap the bar${voice.supported ? ', or hold talk and say one' : ''}`, ...powerLines]
      : ['←→ move   ↑ W Z jump   SPACE fire', ...powerLines, ...(voice.supported ? ['or hold M, say the power, let go'] : [])];
    this.helpText = uiText(this, 480, TOUCH ? 362 : 316, help.join('\n'), { size: 16, color: '#c9d1d9', ox: 0.5, lineSpacing: 4 })
      .setCenterAlign()
      .setDepth(3)
      .setVisible(false);
```

In `setPaused` (after `this.restartText.setVisible(on);`), add:

```js
    this.helpText.setVisible(on);
```

- [ ] **Step 6: Run the check, desktop and touch**

Run `pauseHelp`. Expected: `ok: true`, `idle: '$ powers: 1 2 3, or hold M and say one'`, and `bounds` top above 474.
Then `navigate_page` to `http://localhost:5199/?fx=off&touch`, `resize_page` to 844x390, wait for the title, and run `pauseHelp` again. Expected: `ok: true`.
Screenshot both paused screens (`take_screenshot`, saved as `feed/shots/playtest-pause-desktop.png` and `feed/shots/playtest-pause-touch.png`). Look at them: no text overlaps a button, and each block reads as one column. Return to `?fx=off` at 1280x720.

- [ ] **Step 7: Commit**

```bash
git -C ~/Developer/survive-coders add src/voice.js src/scenes/Title.js src/scenes/HUD.js
git -C ~/Developer/survive-coders commit -m "Terminal bar teaches the keys; the pause screen lists the controls and powers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01C74BxrYDxsaerf1ymiEz2b"
```

---

### Task 5: The first two tips stay until you do the thing

**Files:**
- Modify: `src/scenes/PlayScene.js` (constants near the top, `buildWorld` resets at lines 30-36, `toast` at 185-189, `update` at 214-217, `fireStream` at 406, `firePrompt` at 436, `usePower` at 478-480)
- Modify: `src/scenes/Level1.js` (module constant, line 75 removed, beats at 77-83, beat loop at 96-98)
- Modify: `feed/shots/playtest.js` (append check)

**Interfaces:**
- Produces: `PlayScene.toast(text, power, ms = 4200, done = null)`. With a `done` function the tip has no timeout and clears (after `DONE_LINGER_MS`) once `done()` is true. Also `PlayScene.shots` (number of prompts or MAX characters fired this level) and `PlayScene.lastPower` (name of the last power that ran here, or null). Task 6's check reads neither.

- [ ] **Step 1: Write the failing check**

Append to `feed/shots/playtest.js`:

```js
// The SPACE tip stays past the old 4.2 s until you fire; the refactor tip until you refactor or
// walk past the swarm; and a tip that waits on you never follows you into the next level.
CHECKS.tips = async () => {
  const tipOf = (s) => {
    const t = s.registry.get('toast');
    return t && s.time.now < t.until ? t.text : '';
  };
  let s = await goto('Level1');
  safe(s.player);
  s.player.setPosition(80, s.player.y);
  await until(() => tipOf(s).includes('fires prompts'), 3000, 'SPACE tip');
  await wait(5000);
  const spaceStayed = tipOf(s).includes('fires prompts');
  hold(s.player.keys.fire);
  await wait(100);
  letGo(s.player.keys.fire);
  await wait(1200);
  const spaceCleared = !tipOf(s).includes('fires prompts');

  s.player.setPosition(650, s.player.y);
  await until(() => tipOf(s).includes('refactor'), 3000, 'refactor tip');
  await wait(5000);
  const refactorStayed = tipOf(s).includes('refactor');
  powerKey(3);
  await wait(1200);
  const refactorCleared = !tipOf(s).includes('refactor');

  s = await goto('Level1');
  safe(s.player);
  s.player.setPosition(650, s.player.y);
  await until(() => tipOf(s).includes('refactor'), 3000, 'refactor tip again');
  s.player.setPosition(930, s.player.y);
  await wait(1200);
  const passedCleared = !tipOf(s).includes('refactor');

  // A long tip, then a real scene change (not goto, which resets the registry itself) into a
  // level that doesn't clear tips on its own today. Read it before BossHQ's own card tip lands.
  s.toast('carry-over probe', null, 60000);
  s.scene.start('BossHQ');
  await wait(400);
  const noCarryOver = window.game.registry.get('toast') === null;
  const ok = spaceStayed && spaceCleared && refactorStayed && refactorCleared && passedCleared && noCarryOver;
  return { ok, spaceStayed, spaceCleared, refactorStayed, refactorCleared, passedCleared, noCarryOver };
};
```

- [ ] **Step 2: Run it to see it fail**

Run `tips`. Expected: `ok: false` with `spaceStayed: false`, `refactorStayed: false` (the tips expire at 4.2 s) and `noCarryOver: false` (BossHQ keeps a tip from the level before).

- [ ] **Step 3: PlayScene tracks shots and powers, and tips can wait on an action**

`src/scenes/PlayScene.js`. Under the `STREAM_COLORS` constant, add:

```js
const DONE_LINGER_MS = 800; // a tip you just acted on stays this long, so the change registers
```

In `buildWorld`, after `this.leaving = false;` (line 36), add:

```js
    this.shots = 0; // prompts and MAX characters fired in this level (the SPACE tip waits on one)
    this.lastPower = null; // the last power that ran here (the refactor tip waits on it)
    this.tipDone = null;
    this.registry.set('toast', null); // a tip waiting on you never follows you out of a level
```

Replace `toast` (lines 185-189, with its comment) with:

```js
  // One-shot contextual tip in the HUD; `power` pulses that power's slot (teach at the moment
  // of need, like Mario 1-1, instead of a wall of text on the title screen). With `done`, the tip
  // stays until done() is true (you did the thing), then lingers DONE_LINGER_MS.
  toast(text, power, ms = 4200, done = null) {
    this.tipDone = done;
    this.registry.set('toast', { text, power, until: done ? Infinity : this.time.now + ms, at: this.time.now });
  }
```

In `update`, directly after `this.player.tick(time);`, add:

```js
    if (this.tipDone?.()) {
      this.tipDone = null;
      const tip = this.registry.get('toast');
      if (tip) this.registry.set('toast', { ...tip, until: this.time.now + DONE_LINGER_MS });
    }
```

Count shots. Give `fireStream` (line 406) and `firePrompt` (line 436) each a new first line:

```js
    this.shots++;
```

In `usePower`, directly after `if (pl.dead || this.leaving) return; ...` (line 480), add:

```js
    this.lastPower = name;
```

- [ ] **Step 4: Level1's first two tips wait on you**

`src/scenes/Level1.js`. Under the `HOODS` constant, add:

```js
const SWARM_PAST_X = 920; // just past the first swarm's last blob (x 776-872): the refactor tip gives up here
```

Delete line 75 (`this.registry.set('toast', null);`); `buildWorld` does it now. Replace the beats (lines 77-83, comment included) with:

```js
    // x-position beats: [worldX, keyboard text, touch text (if different), power to pulse, done].
    // With `done`, the tip stays until you've done it (the first two), not for a fixed time.
    this.beats = [
      [70, 'SPACE fires prompts at bad prompts', '>_ fires prompts at bad prompts', null, () => this.shots > 0],
      [640, 'Swarmed? HOLD M, say "refactor" (or press 3)', 'Swarmed? Tap "refactor" below', 'refactor', () => this.lastPower === 'refactor' || this.player.x > SWARM_PAST_X],
      [1372, 'Too far to jump. Hop on the cable car roof', null, null],
      [1760, 'Save a big one for the park: HOLD M, "ship it" (or 1)', 'Save a big one for the park: tap "ship it"', 'ship'],
    ];
```

In `update`'s beat loop (lines 96-98), change the two lines to:

```js
      const [, keys, taps, power, done] = this.beats.shift();
      this.toast(TOUCH && taps ? taps : keys, power, undefined, done);
```

- [ ] **Step 5: Run the check**

Run `tips`. Expected: every field `true`, `ok: true`.

- [ ] **Step 6: Build and commit**

```bash
npm --prefix ~/Developer/survive-coders run build 2>&1 | tail -2
git -C ~/Developer/survive-coders add src/scenes/PlayScene.js src/scenes/Level1.js
git -C ~/Developer/survive-coders commit -m "The SPACE and refactor tips stay until you do the thing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01C74BxrYDxsaerf1ymiEz2b"
```

Expected: the build ends with `✓ built in`.

---

### Task 6: Intros own the controls: no moves, shots, or powers until they end

**Files:**
- Modify: `src/voice.js` (constructor, `press`, `release`, `trigger`)
- Modify: `src/scenes/PlayScene.js` (a getter; `update` at 214-216; the power hookup at 173-177)
- Modify: `src/entities/Player.js` (constructor; `tick` at 86 and the fire line at 141-144; new `swallowEdges` and `holdStill`)
- Modify: `src/scenes/BossHQ.js` (`create`, a getter, `introCard`'s tween)
- Modify: `feed/shots/playtest.js` (append checks)

**Interfaces:**
- Produces: `PlayScene.inputLocked` (getter, boolean: true during a cutscene, and in BossHQ until the title card clears). `BossHQ.introLock` (boolean). `voice.gate` (a function or null; while it returns true, `trigger` refuses without starting a cooldown, and a push-to-talk hold that begins or ends under it is dropped). `Player.swallowEdges()` and `Player.holdStill(time)`. `Player.fireLatched` (boolean; fire held since an intro needs a fresh press).

The red-team found four ways input leaked through an intro. A SPACE that skips an intro also fired a prompt. A jump held through an intro fired as it ended. A pause during the boss entrance let the lock's clock run out while the entrance itself stood still. A voice command released during a lock fired after it lifted. This task closes all four.

- [ ] **Step 1: Write the failing checks**

Append to `feed/shots/playtest.js`:

```js
// During the entrance: fire, move, jump and "ship it" do nothing and cost nothing. At the lift:
// a jump held through it doesn't fire, fire held through it needs a fresh press, and then fire
// and "ship it" work at once.
CHECKS.introLock = async () => {
  const s = await goto('BossHQ', {}, { bossIntroSeen: false });
  const p = s.player;
  safe(p);
  const k = p.keys;
  const hp = () => s.hydra.heads.reduce((n, h) => n + h.hp, 0);
  const hpBefore = hp();
  const x0 = p.x;
  hold(k.fire);
  hold(k.right);
  hold(k.jump);
  powerKey(1);
  await wait(100);
  const blastsEarly = s.blasts.countActive(); // a blast lives 1.2 s: sample it early
  await wait(1400);
  const during = { locked: s.inputLocked, bolts: s.bolts.countActive(), blastsEarly, moved: Math.abs(p.x - x0), shipCooldown: window.voice.remaining('ship') };
  letGo(k.right);
  await until(() => !s.inputLocked, 15000, 'the lock lifts');
  const vys = [];
  let boltsHeld = 0;
  for (let i = 0; i < 15; i++) {
    vys.push(p.body.velocity.y);
    boltsHeld = Math.max(boltsHeld, s.bolts.countActive());
    await wait(20);
  }
  letGo(k.jump);
  letGo(k.fire);
  const noCarriedJump = vys.every((v) => v >= 0);
  const hpAfter = hp();
  await wait(100);
  hold(k.fire);
  await wait(400);
  letGo(k.fire);
  const firesAfter = s.bolts.countActive() > 0;
  powerKey(1);
  await wait(100);
  const shipAfter = s.blasts.countActive() > 0;
  const ok = during.locked === true && during.bolts === 0 && during.blastsEarly === 0 && during.moved < 1 && during.shipCooldown === 0 && hpAfter === hpBefore && noCarriedJump && boltsHeld === 0 && firesAfter && shipAfter;
  return { ok, during, hpBefore, hpAfter, noCarriedJump, boltsHeld, firesAfter, shipAfter };
};

// Skipping the Waymo intro with fire held (a SPACE skip leaves it held) fires nothing, and a jump
// held through the intro doesn't fire as it ends; a fresh press fires at once.
CHECKS.skipInput = async () => {
  const s = await goto('Level1', {}, { introSeen: false });
  const p = s.player;
  const k = p.keys;
  const t0 = s.time.now;
  await until(() => s.time.now - t0 > 2000, 5000, 'into the intro');
  hold(k.jump);
  await until(() => s.time.now - t0 > 7000, 15000, 'mid-intro');
  hold(k.fire);
  s.skipIntro();
  const vys = [];
  let bolts = 0;
  for (let i = 0; i < 20; i++) {
    vys.push(p.body.velocity.y);
    bolts = Math.max(bolts, s.bolts.countActive());
    await wait(20);
  }
  letGo(k.fire);
  letGo(k.jump);
  await wait(100);
  hold(k.fire);
  await wait(300);
  letGo(k.fire);
  const firesAfter = s.bolts.countActive() > 0;
  const noCarriedJump = vys.every((v) => v >= -1);
  return { ok: bolts === 0 && noCarriedJump && firesAfter, boltsOnSkip: bolts, noCarriedJump, minVy: Math.min(...vys), firesAfter };
};
```

- [ ] **Step 2: Run them to see them fail**

Run `introLock`. Expected: `ok: false`, `during.locked` undefined, `during.bolts` above 0, and `hpAfter` below `hpBefore`.
Run `skipInput`. Expected: `ok: false`, with `boltsOnSkip` above 0 and `noCarriedJump: false` (about -368).

- [ ] **Step 3: Voice powers respect a gate, and a hold that touches a lock is dropped**

`src/voice.js`, constructor, after `this.keysSuspended = false; ...`:

```js
    this.gate = null; // set by the play scene: true while an intro owns the controls
    this.heldLocked = false; // this push-to-talk hold began under the gate
```

In `press()`, after `this.listening = true;`:

```js
    this.heldLocked = Boolean(this.gate?.());
```

In `release()`, directly after `this.listening = false;`:

```js
    // A hold that began or ends while an intro owns the controls is dropped, so Chrome's late
    // final result can't fire it after the intro lifts.
    if (this.heldLocked || this.gate?.()) {
      this.heldLocked = false;
      this.transcript = '';
      this.status = `hold ${TALK} to talk`;
      try {
        this.rec.abort();
      } catch {
        /* not running */
      }
      return;
    }
```

In `trigger`, change the first line to:

```js
    if (this.listenerCount('power') === 0 || this.gate?.()) return false; // refused, no cooldown spent
```

- [ ] **Step 4: PlayScene says when input is held, gates the powers, and swallows presses in cutscenes**

`src/scenes/PlayScene.js`. Add a getter just above `toast`:

```js
  // Whether an intro owns the controls. BossHQ adds its entrance and title card.
  get inputLocked() {
    return this.cutscene;
  }
```

Replace the power hookup (lines 173-177) with:

```js
    this.onPower = (name) => this.usePower(name);
    this.powerGate = () => this.inputLocked;
    voice.on('power', this.onPower);
    voice.gate = this.powerGate; // powers held during intros (1/2/3 used to fire under the Waymo's)
    this.events.once('shutdown', () => {
      voice.off('power', this.onPower);
      if (voice.gate === this.powerGate) voice.gate = null;
      this.music?.destroy();
    });
```

In `update`, make the first lines:

```js
  update(time) {
    if (this.cutscene) this.player.swallowEdges(); // presses during an intro don't fire after it
    if (this.cutscene || this.leaving) return; // an intro or the walk-in owns the player
```

(the second line is the existing one).

- [ ] **Step 5: The player drops presses made during an intro**

`src/entities/Player.js`. In the constructor, after `this.touchFireWas = false;`:

```js
    this.fireLatched = false; // fire held since an intro: needs a fresh press (swallowEdges)
```

In `tick`, directly after `if (this.dead) return;`:

```js
    if (this.scene.inputLocked) {
      this.holdStill(time);
      return;
    }
```

Replace the fire line (`const firing = !locked && (k.fire.isDown || k.fire2.isDown || k.fire3.isDown || touch.fire);`) with:

```js
    const fireHeld = k.fire.isDown || k.fire2.isDown || k.fire3.isDown || touch.fire;
    if (!fireHeld) this.fireLatched = false; // let go since an intro: fire works again
    const firing = !locked && !this.fireLatched && fireHeld;
```

Add these methods after `tick`:

```js
  // An intro owns the controls: presses made meanwhile are dropped, and fire held through its
  // end needs a fresh press (a SPACE that skipped an intro used to fire a prompt as well).
  // Velocity is left alone: the intros script the player's hop out of the car and the gondola.
  swallowEdges() {
    const k = this.keys;
    const JD = Phaser.Input.Keyboard.JustDown;
    for (const key of [k.jump, k.jump2, k.jump3]) JD(key);
    touch.takeJump();
    this.jumpBufferedUntil = 0;
    this.fireLatched = true;
  }

  // Controls held with the player in play (the Hydra's entrance): stand where you are.
  holdStill(time) {
    this.swallowEdges();
    this.setVelocityX(0);
    this.body.setGravityY(0);
    if (this.body.blocked.down) {
      this.stop();
      this.setTexture('player_idle');
    }
    this.laptop.follow(time);
  }
```

- [ ] **Step 6: BossHQ holds input until the title card clears**

`src/scenes/BossHQ.js`. In `create`, directly before `if (this.registry.get('bossIntroSeen')) {`:

```js
    this.introLock = true; // until the title card clears (introCard)
```

Add after `create()`:

```js
  // The entrance and the title card own the controls until the card clears: no moving, firing or
  // powers while the office is dimmed (a playtest found shots landing on the dormant heads). A
  // flag rather than a timestamp, so a pause can't run the lock out while the entrance stands still.
  get inputLocked() {
    return super.inputLocked || this.introLock;
  }
```

In `introCard`, in the tween's `onComplete`, add as its first line:

```js
        this.introLock = false;
```

- [ ] **Step 7: Run the checks**

Run `introLock` and `skipInput`. Expected: both `ok: true`.
Re-run `tips` (Task 5; it uses power key 3 outside any intro) and `introSkip` (Task 3). Expected: `ok: true`.
Also by hand: `evaluate_script` `() => import('/feed/shots/capture.js').then((c) => c.goto('Level1', {}, { introSeen: false }))`, then `() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })); return window.game.scene.getScene('Level1').blasts.countActive(); }`. Expected: `0` (today it fires under the Waymo intro).
The voice path (a push-to-talk hold across a lock) needs a microphone. Leave it to the playthrough in Task 10, and say so in the hand-back.

- [ ] **Step 8: Build and commit**

```bash
npm --prefix ~/Developer/survive-coders run build 2>&1 | tail -2
git -C ~/Developer/survive-coders add src/voice.js src/scenes/PlayScene.js src/entities/Player.js src/scenes/BossHQ.js
git -C ~/Developer/survive-coders commit -m "Intros own the controls: no moves, shots or powers until they end, and no press carries past them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01C74BxrYDxsaerf1ymiEz2b"
```

Expected: the build ends with `✓ built in`.

---

### Task 7: The Hydra's heads wake one at a time, on a clock that pauses

**Files:**
- Modify: `src/entities/Hydra.js` (constants after line 28; `Head` constructor at 57-76, `update` at 78-108, new `hurt`; `Hydra` gets `startFight` and `wake`; `lie` at 227-240; `headDied` at 327-345)
- Modify: `src/scenes/BossHQ.js` (`create`, `stagedEntrance` line 58, `introCard` line 90 and its tween)
- Modify: `src/scenes/PlayScene.js` (`firePrompt`'s target loop at 440-445)
- Modify: `feed/shots/playtest.js` (append checks)

**Interfaces:**
- Consumes: `jokeText` from Task 2 (already imported into `Hydra.js`); `BossHQ.introLock` from Task 6.
- Produces: `Head.asleep` (boolean), `Hydra.startFight()`, `Hydra.wake(head)`. `hydra.dormantUntil` is `Infinity` until the title card clears, then the fight's start time.

Design, as decided after the red-team:
- Heads wake at 0, 5 and 10 s after the title card clears, on scene timers, so a pause never skips the ramp.
- A sleeping head can't be hurt. Auto-aim skips it, so ordinary floor shots no longer wake the lowest head at once.
- The notifications head releases both skulls as it wakes, 1 s apart, so the fight past 10 s is as busy as today's.
- A head's death wakes the rest.
- The growth clock is untouched, so the overflow lands when it always has.

- [ ] **Step 1: Write the failing checks**

Append to `feed/shots/playtest.js`:

```js
const fightStarted = (hy) => Number.isFinite(hy.dormantUntil) && hy.scene.time.now >= hy.dormantUntil;

// Retry path (short card). Flood alone, gaslight at 5 s, notifications at 10 s with both skulls
// by 11.5 s, counted from when the card clears; the full context window lands when it did before.
CHECKS.hydraWake = async () => {
  const s = await goto('BossHQ', {}, { bossIntroSeen: true });
  safe(s.player);
  const hy = s.hydra;
  const born = s.time.now - hy.turnTimer.elapsed; // when the Hydra (and its turn clock) began
  const asleep = () => ['flood', 'gaslight', 'spawn'].map((r) => hy.heads.find((h) => h.role === r).asleep);
  await until(() => fightStarted(hy), 10000, 'fight');
  const start = hy.dormantUntil;
  const fightAt = (ms) => until(() => s.time.now >= start + ms, 20000, `fight+${ms}`);
  await fightAt(1000);
  const at1 = asleep();
  await fightAt(5300);
  const at5 = asleep();
  await fightAt(10300);
  const at10 = asleep();
  await fightAt(11500);
  const skulls = hy.minions.filter((m) => m.active && !m.dying).length;
  await until(() => hy.overflow.active, 30000, 'overflow');
  const overflowAt = s.time.now - born;
  const ok = eq(at1, [false, true, true]) && eq(at5, [false, false, true]) && eq(at10, [false, false, false]) && skulls === 2 && Math.abs(overflowAt - 24000) < 100;
  return { ok, at1, at5, at10, skulls, overflowAt };
};

// A sleeping head shrugs off a hit and floor shots (auto-aim skips it); a head's death wakes the
// rest, and the notifications head brings both skulls with it.
CHECKS.hydraSleep = async () => {
  const s = await goto('BossHQ', {}, { bossIntroSeen: true });
  const p = s.player;
  safe(p);
  const hy = s.hydra;
  const head = (r) => hy.heads.find((h) => h.role === r);
  await until(() => fightStarted(hy), 10000, 'fight');
  await wait(300);
  const spawnHp = head('spawn').hp;
  head('spawn').hurt(3);
  const shrugsOff = head('spawn').hp === spawnHp && head('spawn').asleep === true;
  hold(p.keys.fire); // from the floor at spawn, auto-aim used to bend every shot into this head
  await wait(1200);
  letGo(p.keys.fire);
  const aimSkips = head('spawn').hp === spawnHp && head('spawn').asleep === true;
  await until(() => s.bolts.countActive() === 0, 3000, 'bolts clear'); // stray bolts would kill the new skulls
  head('flood').hurt(999);
  await wait(150);
  const deathWakes = head('gaslight').asleep === false && head('spawn').asleep === false;
  const skullsSoon = hy.minions.filter((m) => m.active && !m.dying).length;
  await wait(1200);
  const skullsLater = hy.minions.filter((m) => m.active && !m.dying).length;
  const ok = shrugsOff && aimSkips && deathWakes && skullsSoon >= 1 && skullsLater === 2;
  return { ok, shrugsOff, aimSkips, deathWakes, skullsSoon, skullsLater };
};

// Pauses: one during the first attempt's entrance leaves it locked and dormant; one early in the
// fight doesn't eat the ramp (gaslight wakes after 5 s of play, not 5 s of wall clock).
CHECKS.hydraPause = async () => {
  let s = await goto('BossHQ', {}, { bossIntroSeen: false });
  safe(s.player);
  await wait(1000);
  sc('HUD').setPaused(true);
  await wait(8000);
  sc('HUD').setPaused(false);
  await wait(300);
  const entrance = { locked: s.inputLocked === true, dormant: !fightStarted(s.hydra), hazards: s.hazards.countActive(), plans: s.hydra.heads.filter((h) => h.plan).length };

  s = await goto('BossHQ', {}, { bossIntroSeen: true });
  safe(s.player);
  const hy = s.hydra;
  const gaslight = () => hy.heads.find((h) => h.role === 'gaslight');
  await until(() => fightStarted(hy), 10000, 'fight');
  const start = hy.dormantUntil;
  await until(() => s.time.now >= start + 2000, 5000, 'fight+2s');
  const r0 = performance.now();
  sc('HUD').setPaused(true);
  await wait(6000);
  sc('HUD').setPaused(false);
  const paused = performance.now() - r0;
  await wait(500);
  const asleepAfterResume = gaslight().asleep;
  await until(() => !gaslight().asleep, 10000, 'gaslight wakes');
  const wokeAtPlayMs = s.time.now - start - paused;
  const ok = entrance.locked && entrance.dormant && entrance.hazards === 0 && entrance.plans === 0 && asleepAfterResume === true && Math.abs(wokeAtPlayMs - 5000) < 200;
  return { ok, entrance, asleepAfterResume, paused, wokeAtPlayMs };
};
```

- [ ] **Step 2: Run them to see them fail, and record the peak's baseline**

Run `hydraWake`, `hydraSleep` and `hydraPause`. Expected: each `ok: false`. `hydraWake` shows every `asleep` value `undefined`, `hydraSleep` shows `shrugsOff: false`, and `hydraPause` shows `entrance.dormant: false` or `asleepAfterResume` undefined. **Write down `overflowAt`** from `hydraWake` (expected about 24000). That is today's peak timing, and it must not move.

- [ ] **Step 3: Constants**

`src/entities/Hydra.js`, after `const RESPAWN_MS = 1000;` (line 28):

```js
// The heads wake one at a time once the title card clears: image flood at once, gaslight 5s in,
// notifications 10s in (bringing both its skulls), so each is met alone before they fight
// together. Wakes run on scene timers, which pause with the game. Growth keeps its own clock
// (TURN_MS), so the full context window lands when it always has. A sleeping head can't be hurt,
// and a head's death wakes the rest.
const WAKE_MS = { flood: 0, gaslight: 5000, spawn: 10000 };
const ROLE_NAMES = { flood: 'IMAGE FLOOD', gaslight: 'GASLIGHT', spawn: 'NOTIFICATIONS' };
const ROLE_COLORS = { flood: '#58a6ff', gaslight: '#bc8cff', spawn: '#d97757' };
const SLEEP_TINT = 0x6b6b78;
```

- [ ] **Step 4: Heads start asleep, sleep without attacking, and shrug off hits**

In the `Head` constructor, after `this.plan = null;` (line 75):

```js
    // Asleep until its turn (Hydra.startFight): dimmed, and it neither attacks nor lies.
    this.asleep = WAKE_MS[role] > 0;
    if (this.asleep) {
      this.setTint(SLEEP_TINT);
      this.icon.setAlpha(0.4);
    }
```

In `Head.update`, directly after the dormancy block's closing `}` (the block that ends with `return;` after positioning the icon) and before `const warn = this.nextAttack - time;`:

```js
    if (this.asleep) {
      this.setPosition(x, y);
      this.icon.setPosition(x + 9 * this.scale, y - 9 * this.scale);
      return;
    }
```

Add after `onRefactor()`:

```js
  // Asleep, it shrugs shots off (a spark, no damage) until its turn, and auto-aim skips it
  // (PlayScene.firePrompt), so no head is worn down or woken early from the floor.
  hurt(dmg) {
    if (this.asleep) {
      this.scene.burst(this.x, this.y, 'px_white', 2);
      return;
    }
    super.hurt(dmg);
  }
```

- [ ] **Step 5: `startFight`, `wake`, awake-only lies, and deaths wake the rest**

In `class Hydra`, after `nextTurn()`:

```js
  // The title card has cleared (BossHQ.introCard): the fight starts now. First wind-ups keep
  // their stagger; sleeping heads wake on scene timers, which pause with the game.
  startFight() {
    const now = this.scene.time.now;
    this.dormantUntil = now;
    for (const h of this.alive) {
      h.nextAttack = now + 600 + STAGGER[h.role] + Math.random() * 400;
      if (h.asleep) this.scene.time.delayedCall(WAKE_MS[h.role], () => this.wake(h));
    }
  }

  wake(head) {
    if (!head.asleep || !head.active || head.dying) return;
    head.asleep = false;
    head.clearTint();
    head.icon.setAlpha(1);
    // A beat, then its first wind-up (TELEGRAPH_MS of warning before the attack lands).
    head.nextAttack = this.scene.time.now + TELEGRAPH_MS + 600 + Math.random() * 400;
    jokeText(this.scene, Phaser.Math.Clamp(head.x, 60, 260), this.bubbleY(head), `${ROLE_NAMES[head.role]} online`, ROLE_COLORS[head.role]);
    this.scene.burst(head.x, head.y, 'px_white', 8);
    this.scene.sfx('grow', 0.35);
    if (head.role === 'spawn') {
      // Both notifications arrive with it, a second apart, so the fight past 10s is as busy
      // as it always was.
      this.spawnMinion(head);
      this.scene.time.delayedCall(RESPAWN_MS, () => this.spawnMinion(head));
    }
  }
```

In `lie()`, change `const alive = this.alive;` to:

```js
    const alive = this.alive.filter((h) => !h.asleep); // a sleeping head doesn't talk
```

In `headDied`, make the first line inside the `this.scene.time.delayedCall(0, () => {` callback:

```js
      for (const h of this.alive) this.wake(h); // one down: the rest stop waiting their turn
```

- [ ] **Step 6: The fight starts when the card clears**

`src/scenes/BossHQ.js`. In `create`, directly after the `this.introLock = true;` line from Task 6:

```js
    this.hydra.dormantUntil = Infinity; // the fight starts when the title card clears (introCard)
```

Delete line 58 in `stagedEntrance` (`this.hydra.dormantUntil = this.time.now + cardAt + 2600;`). Delete the first line of `introCard` (`this.hydra.dormantUntil = Math.max(this.hydra.dormantUntil, this.time.now + INTRO_MS);`). In the card tween's `onComplete`, after `this.introLock = false;`, add:

```js
        this.hydra.startFight();
```

The entrance and the card were already timed by pausable timers and tweens. Now the fight's start is too, which also removes today's bug where a long pause let attacks start under the dimmed entrance.

- [ ] **Step 7: Auto-aim skips sleeping heads**

`src/scenes/PlayScene.js`, in `firePrompt`'s target loop, change `if (e.dying || !e.body) continue;` to:

```js
      if (e.dying || !e.body || e.asleep) continue; // a sleeping Hydra head can't be hurt
```

- [ ] **Step 8: Run the checks**

Run `hydraWake`, `hydraSleep` and `hydraPause`. Expected: each `ok: true`. `hydraWake` shows `at1 [false, true, true]`, `at5 [false, false, true]`, `at10 [false, false, false]`, `skulls: 2`, and an `overflowAt` within 100 ms of both 24000 and the baseline from Step 2.
Re-run `introLock` (Task 6). Expected: `ok: true`.
Screenshot the retry fight 2 s after the card clears as `feed/shots/playtest-hydra-ramp.png`. Look at it: one bright head and two dimmed.

- [ ] **Step 9: Stars, build, commit**

```bash
npm --prefix ~/Developer/survive-coders run -s stars | tail -1
npm --prefix ~/Developer/survive-coders run build 2>&1 | tail -2
git -C ~/Developer/survive-coders add src/entities/Hydra.js src/scenes/BossHQ.js src/scenes/PlayScene.js
git -C ~/Developer/survive-coders commit -m "Hydra: heads wake one at a time on a clock that pauses, peak unchanged" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01C74BxrYDxsaerf1ymiEz2b"
```

Expected: `total     382  (MAX_STARS 382)` and `✓ built in`.

---

### Task 8: The camera holds still vertically in the street levels

**Files:**
- Modify: `src/scenes/PlayScene.js:166` (`cam.startFollow`)
- Modify: `feed/shots/playtest.js` (append check)

**Interfaces:**
- Consumes: `this.parallax`, which Level1, Park and Tower set through `buildParallax` before they call `buildWorld` (Level1.js:54/67, Park.js:51/52, Tower.js:104/106). BossHQ never sets it.
- Produces: nothing new.

The red-team measured the playtester's complaint. These levels are 192 px tall in a 180 px view, so the camera's whole vertical range is 12 px. Every jump of 50 px or more used it all, dropping the ground 36 screen px while the pinned skyline stayed put, and sliding the street behind the HUD strip. Vertical parallax would only have cut that to 45-100% of today's slide. Holding the camera still removes it. The cost: from the few highest platforms (Level1 row 4; Park row 5; Tower rows 4-5), a jump carries the player mostly off the top for a moment. No star or platform sits in the rows the camera no longer shows.

- [ ] **Step 1: Write the failing check**

Append to `feed/shots/playtest.js`:

```js
// In the three skyline levels the camera stays at its resting height with the player raised to
// the top of the map; the boss arena (no skyline) still follows.
CHECKS.cameraLock = async () => {
  const levels = {};
  for (const [key, data, reg] of [['Level1', {}, {}], ['Park', {}, { parkIntroSeen: true }], ['Tower', { floor: 59 }, {}]]) {
    const s = await goto(key, data, reg);
    const p = s.player;
    safe(p);
    const cam = s.cameras.main;
    await wait(600);
    const rest = cam.worldView.y;
    p.body.setAllowGravity(false);
    p.setVelocity(0, 0);
    p.setPosition(p.x, 20);
    await wait(2000);
    levels[key] = { rest, up: cam.worldView.y };
    p.body.setAllowGravity(true);
  }
  const b = await goto('BossHQ', {}, { bossIntroSeen: true });
  safe(b.player);
  await until(() => !b.inputLocked, 5000, 'boss card');
  const bossRest = b.cameras.main.worldView.y;
  b.player.body.setAllowGravity(false);
  b.player.setVelocity(0, 0);
  b.player.setPosition(b.player.x, 20);
  await wait(2000);
  const bossUp = b.cameras.main.worldView.y;
  const ok = Object.values(levels).every((l) => l.rest === 12 && l.up === 12) && bossUp < bossRest;
  return { ok, levels, bossRest, bossUp };
};
```

- [ ] **Step 2: Run it to see it fail**

Run `cameraLock`. Expected: `ok: false`, with each level's `up` at 0.

- [ ] **Step 3: Hold the camera's height in the skyline levels**

`src/scenes/PlayScene.js`, replace line 166 (`cam.startFollow(this.player, true, 0.15, 0.06); // vertical follows slower (Eiserloh)`) with:

```js
    // The skyline levels hold the camera's height: they're 12px taller than the view, and a
    // camera rising that far on every jump slid the ground under a pinned skyline (a playtester
    // read it as the background riding up with them) and the street behind the HUD. The boss
    // arena has no skyline and still follows, slower vertically (Eiserloh).
    cam.startFollow(this.player, true, 0.15, this.parallax ? 0 : 0.06);
```

- [ ] **Step 4: Run the check, then look at it**

Run `cameraLock`. Expected: `ok: true`, every level at `rest: 12, up: 12`, and `bossUp` below `bossRest`.
Play it: in Level 1 jump along the first platforms (x 180-260). The skyline and street hold still, and the street stays above the HUD strip. Then jump from the highest platform in Level 1 (row 4, about x 1430-1510) and in `?park` (row 5), and take `feed/shots/playtest-camera-top.png` at the apex. The player goes mostly off the top for a moment, the accepted cost. If it reads badly, stop and tell Travis, since the dead-zone option exists.

- [ ] **Step 5: Build and commit**

```bash
npm --prefix ~/Developer/survive-coders run build 2>&1 | tail -2
git -C ~/Developer/survive-coders add src/scenes/PlayScene.js
git -C ~/Developer/survive-coders commit -m "Camera: hold still vertically in the skyline levels, so the background stops riding up with the player" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01C74BxrYDxsaerf1ymiEz2b"
```

---

### Task 9: The H100 hops with heat and vents steam

**Files:**
- Modify: `src/entities/enemies.js:173-215` (the `H100` class)
- Modify: `feed/shots/playtest.js` (append check)

**Interfaces:**
- Produces: `H100.hop(lift)` and `H100.steamFx`. Nothing outside the class uses them.

- [ ] **Step 1: Write the failing check**

Append to `feed/shots/playtest.js`:

```js
// The H100 hops (its drawn origin moves by about 2px) while its hitbox never leaves the floor.
CHECKS.h100Hop = async () => {
  const s = await goto('Level1');
  safe(s.player);
  const h = s.enemies.getChildren().find((e) => e.constructor.name === 'H100');
  const origins = [];
  const bottoms = [];
  const t0 = s.time.now;
  while (s.time.now - t0 < 3000) {
    origins.push(h.displayOriginY);
    if (h.body.blocked.down) bottoms.push(h.body.bottom);
    await wait(16);
  }
  const span = (a) => Math.max(...a) - Math.min(...a);
  const ok = span(origins) >= 1.5 && bottoms.length > 50 && span(bottoms) < 0.01 && Boolean(h.steamFx);
  return { ok, originSpan: span(origins), bottomSpan: span(bottoms), floorSamples: bottoms.length };
};
```

- [ ] **Step 2: Run it to see it fail**

Run `h100Hop`. Expected: `ok: false`, `originSpan: 0`.

- [ ] **Step 3: The heat hop and the steam**

`src/entities/enemies.js`, above `export class H100`:

```js
const HOP_MS = 180; // one heat hop, up and back down
const HOP_PX = 2;
```

In the `H100` constructor, after `this.play('gpu_fans');`:

```js
    // Heat hop (drawn only): about once a second the card jumps like a boiling lid and puffs
    // steam. hop() moves the draw origin and the body offset together, and an Arcade body sits at
    // x + scale * (offset - displayOrigin), so the hitbox, the patrol and the ledge checks never
    // see it.
    this.baseOrigin = this.height / 2;
    this.hopAt = -Infinity;
    this.nextHop = scene.time.now + Phaser.Math.Between(300, 1300); // out of step with its neighbours
```

In the `heatFx` particle config, change `frequency: 160,` to `frequency: 90, // a thicker plume`. After the `heatFx` statement, add:

```js
    this.steamFx = scene.add
      .particles(0, 0, 'px_white', {
        follow: this,
        followOffset: { x: 0, y: -10 },
        speedX: { min: -12, max: 12 },
        speedY: { min: -36, max: -18 },
        lifespan: 700,
        alpha: { start: 0.6, end: 0 },
        scale: { start: 1.6, end: 0.4 },
        emitting: false,
      })
      .setDepth(3);
```

Replace `this.once('destroy', () => this.heatFx.destroy());` with:

```js
    this.once('destroy', () => {
      this.heatFx.destroy();
      this.steamFx.destroy();
    });
```

Replace the start of `update(time)`, its first line `if (this.dying || this.stunned) return;`, with:

```js
    if (this.dying) return;
    if (time >= this.nextHop) {
      this.hopAt = time;
      this.nextHop = time + Phaser.Math.Between(900, 1300);
      this.steamFx.explode(5);
    }
    const t = time - this.hopAt;
    this.hop(t < HOP_MS ? Math.round(Math.sin((Math.PI * t) / HOP_MS) * HOP_PX) : 0);
    if (this.stunned) return;
```

Add a method after `update`:

```js
  hop(lift) {
    this.setDisplayOrigin(this.displayOriginX, this.baseOrigin + lift);
    this.body.setOffset(2, 3 + lift);
  }
```

- [ ] **Step 4: Run the check, then look at it**

Run `h100Hop`. Expected: `ok: true`, `originSpan` 2, `bottomSpan` 0.
Visual: `navigate_page` to `http://localhost:5199/?fx=off&debug`, open Level 1, and walk to the first H100 (x about 568). The card hops and puffs steam, and its debug body box stays put. Take `feed/shots/playtest-h100.png` mid-hop. Check the Hydra's GPU heap is unchanged (it uses the `gpu_fans` animation directly, not this class).

- [ ] **Step 5: Build and commit**

```bash
npm --prefix ~/Developer/survive-coders run build 2>&1 | tail -2
git -C ~/Developer/survive-coders add src/entities/enemies.js
git -C ~/Developer/survive-coders commit -m "H100: a heat hop and a steam puff about once a second, hitbox unmoved" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01C74BxrYDxsaerf1ymiEz2b"
```

---

### Task 10: README accuracy and the full verification

**Files:**
- Modify: `README.md` (the lines that the plan made false)

- [ ] **Step 1: Fix what's no longer true in the README**

- Walkthrough 3: "The intro hands over control after about 12 seconds" becomes "after about 17 seconds, each line up long enough to read".
- Walkthrough 4: after "…`rollback` is taught the first time you actually lose health, not at a fixed spot.", add "The first two tips, fire and `refactor`, stay up until you do the thing."
- Walkthrough 9: after "…and the boss card lands.", add "Your controls come back when the card clears. The image-flood head fights alone at first; gaslight wakes 5 seconds in and the notification head at 10, bringing both its skulls. A sleeping head shrugs off shots, and the context keeps growing on its own clock."
- Features: "A skippable, 12-second robotaxi intro cutscene" becomes "A skippable, 17-second robotaxi intro cutscene". In the Hydra bullet, after "…and a spawner whose notification skulls hunt you…" clause, add "; the heads wake one at a time". In the enemies bullet, "the H100 GPU (six hit points, vents arcing heat)" becomes "the H100 GPU (six hit points, hops with heat and vents arcing steam)".
- Controls table, the pause row: add "; the pause screen lists the controls and powers".
- Features, the platformer-feel bullet: "…squash and stretch, and camera lookahead" becomes "…squash and stretch, camera lookahead, and a camera that holds its height in the street levels".
- Test counts, from Step 2 (69 after this plan): the stack block's `Tests` line (says 51), "`npm test` runs 64 unit tests" in the Tests section, and the sample output's `ℹ pass 64`.

Leave the README screenshots alone. None of them shows a state this plan changes enough to mislead.

- [ ] **Step 2: Full verification**

```bash
npm --prefix ~/Developer/survive-coders test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'ℹ (pass|fail)'
npm --prefix ~/Developer/survive-coders run -s stars | tail -1
npm --prefix ~/Developer/survive-coders run build 2>&1 | tail -2
```

Expected: `ℹ pass 69`, `ℹ fail 0`, `total     382  (MAX_STARS 382)`, and `✓ built in`.

Then re-run every browser check in one pass, on `?fx=off` at 1280x720: `jokeHold`, `dialogue` for Level1, Park, Arrival and Ride, `introSkip`, `pauseHelp`, `tips`, `introLock`, `skipInput`, `hydraWake`, `hydraSleep`, `hydraPause`, `cameraLock`, `h100Hop`. Expected: every `ok: true`. Run `pauseHelp` once more under `?touch` at 844x390.

- [ ] **Step 3: One real playthrough**

Play `?boss` once without god mode, and Level 1 from the title with the intro unskipped. Watch for the things no check measures: the intro's rhythm, whether the Hydra's first 10 seconds read as a ramp, whether any pop-up now crowds another, and how a top-platform jump reads with the camera held. If a microphone is available, hold M across the end of the Waymo intro and say "ship it": nothing should fire.

- [ ] **Step 4: Commit the README, and hand back**

```bash
git -C ~/Developer/survive-coders add README.md
git -C ~/Developer/survive-coders commit -m "README: the intro's length, tips that wait, the Hydra's wake order, the H100's hop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01C74BxrYDxsaerf1ymiEz2b"
git -C ~/Developer/survive-coders log --oneline origin/claude/title-screen-credit-vqfi4n..HEAD
```

Expected: ten commits on `claude/playtest-fixes` (Tasks 1-10, one each), none pushed. Report the check results and the screenshots in `feed/shots/playtest-*.png` to Travis. Push, Preview and merge only on his go, each push after its own fetch and behind-count check.
