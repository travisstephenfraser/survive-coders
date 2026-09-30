import test from 'node:test';
import assert from 'node:assert/strict';
import { offensive } from '../api/_lib/words.js';

// Known answers both ways: a check that refused everything, or nothing, would fail one list.
const REFUSED = [
  'fuck', 'FUCK', 'fuuuck', 'sh1t', '$hit', 'b1tch', 'c0ck', 'BigDick', 'dickhead', 'cunt', 'wanker',
  'slut99', 'p0rn', 'fag', 'ret4rd', 'whore', 'shithead', 'fk you', 'kike', 'tits', 'xX_n1gga_Xx',
  // the additions: spelled-out letters (with symbols between, or a one-letter word beside them),
  // underscores as word breaks, and the verb a looser surname exception let through
  'f.u.c.k', 'f u c k', 's-h-i-t', 'f!u!c!k', 's|h|i|t', 'I a s s', 'a s s I', '1 f a g', 'x w h o r e',
  'u a s s h o l e', 'big_ass', 'cumming', 'im cumming',
];
const ALLOWED = [
  'Scunthorpe', 'Dickens', 'assassin', 'Assange', 'analyst', 'cocktail', 'Hancock', 'Peacock', 'Cockburn',
  'Sussex', 'Essex', 'Middlesex', 'Shitake', 'kumquat', 'Titus', 'Arsenal', 'therapist', 'grape', 'Nigel',
  'Niger', 'Montenegro', 'Matsushita', 'cocoa', 'class act', 'Kung Fu Panda', 'Uranus', 'Sextant',
  'Hydra Slayer', 'ShadowFax', 'NoobMaster69', 'xX_Sniper_Xx', 'Bass Player', 'grasshopper', 'John Smith',
  'bsky.social', 'T.J. Miller', 'A.B.C.', 'R2-D2', 'U S A', 'I C U', 'P U N K', 'S.H.I.E.L.D.', 'A.S.S.E.T.S',
  // the additions: surnames and a mushroom the word set refuses, and words that stay apart
  'shiitake', 'Dickson', 'Dickinson', 'Dickerson', 'Cummings', 'Fukuda', 'Fukushima', 'pen island',
];

test('profanity and slurs are refused, disguised or not', () => {
  assert.deepEqual(REFUSED.filter((s) => !offensive(s)), []);
});

test('ordinary words, names and places that contain one are allowed', () => {
  assert.deepEqual(ALLOWED.filter(offensive), []);
});
