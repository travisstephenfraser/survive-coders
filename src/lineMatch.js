// Loose matching for the lines typed (or spoken) into the Chute's terminal. Case, punctuation
// and spacing don't count, and small typos pass: one edit per six letters of the line, at
// least one. Phaser-free, so it runs under plain node.

export const normalize = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Levenshtein distance (insert, delete, substitute), one row at a time.
function edits(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

const slack = (line) => Math.max(1, Math.floor(line.length / 6));

// Whether a typed line counts as `line`.
export function matchLine(typed, line) {
  const want = normalize(line);
  return edits(normalize(typed), want) <= slack(want);
}

// Speech arrives as a running transcript that may hold more than the line ("okay no a real one
// please"). Returns the number of words through the end of the first run of words that matches
// `line`, so the next line is looked for after it, or 0 if none does.
export function findSpoken(heard, line) {
  const want = normalize(line);
  const words = normalize(heard).split(' ').filter(Boolean);
  const n = want.split(' ').length;
  for (let end = 1; end <= words.length; end++) {
    for (let len = Math.max(1, n - 1); len <= n + 1 && len <= end; len++) {
      if (edits(words.slice(end - len, end).join(' '), want) <= slack(want)) return end;
    }
  }
  return 0;
}
