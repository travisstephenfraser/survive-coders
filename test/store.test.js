import test from 'node:test';
import assert from 'node:assert/strict';
import { neonConfig } from '@neondatabase/serverless';
import { createStore, neonDb } from '../api/_lib/store.js';

// What the store sends Neon's HTTP endpoint: the driver's fetch, stubbed.
test('both boards are read in one round trip, from one read-only snapshot', async () => {
  const calls = [];
  neonConfig.fetchFunction = async (url, init) => {
    calls.push({ headers: init.headers, body: JSON.parse(init.body) });
    const result = (name) => ({ fields: [{ name: 'name', dataTypeID: 25 }], rows: [[name]], command: 'SELECT', rowCount: 1 });
    return new Response(JSON.stringify({ results: [result('by stars'), result('by time')] }), { headers: { 'content-type': 'application/json' } });
  };
  const store = createStore(neonDb('postgresql://sc_app:pw@ep-test-123.us-east-2.aws.neon.tech/neondb'));
  const boards = await store.boards(null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.queries.length, 2);
  assert.equal(calls[0].headers['Neon-Batch-Isolation-Level'], 'RepeatableRead');
  assert.equal(calls[0].headers['Neon-Batch-Read-Only'], 'true');
  assert.deepEqual(boards, { stars: [{ name: 'by stars' }], time: [{ name: 'by time' }] });
});
