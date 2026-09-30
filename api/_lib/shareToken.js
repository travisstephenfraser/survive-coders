import { createHmac, timingSafeEqual } from 'node:crypto';
import { MAX_STARS, MAX_TIME_MS, MIN_TIME_MS, checkName } from '../../shared/leaderboard.js';

// A posted run's /r/ token: the run as the board took it, signed at post time, so its link
// preview needs no database and keeps the rank it posted at. Its own file so the scores
// function doesn't load the card renderer.

const TOKEN_VERSION = 1;

const shareKey = (secret) => createHmac('sha256', secret).update('survive-coders share v1').digest();
const sign = (key, payload) => createHmac('sha256', key).update(payload).digest().subarray(0, 16);

// A posted run, signed: base64url of [version, name, stars, timeMs, rank or null, total], a dot,
// then 16 bytes of HMAC. The key comes from IP_HASH_SECRET, so there's no new secret to set.
export function shareToken(secret, { name, stars, timeMs, rank, total }) {
  const payload = Buffer.from(JSON.stringify([TOKEN_VERSION, name, stars, timeMs, rank ?? null, total])).toString('base64url');
  return `${payload}.${sign(shareKey(secret), payload).toString('base64url')}`;
}

// → { placeKey: 'hq', name, stars, timeMs, rank, total }, or null for anything not signed here.
export function readToken(secret, token) {
  if (typeof token !== 'string' || token.length > 300) return null;
  const [payload, sig, extra] = token.split('.');
  if (extra !== undefined || !/^[\w-]+$/.test(payload ?? '') || !/^[\w-]{22}$/.test(sig ?? '')) return null;
  const want = sign(shareKey(secret), payload);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let v;
  try {
    v = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(v) || v.length !== 6 || v[0] !== TOKEN_VERSION) return null;
  const [, name, stars, timeMs, rank, total] = v;
  const ok =
    checkName(name) === null &&
    Number.isInteger(stars) && stars >= 0 && stars <= MAX_STARS &&
    Number.isInteger(timeMs) && timeMs >= MIN_TIME_MS && timeMs <= MAX_TIME_MS &&
    Number.isInteger(total) && total >= 1 &&
    (rank === null || (Number.isInteger(rank) && rank >= 1 && rank <= total));
  return ok ? { placeKey: 'hq', name, stars, timeMs, rank, total } : null;
}
