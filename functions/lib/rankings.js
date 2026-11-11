// The PPRC leaderboard: filter and order the shared player list (the same list /pprc reads), then number the rows.
import { PPRC_VERIFIED_AFTER } from './tournament.js';

export const METRICS = { overall: 'Overall', singles: 'Singles', doubles: 'Doubles' };

// list: [{ id, name, overall, singles, doubles, played, clubs: [] }].
// Returns rows in order with `rank` (ties share a rank), `verified`, and `value` (the rating being ranked).
export function rankPlayers(list, { metric = 'overall', club = 'all', verifiedOnly = true, query = '' } = {}) {
  const key = METRICS[metric] ? metric : 'overall', q = String(query).trim().toLowerCase();
  const rows = list
    .filter(p => Number.isFinite(p[key]))
    .filter(p => club === 'all' || (p.clubs || []).includes(club))
    .map(p => ({ ...p, value: p[key], verified: p.played > PPRC_VERIFIED_AFTER }))
    .filter(p => !verifiedOnly || p.verified)
    .sort((a, b) => b.value - a.value || b.played - a.played || a.name.localeCompare(b.name));
  // Rank among everyone shown before the search is applied, so searching for a player still shows their true place.
  let rank = 0, previous = null;
  const ranked = rows.map((p, i) => { if (previous === null || Math.round(p.value * 100) !== Math.round(previous * 100)) rank = i + 1; previous = p.value; return { ...p, rank }; });
  return q ? ranked.filter(p => p.name.toLowerCase().includes(q)) : ranked;
}
