// Small HTTP helpers for the API functions.

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });

// The caller's address as Vercel's edge saw it. Vercel sets these itself and overwrites what a
// client sends (Vercel serves IPv4 only, so there is no IPv6 prefix to bucket).
export function clientIp(request) {
  const ip = (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-real-ip') ?? '').split(',')[0].trim();
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip || 'unknown';
}

// One line per failure: where, what status, and the error's code. Never the error itself, which
// can carry the request body or a row's values (Postgres puts them in `detail`).
export function logFail(log, where, status, err) {
  log.error(`${where} ${status} ${err?.code ?? err?.name ?? 'error'}`);
}
