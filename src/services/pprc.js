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

export const fetchPlayerList = async () => Object.entries((await read('pprcMaster/playerList')) || {}).map(([id, p]) => ({ id, ...p }));
export async function fetchPlayer(id) {
  const [info, rating, recent, years] = await Promise.all([read(`pprcMaster/players/${id}`), read(`pprcMaster/ratings/${id}`), read(`pprcMaster/recent/${id}`), read(`pprcMaster/historyYears/${id}`)]);
  return info ? { id, info, rating, recent: recent || [], years: years || {} } : null;
}
// One calendar year of a player's matches, newest first.
export async function fetchYear(id, year) {
  const items = Object.values((await read(`pprcMaster/ratingHistory/${id}/${year}`)) || {});
  return items.sort((a, b) => b.ts - a.ts || String(b.matchId).localeCompare(String(a.matchId)));
}
