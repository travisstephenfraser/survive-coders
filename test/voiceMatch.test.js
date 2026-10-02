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
  assert.equal(REPEAT_MS, 1500); // the spec's, decision 5
  assert.equal(replay([[0, 'ship it'], [REPEAT_MS - 1, 'ship it ship it']]).length, 1);
  assert.equal(replay([[0, 'ship it'], [REPEAT_MS, 'ship it ship it']]).length, 2);
});

test('a command heard where it cannot run is dropped, never kept for later', () => {
  const counter = createCounter();
  assert.deepEqual(counter.feed('ship it', 0, () => false), []);
  // The same words again, once it could run: they were counted when they were heard.
  assert.deepEqual(counter.feed('ship it', 5000), []);
});

test('a dropped command is not a fire for the next real one to be a repeat of', () => {
  const counter = createCounter();
  assert.deepEqual(counter.feed('ship it', 0, () => false), []);
  assert.deepEqual(names(counter.feed('ship it ship it', 500)), ['ship']);
  assert.deepEqual(counter.feed('ship it ship it', 600), []);
});

// The spec's list (decision 6), entry by entry: dropping one from the matcher must fail here.
test('every sound-alike on the list fires its command, and says it was only close', () => {
  const list = {
    ship: ['chip it', 'sheep it', 'cheap it', 'ship at', 'shop it'],
    rollback: ['throwback', 'throw back', 'role back', 'roll bag', 'row back', 'rule back', 'troll back'],
    refactor: ['refector', 'reflector', 'reflect it', 'refractor', 'reactor', 'refract it', 'reflect her'],
  };
  for (const [name, heard] of Object.entries(list)) {
    for (const text of heard) assert.deepEqual(replay([[0, text]]).map((f) => [f.name, f.alike]), [[name, true]], text);
  }
  const own = { 'ship it': 'ship', shipit: 'ship', rollback: 'rollback', 'roll back': 'rollback', refactor: 'refactor', 're-factor': 'refactor' };
  for (const [text, name] of Object.entries(own)) assert.deepEqual(replay([[0, text]]).map((f) => [f.name, f.alike]), [[name, false]], text);
});

test('a new session starts its count again', () => {
  const counter = createCounter();
  assert.equal(counter.feed('ship it', 0).length, 1);
  counter.reset();
  assert.equal(counter.feed('ship it', 5000).length, 1);
});

test('hold to talk: a command counts from key down until the tail after key up', () => {
  assert.equal(HOLD_TAIL_MS, 600); // the spec's, decision 7
  assert.equal(inHoldWindow(1600, 100, 1000), true);
  assert.equal(inHoldWindow(1601, 100, 1000), false);
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
