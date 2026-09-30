import { formatTime } from '../../shared/leaderboard.js';
import { decodeRun, place, shareLine } from '../../shared/share.js';
import { createFont, runCard } from '../../shared/pixelCard.js';
import { decodePng, encodePng } from './png.js';
import { FONT_PNG_BASE64 } from './fontSheet.js';
import { readToken } from './shareToken.js';

// A shared run's link: /r/<token> for a posted win, /s/<code> for anything else (vercel.json
// rewrites both here). Each one is a page with link-preview tags, a 1200x630 card, and the JSON
// the title screen's banner reads. None of it touches the database: /s/ codes are the run
// itself, and /r/ tokens carry the posted run signed at post time (rank included, so the card
// keeps the rank it posted at). Every valid URL always answers the same, so it caches for a year.

const CACHE_FOREVER = 'public, max-age=31536000, s-maxage=31536000, immutable';
const CACHE_MISS = 'public, max-age=300, s-maxage=300';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The preview's words: a posted win leads with its rank, a death with where it ended.
function words(run) {
  const posted = Number.isInteger(run.rank);
  const title =
    run.placeKey !== 'hq'
      ? `${place(run.placeKey).where.replace(/^./, (c) => c.toUpperCase())} with ${run.stars}★`
      : run.name
        ? `${run.name}: ${posted ? `#${run.rank} of ${run.total}, ` : ''}${run.stars}★ in ${formatTime(run.timeMs)}`
        : `Made it to Anthropic HQ: ${run.stars}★ in ${formatTime(run.timeMs)}`;
  return { title: `${title} · Survive Coders`, description: shareLine({ ...run, posted }, '').trim() };
}

function page({ run, self, image, play }) {
  const { title, description } = words(run);
  const alt = `Survive Coders run card: ${description}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Survive Coders">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(self)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="theme-color" content="#0d0d0d">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<style>html,body{margin:0;background:#0d0d0d;color:#f5f5f5;font:16px/1.4 Menlo,Consolas,monospace}main{max-width:1200px;margin:0 auto;padding:16px;text-align:center}img{width:100%;height:auto;image-rendering:pixelated}a{color:#3fb950}</style>
</head>
<body>
<main><img src="${esc(image)}" alt="${esc(alt)}" width="1200" height="630"><p><a href="${esc(play)}">$ play Survive Coders_</a></p></main>
<script>location.replace(${JSON.stringify(play).replace(/</g, '\\u003c')})</script>
</body>
</html>`;
}

const text = (status, body, cache) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': cache, 'x-content-type-options': 'nosniff' } });

// GET ?kind=r|s&key=<token|code>&as=page|png|json. Everything it needs comes in, so the tests
// run it with a fixed secret.
export function shareHandlers({ secret, log = console }) {
  let font = null;
  const cardFont = () => (font ??= createFont(decodePng(Buffer.from(FONT_PNG_BASE64, 'base64'))));

  async function GET(request) {
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind');
    const key = url.searchParams.get('key') ?? '';
    const as = url.searchParams.get('as') ?? 'page';
    let run = null;
    if (kind === 's') run = decodeRun(key);
    else if (kind === 'r') {
      const s = secret();
      if (!s || s.length < 32) {
        log.error('api/share 503 config: IP_HASH_SECRET missing or under 32 characters');
        return text(503, 'unavailable', 'no-store');
      }
      run = readToken(s, key);
    }
    if (!run || !['page', 'png', 'json'].includes(as)) return text(404, 'no such run', CACHE_MISS);

    const self = `${url.origin}/${kind}/${key}`;
    const headers = { 'cache-control': CACHE_FOREVER, 'x-content-type-options': 'nosniff' };
    if (as === 'png') {
      return new Response(encodePng(runCard(cardFont(), run), { level: 6 }), { headers: { ...headers, 'content-type': 'image/png' } });
    }
    if (as === 'json') {
      const body = { kind, placeKey: run.placeKey, where: place(run.placeKey).where, stars: run.stars, timeMs: run.timeMs };
      if (kind === 'r') Object.assign(body, { name: run.name, rank: run.rank, total: run.total });
      return new Response(JSON.stringify(body), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
    }
    const html = page({ run, self, image: `${self}/card.png`, play: `${url.origin}/?vs=${kind}.${key}` });
    return new Response(html, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
  }

  // Some crawlers ask HEAD first.
  async function HEAD(request) {
    const res = await GET(request);
    return new Response(null, { status: res.status, headers: res.headers });
  }

  return { GET, HEAD };
}
