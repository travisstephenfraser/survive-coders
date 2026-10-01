import { SPLITS, formatTime } from '../../shared/leaderboard.js';

// The top-ten alert (a new best in either board's top ten): one plain-text email through Resend's REST API, with the run and the SQL
// that hides it. Sent from Resend's shared test sender, which delivers only to the Resend
// account's own address (that's who it's for). Bounded by a timeout; a failure is logged and
// swallowed, because the player's post already succeeded.
export function resendNotifier(settings, { fetch: send = fetch, log = console } = {}) {
  return async (e) => {
    if (!settings) return;
    // A board's rank is this run's only where it's the player's best; elsewhere the rank is
    // their other run's, and the email says so rather than pin it on this one.
    const boards = [e.fastBest && `time #${e.fastRank}`, e.best && `★ #${e.rank}`].filter(Boolean).join(', ');
    const head = `${boards} of ${e.total}: ${e.name}, ★ ${e.stars} in ${formatTime(e.timeMs)}`;
    const lines = [
      head,
      ...(e.fastBest ? [] : [`time board: their fastest is another run, at #${e.fastRank}`]),
      ...(e.best ? [] : [`★ board: their best is another run, at #${e.rank}`]),
      e.url ? `profile: ${e.url}` : 'no profile linked',
      '',
      'milestones (time, stars held):',
      ...SPLITS.map((s, i) => `  ${s.padEnd(8)} ${formatTime(e.splits[i]).padStart(8)}  ★ ${e.splitStars[i]}`),
      '',
      'hide this run (Neon SQL editor, as the owner):',
      `  UPDATE scores SET hidden = true WHERE id = '${e.id}';`,
      "hiding only this run lets the player's next-best run take its place. Everything from this",
      'browser, or this address:',
      `  UPDATE scores SET hidden = true WHERE player_id = '${e.playerId}';`,
      `  UPDATE scores SET hidden = true WHERE ip_hash = '${e.ipHash}';`,
      '',
      'The public board is an edge-cached copy (fresh for 15 minutes; after a quiet spell the',
      'first visitor can get an older one). Purge the CDN cache in Vercel if a hide must show now.',
    ];
    try {
      const res = await send('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${settings.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: 'Survive Coders <onboarding@resend.dev>',
          to: [settings.to],
          subject: `Leaderboard ${head}`,
          text: lines.join('\n'),
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) log.error(`alert ${res.status}`);
    } catch (err) {
      log.error(`alert 0 ${err?.name ?? 'error'}`);
    }
  };
}
