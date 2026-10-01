import { neon } from '@neondatabase/serverless';

// The leaderboard's queries. `db` runs them: { q(text, params) → rows, tx([[text, params], …],
// opts) → [rows, …] in one transaction }. Neon's HTTP driver in production (neonDb), PGlite in
// tests.

// The two boards: each player's best visible run, ranked. By stars: most stars, then fastest,
// then first posted. By time: fastest, then most stars, then first posted. The run id settles
// exact ties, so a board never depends on the order rows come back in. Each returns the top
// ten, plus the given player's own row wherever it ranks ($1 null: just the ten).
const board = (order) => `
WITH best AS (
  SELECT DISTINCT ON (player_id) player_id, run_id, name, stars, time_ms, platform, handle, created_at
  FROM scores WHERE NOT hidden
  ORDER BY player_id, ${order}, run_id
), ranked AS (
  SELECT *, row_number() OVER (ORDER BY ${order}, run_id)::int AS rank,
         count(*) OVER ()::int AS total
  FROM best
)
SELECT rank, total, name, stars, time_ms, platform, handle, run_id, coalesce(player_id = $1::uuid, false) AS mine
FROM ranked WHERE rank <= 10 OR player_id = $1::uuid ORDER BY rank`;
const BY_STARS = board('stars DESC, time_ms, created_at');
const BY_TIME = board('time_ms, stars DESC, created_at');

// One round trip for the rate limit: this address's count for the minute, and the global count,
// which only moves when the address was still under its limit (so one noisy address can't use
// up everyone's budget).
const HIT = `
WITH ip AS (
  INSERT INTO request_counts (bucket, minute, n) VALUES ($1, date_trunc('minute', $2::timestamptz), 1)
  ON CONFLICT (bucket, minute) DO UPDATE SET n = request_counts.n + 1
  RETURNING n
), everyone AS (
  INSERT INTO request_counts (bucket, minute, n)
  SELECT 'scores:all', date_trunc('minute', $2::timestamptz), 1 FROM ip WHERE ip.n <= $3
  ON CONFLICT (bucket, minute) DO UPDATE SET n = request_counts.n + 1
  RETURNING n
)
SELECT (SELECT n FROM ip) AS ip_n, (SELECT n FROM everyone) AS global_n`;

const INSERT = `
INSERT INTO scores (run_id, player_id, name, stars, time_ms, splits, split_stars, platform, handle, ip_hash, rules_version)
VALUES ($1, $2, $3, $4, $5, $6::int[], $7::int[], $8, $9, $10, $11)
ON CONFLICT (run_id) DO NOTHING
RETURNING id`;

export function createStore(db) {
  return {
    // → { ip, global }: this minute's counts (global is null when the address was over its limit)
    async hit(ipHash, atIso, ipLimit) {
      const [row] = await db.q(HIT, [`scores:${ipHash}`, atIso, ipLimit]);
      return { ip: row.ip_n, global: row.global_n };
    },
    // → { stars, time }: both boards, read from one snapshot so they count the same players
    // even while a post lands between the two
    async boards(playerId) {
      const [stars, time] = await db.tx(
        [
          [BY_STARS, [playerId]],
          [BY_TIME, [playerId]],
        ],
        { isolationLevel: 'RepeatableRead', readOnly: true },
      );
      return { stars, time };
    },
    // → { id (null if the run was already posted), boards as the poster sees them }
    async insert(r) {
      const [inserted, stars, time] = await db.tx([
        [INSERT, [r.runId, r.playerId, r.name, r.stars, r.timeMs, r.splits, r.splitStars, r.platform, r.handle, r.ipHash, r.rulesVersion]],
        [BY_STARS, [r.playerId]],
        [BY_TIME, [r.playerId]],
      ]);
      return { id: inserted[0]?.id ?? null, boards: { stars, time } };
    },
  };
}

export function neonDb(url) {
  const sql = neon(url);
  return {
    q: (text, params) => sql.query(text, params),
    tx: (stmts, opts) => sql.transaction(stmts.map(([text, params]) => sql.query(text, params)), opts),
  };
}
