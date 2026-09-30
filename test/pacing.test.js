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
