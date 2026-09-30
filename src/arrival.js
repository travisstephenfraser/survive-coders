import { checkName, formatTime, MAX_STARS } from '../shared/leaderboard.js';
import { decodeRun, place } from '../shared/share.js';

// The title screen's line for someone who arrived from a shared run: ?vs=s.<code> (decoded
// here: a place and numbers, no free text) or ?vs=r.<token> (a posted run: the card function
// verifies the signature, so a hand-made link can't put words on the title). It leads with how
// far they got, not how good they were: in the red team's evidence, seeing a loss made people
// keener to play than seeing a win.
export async function arrivalBanner(vs) {
  if (typeof vs !== 'string') return null;
  const [kind, key] = [vs.slice(0, 2), vs.slice(2)];
  if (kind === 's.') {
    const run = decodeRun(key);
    return run ? line({ ...run, where: place(run.placeKey).where }) : null;
  }
  if (kind !== 'r.' || !/^[\w-]+\.[\w-]+$/.test(key)) return null;
  try {
    const res = await fetch(`/api/share?kind=r&key=${encodeURIComponent(key)}&as=json`, { signal: AbortSignal.timeout(5000) });
    const r = res.ok ? await res.json() : null;
    const ok = r && checkName(r.name) === null && Number.isInteger(r.stars) && r.stars >= 0 && r.stars <= MAX_STARS && Number.isInteger(r.timeMs);
    return ok ? line({ ...r, placeKey: 'hq' }) : null;
  } catch {
    return null;
  }
}

function line({ placeKey, where, stars, timeMs, name }) {
  if (placeKey === 'hq') return `${name ?? 'Someone'} made it to Anthropic HQ with ${stars}★ in ${formatTime(timeMs)}. Your turn.`;
  return `Someone ${where} with ${stars}★. Get further.`;
}
