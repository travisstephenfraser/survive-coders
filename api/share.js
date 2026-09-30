import { shareHandlers } from './_lib/share.js';

// /r/<token> and /s/<code> (vercel.json rewrites them here): a shared run's page, card and
// banner data. The logic is in _lib/share.js; it never touches the database.
export const { GET, HEAD } = shareHandlers({ secret: () => process.env.IP_HASH_SECRET ?? '' });
