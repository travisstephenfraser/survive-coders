// Checks a running leaderboard API end to end: `vercel dev` (default) or a deployment.
//   npm run smoke                       # http://localhost:3000, the Neon dev branch
//   npm run smoke -- https://<preview>  # a preview; if it is protected, set VERCEL_PROTECTION_BYPASS
//                                       # to the project's bypass secret (sent as a header)
// Posts one run named smoke-NNNNN to whatever database the API uses: never run it against
// production. To hide smoke runs where they don't belong:
//   UPDATE scores SET hidden = true WHERE name LIKE 'smoke-%';
import { SEGMENT_FLOOR_MS, SPLITS } from '../shared/leaderboard.js';

const base = new URL(process.argv[2] ?? 'http://localhost:3000');
const origin = base.origin;
const bypass = process.env.VERCEL_PROTECTION_BYPASS ? { 'x-vercel-protection-bypass': process.env.VERCEL_PROTECTION_BYPASS } : {};
const get = (path) => fetch(new URL(path, base), { headers: bypass });
const results = [];
const check = (name, ok, got) => results.push([ok ? 'ok  ' : 'FAIL', name, ok ? '' : `(got ${got})`]);

function run(overrides = {}) {
  let t = 0;
  const splits = SPLITS.map((_, i) => (t += SEGMENT_FLOOR_MS[i] + 30000));
  return {
    runId: crypto.randomUUID(),
    playerId: crypto.randomUUID(),
    name: `smoke-${Date.now() % 100000}`,
    stars: 1,
    timeMs: t + SEGMENT_FLOOR_MS.at(-1) + 30000,
    splits,
    splitStars: [0, 0, 0, 0, 0, 0, 1],
    platform: null,
    handle: null,
    ...overrides,
  };
}
const post = (body, headers = {}) =>
  fetch(new URL('/api/scores', base), {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...bypass, ...headers },
    body: JSON.stringify(body),
  });

const board = await get('/api/scores');
check('GET board: 200 JSON', board.status === 200 && (board.headers.get('content-type') ?? '').includes('json'), board.status);
check('GET ?x=1: 400', (await get('/api/scores?x=1')).status === 400, '');
check('POST from another site: 403', (await post(run(), { origin: 'https://evil.example' })).status === 403, '');
check('POST as text/plain: 415', (await post(run(), { 'content-type': 'text/plain' })).status === 415, '');
const r422 = await post(run({ stars: 383 }));
check('POST 383 stars: 422 stars', r422.status === 422 && (await r422.json()).error === 'stars', r422.status);
const first = run();
const r201 = await post(first);
const body = await r201.json().catch(() => ({}));
check('POST a valid run: 201 with a rank', r201.status === 201 && Number.isInteger(body.you?.rank), `${r201.status} ${JSON.stringify(body)}`);
check('POST the same run again: 409', (await post(first)).status === 409, '');

for (const [flag, name, detail] of results) console.log(`${flag} ${name} ${detail}`);
process.exit(results.some(([f]) => f === 'FAIL') ? 1 : 0);
