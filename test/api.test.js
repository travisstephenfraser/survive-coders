import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRows } from '../src/api.js';

test('board rows are re-checked before drawing, and links rebuilt from the platform template', () => {
  const rows = cleanRows([
    { rank: 1, name: 'ada_l', stars: 382, timeMs: 700000, platform: 'github', handle: 'ada' },
    { rank: 2, name: 'grace', stars: 300, timeMs: 800000, platform: 'github', handle: 'bad--handle' },
    { rank: 3, name: 'nolink', stars: 200, timeMs: 900000, platform: null, handle: null },
    { rank: 4, name: 'José', stars: 100, timeMs: 900000 },
    { rank: 5, name: 'toomany', stars: 999, timeMs: 900000 },
    { rank: 6, name: 'js', stars: 10, timeMs: 900000, platform: 'javascript', handle: 'alert(1)' },
    null,
  ]);
  assert.deepEqual(
    rows.map((r) => [r.rank, r.name, r.url]),
    [
      [1, 'ada_l', 'https://github.com/ada'],
      [2, 'grace', null],
      [3, 'nolink', null],
      [6, 'js', null],
    ],
  );
});

test('a board that is not a list draws as empty', () => {
  assert.deepEqual(cleanRows(undefined), []);
  assert.deepEqual(cleanRows({ rank: 1 }), []);
});
