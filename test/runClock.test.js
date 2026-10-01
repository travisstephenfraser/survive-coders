import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunClock, uuid } from '../src/runClock.js';
import { SEGMENT_FLOOR_MS, SPLITS } from '../shared/leaderboard.js';

// A clock driven by a fake time source.
function clockAt() {
  let t = 0;
  const clock = createRunClock(() => t);
  return { clock, set: (ms) => (t = ms) };
}

test('time counts from start to finish, pauses and hidden tabs included, then stops', () => {
  const { clock, set } = clockAt();
  set(500);
  clock.start();
  set(1000);
  clock.frame(500);
  set(6500); // paused, or the tab hidden: frames or none, the clock counts on
  assert.equal(clock.elapsed(), 6000);
  clock.finish();
  set(9000);
  assert.equal(clock.elapsed(), 6000);
  assert.equal(clock.state, 'finished');
});

test('each milestone keeps its first time and star count, in milestone order', () => {
  const { clock, set } = clockAt();
  clock.start();
  set(20000);
  clock.split('park', 90);
  set(30000);
  clock.split('park', 95); // a retry re-enters the park: ignored
  const s = clock.summary(90);
  assert.equal(s.splits[0], 20000);
  assert.equal(s.splitStars[0], 90);
  assert.equal(s.splits.length, SPLITS.length);
});

// A whole run: every milestone a little over its floor.
function fullRun(clock, set, { lastFrameMs } = {}) {
  let t = 0;
  let frames = 0;
  const stars = [90, 160, 190, 230, 250, 250, 262];
  SPLITS.forEach((name, i) => {
    t += SEGMENT_FLOOR_MS[i] + 2000;
    clock.frame(t - frames);
    frames = t;
    set(t);
    clock.split(name, stars[i]);
  });
  t += SEGMENT_FLOOR_MS.at(-1) + 2000;
  clock.frame(lastFrameMs ?? t - frames);
  set(t);
  clock.finish();
  return t;
}

test('a clean run summarizes as eligible', () => {
  const { clock, set } = clockAt();
  clock.start();
  const t = fullRun(clock, set);
  const s = clock.summary(300);
  assert.deepEqual(s.reasons, []);
  assert.equal(s.eligible, true);
  assert.equal(s.timeMs, t);
  assert.match(s.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('god mode and level-jump starts are not ranked', () => {
  const { clock, set } = clockAt();
  clock.start({ god: true, dev: true });
  assert.equal(clock.ranked, false);
  fullRun(clock, set);
  assert.deepEqual(clock.summary(300).reasons, ['god', 'dev']);
});

test('a clock that missed play time is caught against the frames drawn', () => {
  const { clock, set } = clockAt();
  clock.start();
  // the frames the game drew add up to a minute more than the clock kept
  fullRun(clock, set, { lastFrameMs: 60000 + SEGMENT_FLOOR_MS.at(-1) + 2000 });
  const s = clock.summary(300);
  assert.ok(s.reasons.includes('clock'), s.reasons.join());
  assert.equal(s.eligible, false);
});

test('a run that never reached a milestone fails the rules check', () => {
  const { clock, set } = clockAt();
  clock.start();
  set(200000);
  clock.finish();
  assert.deepEqual(clock.summary(10).reasons, ['splits']);
});

test('uuid is a v4 uuid even without crypto.randomUUID', () => {
  const saved = globalThis.crypto.randomUUID;
  try {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    assert.match(uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: saved, configurable: true });
  }
});
