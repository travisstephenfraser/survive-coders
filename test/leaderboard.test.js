import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_STARS,
  MIN_TIME_MS,
  SEGMENT_FLOOR_MS,
  SPLITS,
  SPLIT_STAR_CAPS,
  checkLink,
  checkName,
  checkRun,
  formatTime,
  parseProfile,
  profileUrl,
} from '../shared/leaderboard.js';

// A plausible finished run: each segment a little over its floor, stars climbing level by level.
function run(overrides = {}) {
  const splits = [];
  let t = 0;
  for (let i = 0; i < SPLITS.length; i++) splits.push((t += SEGMENT_FLOOR_MS[i] + 1000));
  const timeMs = t + SEGMENT_FLOOR_MS.at(-1) + 1000;
  return { stars: 300, timeMs, splits, splitStars: [90, 160, 190, 230, 250, 250, 262], ...overrides };
}

test('the star ceiling is the per-level maximums summed', () => {
  assert.equal(MAX_STARS, 382);
  assert.equal(SPLIT_STAR_CAPS.at(-1) + 95, MAX_STARS);
  assert.equal(MIN_TIME_MS, SEGMENT_FLOOR_MS.reduce((a, b) => a + b, 0));
});

test('checkRun accepts a plausible run and a perfect one', () => {
  assert.equal(checkRun(run()), null);
  assert.equal(checkRun(run({ stars: 382, splitStars: [...SPLIT_STAR_CAPS] })), null);
});

test('checkRun rejects impossible stars', () => {
  assert.equal(checkRun(run({ stars: 383 })), 'stars');
  assert.equal(checkRun(run({ stars: -1 })), 'stars');
  assert.equal(checkRun(run({ stars: 12.5 })), 'stars');
  assert.equal(checkRun(run({ stars: '300' })), 'stars');
});

test('checkRun rejects impossible times', () => {
  assert.equal(checkRun(run({ timeMs: MIN_TIME_MS - 1 })), 'time');
  assert.equal(checkRun(run({ timeMs: 13 * 3600 * 1000 })), 'time');
  assert.equal(checkRun(run({ timeMs: Number.NaN })), 'time');
});

test('checkRun rejects splits that are short, out of order, or malformed', () => {
  const ok = run();
  const tooFast = [...ok.splits];
  tooFast[0] = SEGMENT_FLOOR_MS[0] - 1;
  assert.equal(checkRun(run({ splits: tooFast })), 'splits');
  const backwards = [...ok.splits];
  [backwards[2], backwards[3]] = [backwards[3], backwards[2]];
  assert.equal(checkRun(run({ splits: backwards })), 'splits');
  assert.equal(checkRun(run({ splits: ok.splits.slice(1) })), 'splits');
  assert.equal(checkRun(run({ splits: [...ok.splits.slice(0, 6), 'x'] })), 'splits');
  // the last split has to leave the boss segment its floor too
  assert.equal(checkRun(run({ timeMs: ok.splits.at(-1) + SEGMENT_FLOOR_MS.at(-1) - 1 })), 'splits');
});

test('checkRun rejects split stars over a level cap, going down, or above the final count', () => {
  assert.equal(checkRun(run({ splitStars: [99, 160, 190, 230, 250, 250, 262] })), 'splits');
  assert.equal(checkRun(run({ splitStars: [90, 80, 190, 230, 250, 250, 262] })), 'splits');
  assert.equal(checkRun(run({ stars: 200 })), 'splits');
  // the boss room holds 95: 262 at the door can't finish above 357
  assert.equal(checkRun(run({ stars: 358 })), 'splits');
});

test('names are 1-16 printable ASCII characters, trimmed', () => {
  for (const ok of ['a', 'ada_l', 'Grace Hopper', '0123456789abcdef', '!~']) assert.equal(checkName(ok), null, ok);
  for (const bad of ['', ' ada', 'ada ', '0123456789abcdefg', 'José', 'a\tb', 'a\nb', 42, null]) {
    assert.equal(checkName(bad), 'name', String(bad));
  }
});

test('handles follow each platform rule, and no link at all is fine', () => {
  assert.equal(checkLink(null, null), null);
  const ok = [
    ['github', 'octocat'], ['github', 'a'], ['github', 'a-b-c'], ['github', 'x'.repeat(39)],
    ['linkedin', 'jane-doe-a1b2c3'], ['x', 'jack'], ['x', 'a'], ['x', 'under_score'],
    ['bluesky', 'alice.bsky.social'], ['bluesky', 'travis.dev'],
  ];
  for (const [p, h] of ok) assert.equal(checkLink(p, h), null, `${p}:${h}`);
  const bad = [
    ['github', 'a--b'], ['github', '-a'], ['github', 'a-'], ['github', 'x'.repeat(40)], ['github', 'a_b'],
    ['linkedin', 'ab'], ['linkedin', 'jean-françois'], ['x', 'sixteen_chars_xx'], ['x', 'a.b'],
    ['bluesky', 'UPPER.bsky.social'], ['bluesky', 'nodot'], ['bluesky', 'a.1com'],
    ['myspace', 'tom'], ['github', null], [null, 'octocat'], ['github', ''],
  ];
  for (const [p, h] of bad) assert.equal(checkLink(p, h), 'link', `${p}:${h}`);
});

test('profile URLs come only from the platform templates', () => {
  assert.equal(profileUrl('github', 'octocat'), 'https://github.com/octocat');
  assert.equal(profileUrl('linkedin', 'jane-doe'), 'https://www.linkedin.com/in/jane-doe');
  assert.equal(profileUrl('x', 'jack'), 'https://x.com/jack');
  assert.equal(profileUrl('bluesky', 'alice.bsky.social'), 'https://bsky.app/profile/alice.bsky.social');
  assert.equal(profileUrl('github', 'a--b'), null);
  assert.equal(profileUrl('javascript', 'alert(1)'), null);
});

test('parseProfile turns a pasted profile URL or @handle into platform + handle', () => {
  const cases = [
    ['https://github.com/octocat', { platform: 'github', handle: 'octocat' }],
    ['github.com/octocat/some-repo?tab=readme', { platform: 'github', handle: 'octocat' }],
    ['https://www.linkedin.com/in/jane-doe-a1b2c3/', { platform: 'linkedin', handle: 'jane-doe-a1b2c3' }],
    ['https://ca.linkedin.com/in/jane-doe/fr', { platform: 'linkedin', handle: 'jane-doe' }],
    ['https://twitter.com/jack', { platform: 'x', handle: 'jack' }],
    ['x.com/jack?s=20', { platform: 'x', handle: 'jack' }],
    ['https://bsky.app/profile/Alice.bsky.social', { platform: 'bluesky', handle: 'alice.bsky.social' }],
    ['@alice.bsky.social', { platform: 'bluesky', handle: 'alice.bsky.social' }],
    ['@octocat', { platform: null, handle: 'octocat' }],
    ['  octocat  ', { platform: null, handle: 'octocat' }],
  ];
  for (const [input, want] of cases) assert.deepEqual(parseProfile(input), want, input);
  assert.equal(parseProfile(''), null);
  assert.equal(parseProfile('https://evil.example/octocat'), null);
});

test('formatTime shows minutes, seconds and tenths, with hours when needed', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(75_500), '1:15.5');
  assert.equal(formatTime(754_321), '12:34.3');
  assert.equal(formatTime(3_723_450), '1:02:03.4');
});
