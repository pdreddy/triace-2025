// Reads the shared PPRC player data from the multi-club Realtime Database over its REST interface (public
// read, no sign-in). Nothing is written from the browser.
// The local demo serves its own copy of the data at /pprc-db (see scripts/demo-plugin.mjs); everything else reads the shared database.
const BASE = (import.meta.env.VITE_MULTICLUB_DATABASE_URL || (import.meta.env.MODE === 'demo' ? '/pprc-db' : 'https://multiclub-890ea-default-rtdb.firebaseio.com')).replace(/\/$/, '');

async function read(path) {
  const response = await fetch(`${BASE}/${path}.json`);
  if (response.status === 404 && BASE === '/pprc-db') throw new Error((await response.json().catch(() => ({}))).error || 'No local PPRC data.');
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'The player data is not readable yet.' : `Could not load player data (${response.status}).`);
  return response.json();
}

// The list is shared by the player directory, profile ranks, names on Champions and the admin screen, so it is
// downloaded once and reused for a few minutes (pass { fresh: true } after changing data).
const LIST_TTL = 5 * 60 * 1000;
let listCache = null;
export function fetchPlayerList({ fresh = false } = {}) {
  if (!fresh && listCache && Date.now() - listCache.at < LIST_TTL) return listCache.promise;
  const promise = read('pprcMaster/playerList').then(tree => Object.entries(tree || {}).map(([id, p]) => ({ id, ...p })));
  listCache = { at: Date.now(), promise };
  promise.catch(() => { if (listCache?.promise === promise) listCache = null; }); // never cache a failure
  return promise;
}
export async function fetchPlayer(id) {
  const [info, rating, recent, years] = await Promise.all([read(`pprcMaster/players/${id}`), read(`pprcMaster/ratings/${id}`), read(`pprcMaster/recent/${id}`), read(`pprcMaster/historyYears/${id}`)]);
  return info ? { id, info, rating, recent: recent || [], years: years || {} } : null;
}
// One calendar year of a player's matches, newest first.
export async function fetchYear(id, year) {
  const items = Object.values((await read(`pprcMaster/ratingHistory/${id}/${year}`)) || {});
  return items.sort((a, b) => b.ts - a.ts || String(b.matchId).localeCompare(String(a.matchId)));
}
