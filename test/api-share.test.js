import test from 'node:test';
import assert from 'node:assert/strict';
import { shareHandlers } from '../api/_lib/share.js';
import { readToken, shareToken } from '../api/_lib/shareToken.js';
import { encodeRun } from '../shared/share.js';

// The shared-run links, as vercel.json rewrites them: no database anywhere, just the secret.
const ORIGIN = 'https://survive-coders.vercel.app';
const SECRET = 's'.repeat(40);
let secret = SECRET;
const errors = [];
const h = shareHandlers({ secret: () => secret, log: { error: (m) => errors.push(m) } });
const get = (kind, key, as) => h.GET(new Request(`${ORIGIN}/api/share?kind=${kind}&key=${encodeURIComponent(key)}${as ? `&as=${as}` : ''}`));
const FOREVER = 'public, max-age=31536000, s-maxage=31536000, immutable';
const meta = (html, prop) => new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`).exec(html)?.[1];

const death = { placeKey: 'tower61', stars: 141, timeMs: 754000 };
const posted = { name: 'ada_l', stars: 382, timeMs: 1102400, rank: 4, total: 57 };

test('a death link: a page with absolute preview tags that sends people on to the game', async () => {
  const code = encodeRun(death);
  const res = await get('s', code);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.equal(res.headers.get('cache-control'), FOREVER);
  const html = await res.text();
  assert.equal(meta(html, 'og:image'), `${ORIGIN}/s/${code}/card.png`);
  assert.equal(meta(html, 'twitter:image'), `${ORIGIN}/s/${code}/card.png`);
  assert.equal(meta(html, 'og:url'), `${ORIGIN}/s/${code}`);
  assert.equal(meta(html, 'og:title'), 'Died on the Ohana Floor with 141★ · Survive Coders');
  assert.equal(meta(html, 'og:description'), '141 stars, died on the Ohana Floor, 0.1 miles from Anthropic HQ. Can you get further?');
  assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
  assert.ok(html.includes(`location.replace("${ORIGIN}/?vs=s.${code}")`));
});

test('the card is a 1200x630 PNG, and the JSON is what the banner needs', async () => {
  const res = await get('s', encodeRun(death), 'png');
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), FOREVER);
  const png = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  const json = await (await get('s', encodeRun(death), 'json')).json();
  assert.deepEqual(json, { kind: 's', placeKey: 'tower61', where: 'died on the Ohana Floor', stars: 141, timeMs: 754000 });
});

test('junk, and anything not signed with our secret, is a short-cached 404', async () => {
  for (const [kind, key, as] of [['s', 'nope'], ['s', encodeRun(death), 'gif'], ['x', encodeRun(death)], ['r', 'abc.def'], ['r', shareToken('o'.repeat(40), posted)]]) {
    const res = await get(kind, key, as);
    assert.equal(res.status, 404, `${kind} ${key} ${as}`);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=300, s-maxage=300');
  }
  const token = shareToken(SECRET, posted);
  const [payload, sig] = token.split('.');
  const tampered = Buffer.from(JSON.stringify([1, 'ada_l', 382, 1102400, 1, 57])).toString('base64url');
  assert.equal((await get('r', `${tampered}.${sig}`)).status, 404);
  assert.equal((await get('r', `${payload}.${sig}`)).status, 200);
});

test('a posted run: the rank it posted at, the name escaped', async () => {
  const token = shareToken(SECRET, { ...posted, name: '<b>&"x' });
  assert.deepEqual(readToken(SECRET, token), { placeKey: 'hq', ...posted, name: '<b>&"x' });
  const html = await (await get('r', token)).text();
  assert.equal(meta(html, 'og:title'), '&lt;b&gt;&amp;&quot;x: #4 of 57, 382★ in 18:22.4 · Survive Coders');
  assert.ok(!html.includes('<b>&'), 'the raw name never reaches the page');
  const unranked = await (await get('r', shareToken(SECRET, { ...posted, rank: null }), 'json')).json();
  assert.deepEqual(unranked, { kind: 'r', placeKey: 'hq', where: 'made it to Anthropic HQ', stars: 382, timeMs: 1102400, name: 'ada_l', rank: null, total: 57 });
});

test('without the secret, posted links fail closed and death links still work', async () => {
  secret = '';
  try {
    assert.equal((await get('r', shareToken(SECRET, posted))).status, 503);
    assert.equal((await get('s', encodeRun(death))).status, 200);
    assert.match(errors.at(-1), /IP_HASH_SECRET/);
  } finally {
    secret = SECRET;
  }
});

test('HEAD answers like GET, without a body', async () => {
  const res = await h.HEAD(new Request(`${ORIGIN}/api/share?kind=s&key=${encodeRun(death)}&as=png`, { method: 'HEAD' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.body, null);
});
