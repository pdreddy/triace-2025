// Season 1 ran before this app and was imported from its Realtime Database export
// (scripts/convert-season1.mjs). It is shown beside the seasons closed in the app.
import season1 from './season1.json' with { type: 'json' };
import { orderedTiers } from '../../functions/lib/tournament.js';
import { standings } from '../../functions/lib/league.js';

export const LEGACY_SEASONS = { [season1.id]: season1 };
export const seasonsOf = data => ({ ...LEGACY_SEASONS, ...(data?.seasons || {}) });
export const seasonList = data => Object.values(seasonsOf(data)).sort((a, b) => b.archivedAt - a.archivedAt);
export const seasonTeams = season => new Map(Object.values(season.tiers || {}).flatMap(t => Object.values(t.teams || {})).map(t => [t.teamId, t]));
export const seasonTable = (season, tierId) => standings(Object.values(season.tiers?.[tierId]?.teams || {}), season.fixtures?.[tierId] || {}, season.leagueRules);

// Winner and runner-up of one tier. Seasons closed in the app record them from the playoff final;
// Season 1 played separate groups, so its group winners are the top two of each final table.
export function tierResult(season, tierId) {
  const recorded = season.champions?.[tierId];
  if (recorded) return { winner: recorded.winner, runnerUp: recorded.runnerUp, basis: 'final' };
  if (!season.legacy) return null;
  const [first, second] = seasonTable(season, tierId);
  return first ? { winner: first.team.teamId, runnerUp: second?.team.teamId ?? null, basis: 'table' } : null;
}
export const seasonTiers = season => orderedTiers(season.tierConfig || {}).filter(t => season.tiers?.[t.id] || season.fixtures?.[t.id]);
