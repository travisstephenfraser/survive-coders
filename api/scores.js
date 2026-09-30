import { readConfig } from './_lib/config.js';
import { createStore, neonDb } from './_lib/store.js';
import { resendNotifier } from './_lib/notify.js';
import { scoresHandlers } from './_lib/scores.js';

// /api/scores. GET: the top ten. POST: a finished run. The logic is in _lib/scores.js (Vercel
// serves nothing from _-prefixed paths); this file only wires in the real config, database and
// mailer, each made on first use and kept for the life of the instance.
let config;
let store;
let notify;
const cfg = () => (config ??= readConfig(process.env));

export const { GET, POST } = scoresHandlers({
  config: cfg,
  store: () => (store ??= createStore(neonDb(cfg().databaseUrl))),
  notify: (entry) => (notify ??= resendNotifier(cfg().notify))(entry),
});
