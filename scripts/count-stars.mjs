// Counts every star a run can earn, straight from the level source, and checks the totals
// against the leaderboard's per-segment maximums in shared/leaderboard.js. The server rejects
// runs above those maximums, so a map, wave, reward or bonus change that adds stars has to
// update them too, or real runs get turned away. Run it after any such change: npm run stars
import { readFileSync, readdirSync } from 'node:fs';
import { SEGMENT_STARS, MAX_STARS } from '../shared/leaderboard.js';

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const problems = [];
const fail = (msg) => problems.push(msg);
const count = (text, re) => (text.match(re) ?? []).length;

// Every place that adds to the `stars` registry value. A new one is a new star source.
const GRANTS = {
  'scenes/PlayScene.js': 1, // addStars() itself
  'scenes/Landing.js': 1, // the canopy stars
};
const CALLERS = {
  'scenes/PlayScene.js': 1, // map pickups
  'entities/enemies.js': 1, // Enemy.die() pays this.reward
  'scenes/Park.js': 1, // the demo-day arena clear
  'scenes/BossHQ.js': 1, // petting a Furby
  'entities/Hydra.js': 1, // the collapse bonus
};
for (const dir of ['scenes', 'entities']) {
  for (const f of readdirSync(new URL(`../src/${dir}`, import.meta.url))) {
    const file = `${dir}/${f}`;
    const text = read(file);
    const grants = count(text, /registry\.set\('stars',\s*\(this\.registry\.get\('stars'\) \?\? 0\) \+/g);
    const calls = count(text, /addStars\((?!n, x, y\) \{)/g);
    if (grants !== (GRANTS[file] ?? 0)) fail(`${file}: ${grants} direct star grants, expected ${GRANTS[file] ?? 0}`);
    if (calls !== (CALLERS[file] ?? 0)) fail(`${file}: ${calls} addStars() calls, expected ${CALLERS[file] ?? 0}`);
  }
}

// Enemy rewards: the last super() argument, taking the plain branch of a ternary
// (`small ? 1 : 3` is a big blob's 3, `closing ? 0 : 5` a CRM agent's 5).
const enemies = read('entities/enemies.js');
const reward = {};
for (const [, name, args] of enemies.matchAll(/export class (\w+) extends Enemy \{[\s\S]*?super\(scene, x, y, ([^;]*)\);/g)) {
  const last = args.split(',').at(-1).trim();
  const m = last.match(/^\w+ \? (\d+) : (\d+)$/) ?? last.match(/^(\d+)$/);
  if (!m) fail(`enemies.js: can't read ${name}'s reward from "${last}"`);
  else reward[name] = Number(m.at(-1));
}
// A big blob splits into two small ones worth 1 each.
if (!/for \(const d of \[-1, 1\]\) \{\s*const s = new BadPromptBlob\(scene, [^)]*, true\);/.test(enemies)) {
  fail('enemies.js: the blob split no longer reads as two small blobs; recount it by hand');
}
reward.BadPromptBlob += 2;
const spawners = Object.fromEntries(
  [...enemies.match(/export const SPAWNERS = \{([^}]*)\}/)[1].matchAll(/(\w): (\w+)/g)].map(([, ch, cls]) => [ch, cls]),
);

// A map's worth: its * pickups plus the reward of every enemy letter on it.
function mapStars(rows) {
  let total = 0;
  for (const row of rows) {
    for (const ch of row) {
      if (ch === '*') total += 1;
      else if (spawners[ch]) total += reward[spawners[ch]];
    }
  }
  return total;
}
const rowsOf = (block) => [...block.matchAll(/^\s*'([^']*)',?$/gm)].map((m) => m[1]);
// The bracketed literal that starts at `label`, skipping brackets inside strings (the park's map
// draws the amphitheater's walls as [ and ]).
function arrayAfter(text, label) {
  const at = text.indexOf(label);
  if (at < 0) throw new Error(`can't find ${label}`);
  const start = text.indexOf('[', at);
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`unclosed ${label}`);
}
const waveStars = (text, label) =>
  [...arrayAfter(text, label).matchAll(/\[\d+, (\w+)\]/g)].reduce((s, [, cls]) => s + reward[cls], 0);

const park = read('scenes/Park.js');
const tower = read('scenes/Tower.js');
const floorRows = (n) => {
  const at = tower.indexOf(`  ${n}: {`);
  return rowsOf(tower.slice(tower.indexOf('map: [', at), tower.indexOf('    ],', tower.indexOf('map: [', at))));
};
const landing = read('scenes/Landing.js');
const boss = read('scenes/BossHQ.js');
const hydra = read('entities/Hydra.js');

// The Hydra's notification skulls respawn for as long as their head lives, so they must pay 0.
if (!/new FlamingSkull\(scene, head\.x - 8, head\.y\);\s*m\.reward = 0;/.test(hydra)) {
  fail('Hydra.js: the respawning notification skulls pay stars, so stars are unbounded');
}
const bonus = (text, re, value, what) => {
  if (!re.test(text)) fail(`${what} no longer reads as +${value}; recount it`);
  return value;
};
const heads = count(hydra, /new Head\(scene, this, '\w+'/g);
const headReward = Number(hydra.match(/super\(scene, ax, ay, `head_\$\{role\}`, BASE_HP, (\d+)\)/)?.[1]);
const furbies = count(arrayAfter(boss, 'this.furbies = ['), /\['furby_\w+'/g);

const segments = [
  ['level1', mapStars(rowsOf(arrayAfter(read('scenes/Level1.js'), 'const SUBURBS = [')))],
  ['park', mapStars(rowsOf(arrayAfter(park, 'const PARK = ['))) + waveStars(park, 'const WAVES = [') + bonus(park, /this\.addStars\(5, this\.player/, 5, 'Park arena clear')],
  ['tower59', mapStars(floorRows(59))],
  ['tower60', mapStars(floorRows(60))],
  ['tower61', mapStars(floorRows(61)) + waveStars(tower, 'const OHANA_WAVES = [')],
  ['chute', 0],
  ['landing', count(arrayAfter(landing, 'const STARS = ['), /\[\d+, \d+\]/g)],
  [
    'boss',
    mapStars(rowsOf(arrayAfter(boss, 'const ARENA = ['))) +
      furbies * bonus(boss, /this\.addStars\(5, f\.x/, 5, 'Furby pet') +
      heads * headReward +
      bonus(hydra, /scene\.addStars\(50, this\.body/, 50, 'Hydra collapse'),
  ],
];

let total = 0;
segments.forEach(([name, stars], i) => {
  total += stars;
  const mark = stars === SEGMENT_STARS[i] ? 'ok' : `MISMATCH (shared/leaderboard.js says ${SEGMENT_STARS[i]})`;
  if (stars !== SEGMENT_STARS[i]) fail(`${name}: counted ${stars}, SEGMENT_STARS says ${SEGMENT_STARS[i]}`);
  console.log(`${name.padEnd(8)} ${String(stars).padStart(4)}  ${mark}`);
});
console.log(`${'total'.padEnd(8)} ${String(total).padStart(4)}  (MAX_STARS ${MAX_STARS})`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
