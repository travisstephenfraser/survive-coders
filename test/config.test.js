import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../api/_lib/config.js';

const PROD = 'ep-quiet-prod-123456.us-east-1.aws.neon.tech';
const DEV = 'ep-green-dev-654321.us-east-1.aws.neon.tech';
const url = (host) => `postgresql://sc_app:pw@${host}/neondb?sslmode=require`;
const env = (overrides = {}) => ({
  DATABASE_URL: url(DEV.replace('.us-east-1', '-pooler.us-east-1')),
  IP_HASH_SECRET: 'x'.repeat(48),
  NEON_PROD_HOST: PROD,
  VERCEL_ENV: 'development',
  ...overrides,
});

test('local dev on the dev branch is fine, and allows the vercel dev origin', () => {
  const cfg = readConfig(env());
  assert.equal(cfg.ok, true, cfg.problems?.join());
  assert.ok(cfg.origins.has('http://localhost:3000'));
  assert.ok(cfg.origins.has('https://survive-coders.vercel.app'));
});

test('production on the production branch is fine, and allows only its own https origins', () => {
  const cfg = readConfig(
    env({
      VERCEL_ENV: 'production',
      DATABASE_URL: url(PROD.replace('.us-east-1', '-pooler.us-east-1')),
      VERCEL_URL: 'survive-coders-abc123-team.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'survive-coders.vercel.app',
    }),
  );
  assert.equal(cfg.ok, true, cfg.problems?.join());
  assert.ok(!cfg.origins.has('http://localhost:3000'));
  assert.ok(cfg.origins.has('https://survive-coders-abc123-team.vercel.app'));
});

test('the production database only ever pairs with production', () => {
  assert.equal(readConfig(env({ DATABASE_URL: url(PROD) })).ok, false, 'vercel dev pointed at prod');
  assert.equal(readConfig(env({ VERCEL_ENV: 'preview', DATABASE_URL: url(PROD) })).ok, false, 'a preview pointed at prod');
  assert.equal(readConfig(env({ VERCEL_ENV: 'production' })).ok, false, 'production pointed at dev');
});

test('missing, short or redacted secrets fail closed, naming the variable and never its value', () => {
  for (const [overrides, name] of [
    [{ IP_HASH_SECRET: 'short' }, 'IP_HASH_SECRET'],
    [{ IP_HASH_SECRET: '[SENSITIVE]' }, 'IP_HASH_SECRET'],
    [{ IP_HASH_SECRET: undefined }, 'IP_HASH_SECRET'],
    [{ DATABASE_URL: '[SENSITIVE]' }, 'DATABASE_URL'],
    [{ DATABASE_URL: '' }, 'DATABASE_URL'],
    [{ NEON_PROD_HOST: undefined }, 'NEON_PROD_HOST'],
  ]) {
    const cfg = readConfig(env(overrides));
    assert.equal(cfg.ok, false, name);
    assert.ok(cfg.problems.some((p) => p.startsWith(name)), `${name}: ${cfg.problems}`);
    assert.ok(!cfg.problems.join().includes('xxxxxxxx'), 'no secret in the message');
  }
});

test('the alert email is optional: without its settings, alerts are simply off', () => {
  assert.equal(readConfig(env()).notify, null);
  const cfg = readConfig(env({ RESEND_API_KEY: 're_test', NOTIFY_EMAIL: 'me@example.com' }));
  assert.deepEqual(cfg.notify, { apiKey: 're_test', to: 'me@example.com' });
});
