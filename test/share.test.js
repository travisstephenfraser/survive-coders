import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, decodeRun, encodeRun, placeOf, shareLine } from '../shared/share.js';
import { MAX_STARS } from '../shared/leaderboard.js';

test('every place a run can end maps from what the End screen knows', () => {
  assert.equal(placeOf({ win: true, retry: 'BossHQ' }), 'hq');
  assert.equal(placeOf({ retry: 'Level1', level: '~/sf/daly-city → soma' }), 'daly-city');
  assert.equal(placeOf({ retry: 'Level1', level: '~/sf/twin-peaks → soma' }), 'twin-peaks');
  assert.equal(placeOf({ retry: 'Level1', level: '~/sf/soma' }), 'soma');
  assert.equal(placeOf({ retry: 'Level1', level: undefined }), 'daly-city');
  assert.equal(placeOf({ retry: 'Park', level: '~/sf/salesforce-park → salesforce-tower' }), 'park');
  assert.equal(placeOf({ retry: 'Tower', towerFloor: 60 }), 'tower60');
  assert.equal(placeOf({ retry: 'Tower', towerFloor: 61 }), 'tower61');
  assert.equal(placeOf({ retry: 'Tower', towerFloor: null }), 'tower59');
  assert.equal(placeOf({ retry: 'Chute', level: '~/sf/salesforce-tower/61-ohana' }), 'chute');
  assert.equal(placeOf({ retry: 'BossHQ', level: '~/anthropic-hq' }), 'hydra');
  assert.equal(new Set(PLACES.map((p) => p.key)).size, PLACES.length);
});

test('the one-liner: stars first, where it ended, and the link', () => {
  const url = 'https://survive-coders.vercel.app/s/1-a-3x-ii';
  assert.equal(
    shareLine({ placeKey: 'tower61', stars: 141, timeMs: 754000 }, url),
    `141 stars, died on the Ohana Floor, 0.1 miles from Anthropic HQ. Can you get further? ${url}`,
  );
  assert.equal(shareLine({ placeKey: 'hydra', stars: 1, timeMs: 1 }, url), `1 star, died fighting the Hydra inside Anthropic HQ. Can you get further? ${url}`);
  assert.equal(shareLine({ placeKey: 'hq', stars: 300, timeMs: 1201200 }, url), `Daly City to Anthropic HQ: 300 stars in 20:01.2. ${url}`);
  assert.equal(shareLine({ placeKey: 'hq', stars: 382, timeMs: 1102400, rank: 4, posted: true }, url), `#4 on the Survive Coders board: 382 stars in 18:22.4. ${url}`);
  assert.equal(shareLine({ placeKey: 'hq', stars: 382, timeMs: 1102400, rank: null, posted: true }, url), `Daly City to Anthropic HQ: 382 stars in 18:22.4. ${url}`);
});

test('a /s/ code round-trips, and only its one canonical spelling decodes', () => {
  const run = { placeKey: 'tower61', stars: 141, timeMs: 754000 };
  const code = encodeRun(run);
  assert.equal(code, '1-a-3x-ky');
  assert.deepEqual(decodeRun(code), run);
  for (const p of PLACES) assert.equal(decodeRun(encodeRun({ placeKey: p.key, stars: MAX_STARS, timeMs: 0 })).placeKey, p.key);
  assert.equal(encodeRun({ placeKey: 'park', stars: 999, timeMs: 1499 }), encodeRun({ placeKey: 'park', stars: MAX_STARS, timeMs: 1000 }));
  const bad = ['', '1-a-3x', '2-a-3x-ky', '1-a-03x-ky', '1-A-3x-ky', '1-z-3x-ky', `1-a-${(MAX_STARS + 1).toString(36)}-ky`, '1-a-3x-ky-', '1-a-3x-ky\n', null, 42, 'x'.repeat(40)];
  for (const code of bad) assert.equal(decodeRun(code), null, JSON.stringify(code));
});
