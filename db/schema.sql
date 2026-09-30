-- Survive Coders leaderboard schema. Run as the project owner (neondb_owner) in the Neon SQL
-- editor, once per branch (main, then dev). Idempotent: safe to run again.
--
-- The limits here repeat shared/leaderboard.js on purpose: the API's checks can be skipped by
-- a bug, the table's can't. Keep MAX_STARS (382) and the handle rules in step with that file.

CREATE TABLE IF NOT EXISTS scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL CONSTRAINT scores_run_once UNIQUE,
  player_id uuid NOT NULL,
  name text NOT NULL CONSTRAINT scores_name CHECK (name ~ '^[!-~]([ -~]{0,14}[!-~])?$'),
  stars integer NOT NULL CONSTRAINT scores_stars CHECK (stars BETWEEN 0 AND 382),
  -- loose on purpose (the API's floor is 59.5 s), so tuning the API's floors never needs a migration
  time_ms integer NOT NULL CONSTRAINT scores_time CHECK (time_ms BETWEEN 30000 AND 43200000),
  splits integer[] NOT NULL CONSTRAINT scores_splits CHECK (
    cardinality(splits) = 7 AND array_position(splits, NULL) IS NULL AND 0 < ALL (splits) AND splits[7] < time_ms),
  split_stars integer[] NOT NULL CONSTRAINT scores_split_stars CHECK (
    cardinality(split_stars) = 7 AND array_position(split_stars, NULL) IS NULL AND 0 <= ALL (split_stars) AND split_stars[7] <= stars),
  platform text,
  handle text,
  ip_hash text NOT NULL CONSTRAINT scores_ip_hash CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  rules_version smallint NOT NULL CONSTRAINT scores_rules_version CHECK (rules_version >= 1),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Both or neither. The IS NOT NULLs matter: a CHECK that comes out NULL passes.
  CONSTRAINT scores_link CHECK (
    (platform IS NULL AND handle IS NULL)
    OR (platform IS NOT NULL AND handle IS NOT NULL AND (
      (platform = 'github' AND char_length(handle) <= 39 AND handle ~ '^[A-Za-z0-9](-?[A-Za-z0-9])*$')
      OR (platform = 'linkedin' AND handle ~ '^[A-Za-z0-9-]{3,100}$')
      OR (platform = 'x' AND handle ~ '^[A-Za-z0-9_]{1,15}$')
      OR (platform = 'bluesky' AND char_length(handle) <= 253
          AND handle ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'))))
);

-- Each player's best visible run, fast.
CREATE INDEX IF NOT EXISTS scores_best ON scores (player_id, stars DESC, time_ms, created_at) WHERE NOT hidden;

-- Per-minute request counters for the submit rate limit (one row per bucket per minute).
CREATE TABLE IF NOT EXISTS request_counts (
  bucket text NOT NULL CONSTRAINT request_counts_bucket CHECK (char_length(bucket) <= 80),
  minute timestamptz NOT NULL,
  n integer NOT NULL,
  PRIMARY KEY (bucket, minute)
);

-- The app's own role: reads and adds scores, bumps counters, nothing else. Created here in SQL,
-- not in the Neon console: console roles join neon_superuser (read and write everything).
-- Its password is set by hand on each branch, never in this file:
--   ALTER ROLE sc_app PASSWORD '<openssl rand -base64 30>';
-- Branches copy passwords from their parent, and a reset from parent may restore them, so set
-- it again on dev after creating or resetting that branch.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sc_app') THEN
    CREATE ROLE sc_app LOGIN;
  END IF;
  -- A new role otherwise inherits PUBLIC's defaults: connect to every database, and (on
  -- Postgres 14) create tables in public.
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO sc_app', current_database());
END
$$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO sc_app;
GRANT SELECT, INSERT ON scores TO sc_app;
GRANT SELECT, INSERT, UPDATE ON request_counts TO sc_app;
ALTER ROLE sc_app SET statement_timeout = '5s';

-- Owner-only housekeeping (the app role can do none of this):
--
-- Hide a cheater (the alert email carries the exact line):
--   UPDATE scores SET hidden = true WHERE id = '<id>';
--   UPDATE scores SET hidden = true WHERE player_id = '<player_id>';   -- everything from one browser
--   UPDATE scores SET hidden = true WHERE ip_hash = '<ip_hash>';       -- everything from one address
-- The public board is an edge-cached copy, fresh for 15 minutes; after a quiet spell the first
-- visitor can get an older one while it refreshes. Purge the CDN cache in the Vercel dashboard
-- when a hide has to show at once.
--
-- Recent runs, newest first, for a look at what's plausible:
--   SELECT id, name, stars, time_ms, splits, split_stars, left(ip_hash, 8) AS ip, created_at
--   FROM scores WHERE NOT hidden ORDER BY created_at DESC LIMIT 50;
--
-- Clear old rate-limit counters:
--   DELETE FROM request_counts WHERE minute < now() - interval '1 day';
