// The API's settings from the environment, checked before anything runs. Fails closed: any
// problem and every request gets 503, with one log line naming the variable (never its value).
//
//   DATABASE_URL     sc_app's connection string: the prod branch in Production, dev elsewhere
//   IP_HASH_SECRET   32+ random characters; addresses are stored only as HMACs under it
//   NEON_PROD_HOST   the prod branch's host, so no environment but Production can reach it
//   RESEND_API_KEY   optional, with NOTIFY_EMAIL: the top-ten alert email
//   NOTIFY_EMAIL
//
// VERCEL_ENV, VERCEL_URL, VERCEL_BRANCH_URL and VERCEL_PROJECT_PRODUCTION_URL come from Vercel.
const host = (h) => h.replace(/-pooler(?=\.)/, '');

export function readConfig(env) {
  const problems = [];
  // `vercel env pull` writes "[SENSITIVE]" (or "") for Sensitive variables: both fail here.
  const ipHashSecret = env.IP_HASH_SECRET ?? '';
  if (ipHashSecret.length < 32) problems.push('IP_HASH_SECRET missing or under 32 characters');
  let dbHost = null;
  try {
    dbHost = host(new URL(env.DATABASE_URL).hostname);
  } catch {
    problems.push('DATABASE_URL missing or not a URL');
  }
  const prodHost = host(env.NEON_PROD_HOST ?? '');
  const production = env.VERCEL_ENV === 'production';
  if (!prodHost) problems.push('NEON_PROD_HOST missing');
  else if (dbHost && production !== (dbHost === prodHost)) {
    problems.push(production ? 'DATABASE_URL is not the production branch' : 'DATABASE_URL is the production branch outside Production');
  }
  if (problems.length) return { ok: false, problems };

  const origins = new Set(
    ['survive-coders.vercel.app', env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map((h) => `https://${h}`),
  );
  if (!production) ['http://localhost:3000', 'http://127.0.0.1:3000'].forEach((o) => origins.add(o));
  const notify = env.RESEND_API_KEY && env.NOTIFY_EMAIL ? { apiKey: env.RESEND_API_KEY, to: env.NOTIFY_EMAIL } : null;
  return { ok: true, databaseUrl: env.DATABASE_URL, ipHashSecret, origins, notify };
}
