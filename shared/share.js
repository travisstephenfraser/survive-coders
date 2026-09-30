import { MAX_STARS, MAX_TIME_MS, formatTime } from './leaderboard.js';

// Sharing a run: where it ended, the one-liner that goes with the link, and the stateless /s/
// code a death (or an unposted win) travels as. Shared by the game and the card function, so
// keep it pure like leaderboard.js.

// Where a run can end. A place's index is part of every /s/ code: append only, never reorder.
// Miles to Anthropic HQ are rough and for the joke; Daly City's 9.4 is the Waymo's line.
export const PLACES = [
  { key: 'hq', where: 'made it to Anthropic HQ', miles: 0 },
  { key: 'daly-city', where: 'died in Daly City', miles: 9.4 },
  { key: 'outer-sunset', where: 'died in the Outer Sunset', miles: 6 },
  { key: 'twin-peaks', where: 'died on Twin Peaks', miles: 3.5 },
  { key: 'powell-st', where: 'died on Powell St', miles: 0.8 },
  { key: 'the-mission', where: 'died in the Mission', miles: 1.8 },
  { key: 'soma', where: 'died in SoMa', miles: 0.4 },
  { key: 'park', where: 'died in Salesforce Park', miles: 0.1 },
  { key: 'tower59', where: 'died on floor 59 of the Salesforce Tower', miles: 0.1 },
  { key: 'tower60', where: 'died on floor 60 of the Salesforce Tower', miles: 0.1 },
  { key: 'tower61', where: 'died on the Ohana Floor', miles: 0.1 },
  { key: 'chute', where: 'fell off the Salesforce Tower', miles: 0.1 },
  { key: 'hydra', where: 'died fighting the Hydra inside Anthropic HQ', miles: 0 },
];
const INDEX = new Map(PLACES.map((p, i) => [p.key, i]));
export const place = (key) => PLACES[INDEX.get(key)] ?? null;

// Level 1's neighbourhood signs, as the HUD's route label slugs them.
const HOODS = new Set(['daly-city', 'outer-sunset', 'twin-peaks', 'powell-st', 'the-mission', 'soma']);

// Where a run ended, from what the End screen knows: the scene the death happened in, the HUD's
// route label (Level 1's names the neighbourhood, like "~/sf/twin-peaks → soma"), and the
// tower floor.
export function placeOf({ win = false, retry = null, level = '', towerFloor = null } = {}) {
  if (win) return 'hq';
  if (retry === 'Park') return 'park';
  if (retry === 'Tower') return [59, 60, 61].includes(towerFloor) ? `tower${towerFloor}` : 'tower59';
  if (retry === 'Chute') return 'chute';
  if (retry === 'BossHQ') return 'hydra';
  const hood = /^~\/sf\/([a-z-]+)/.exec(level ?? '')?.[1];
  return HOODS.has(hood) ? hood : 'daly-city';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The line that goes with the link. Stars lead: they're the number people compare.
export function shareLine({ placeKey, stars, timeMs, rank = null, posted = false }, url) {
  const p = place(placeKey) ?? PLACES[0];
  const s = plural(stars, 'star', 'stars');
  if (placeKey === 'hq') {
    const t = formatTime(timeMs);
    return posted && rank ? `#${rank} on the Survive Coders board: ${s} in ${t}. ${url}` : `Daly City to Anthropic HQ: ${s} in ${t}. ${url}`;
  }
  const away = p.miles > 0 ? `, ${p.miles} miles from Anthropic HQ` : '';
  return `${s}, ${p.where}${away}. Can you get further? ${url}`;
}

// /s/<code>: version, place, stars and whole seconds, each in base36, joined by dashes, like
// 1-a-3x-k2. Decoding accepts only the one canonical spelling of a valid run, so every card has
// exactly one URL (and one cache entry).
const VERSION = '1';
const MAX_SECS = MAX_TIME_MS / 1000;

export function encodeRun({ placeKey, stars, timeMs }) {
  const i = INDEX.get(placeKey);
  if (i === undefined) throw new Error(`unknown place ${placeKey}`);
  const secs = Math.min(MAX_SECS, Math.max(0, Math.round(timeMs / 1000)));
  const s = Math.min(MAX_STARS, Math.max(0, Math.round(stars)));
  return [VERSION, i.toString(36), s.toString(36), secs.toString(36)].join('-');
}

export function decodeRun(code) {
  if (typeof code !== 'string' || code.length > 24) return null;
  const parts = code.split('-');
  if (parts.length !== 4 || parts[0] !== VERSION || !parts.every((p) => /^[0-9a-z]{1,6}$/.test(p))) return null;
  const [i, stars, secs] = parts.slice(1).map((p) => parseInt(p, 36));
  if (i >= PLACES.length || stars > MAX_STARS || secs > MAX_SECS) return null;
  const run = { placeKey: PLACES[i].key, stars, timeMs: secs * 1000 };
  return encodeRun(run) === code ? run : null;
}
