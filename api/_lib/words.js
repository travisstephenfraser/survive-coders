import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

// Profanity and slurs in names and profile handles, refused when a run is posted. Server only,
// so the game download doesn't carry the word list. The matcher is obscenity's English set,
// which already sees through leetspeak (sh1t), look-alike characters and stretched letters
// (fuuuck), and lets through the words that contain one (Dickens, Scunthorpe, cocktail). Three
// additions below. Creative spellings still get past: the top-ten alert email is the backstop.
const dataset = englishDataset.build();
const matcher = new RegExpMatcher({
  ...dataset,
  // Real words and names the set would refuse. Matched as substrings of the lowercased input, so
  // each is as long as it can be ("cumming" would let the verb through; "Cumming" alone is refused).
  whitelistedTerms: [
    ...dataset.whitelistedTerms,
    'shiitake', 'dickson', 'dickinson', 'dickerson', 'cummings',
    'fukuda', 'fukui', 'fukuoka', 'fukushima', 'fukuyama',
  ],
  ...englishRecommendedTransformers,
});

// Letters spelled out between separators: "f.u.c.k", "s h i t". Read twice: once with the
// set's leetspeak characters as letters ("$ h ! t"), once with them as separators ("f!u!c!k").
const SPELLINGS = ['A-Za-z0-9@(|!/$', 'A-Za-z0-9'].map((L) => ({
  run: new RegExp(`(?<![${L}])[${L}](?:[^${L}]+[${L}](?![${L}]))+`, 'g'),
  sep: new RegExp(`[^${L}]+`),
}));

// Each run of spelled-out letters joined, and joined with its first and/or last letter left
// apart, since that may be a one-letter word ("I a s s", "x w h o r e x"). Whole words are never
// joined: that would build new ones ("pen island").
function* spelledOut(text) {
  for (const { run, sep } of SPELLINGS) {
    for (const m of text.matchAll(run)) {
      const t = m[0].split(sep);
      const k = t.length;
      const ways = [t.join('')];
      if (k >= 3) ways.push(`${t[0]} ${t.slice(1).join('')}`, `${t.slice(0, -1).join('')} ${t[k - 1]}`);
      if (k >= 4) ways.push(`${t[0]} ${t.slice(1, -1).join('')} ${t[k - 1]}`);
      for (const w of ways) yield text.slice(0, m.index) + w + text.slice(m.index + m[0].length);
    }
  }
}

export function offensive(text) {
  // An underscore separates words in a handle (big_ass), but the matcher's \b reads it as a letter.
  const plain = text.replace(/_/g, ' ');
  if (matcher.hasMatch(plain)) return true;
  for (const variant of spelledOut(plain)) if (matcher.hasMatch(variant)) return true;
  return false;
}
