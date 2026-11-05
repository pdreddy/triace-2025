// Season 1 ran before this app. Its matches come from the Realtime Database export
// (scripts/convert-season1.mjs → season1.json); its published table, squads, Super Six and
// winners live in season1-table.json, which is edited by hand. Both ship with the app as a
// snapshot. When the same data exists in Firebase (at the configured Season 1 path, see
// Admin → Firebase) the live copy is used instead, so Season 1 and Season 2 share one database.
import export1 from './season1.json' with { type: 'json' };
import published1 from './season1-table.json' with { type: 'json' };
import { orderedTiers } from '../../functions/lib/tournament.js';
import { standings } from '../../functions/lib/league.js';

// The raw legacy season: what is imported into Firebase and what hydrate() turns into a season.
export const bundledSeason1 = () => ({ ...structuredClone(export1), published: structuredClone(published1) });

const hydrated = new WeakMap();
export function hydrateLegacy(raw) {
  if (hydrated.has(raw)) return hydrated.get(raw);
  const season = structuredClone(raw), published = season.published || {};
  const fullNames = published.fullNames || {};
  const fullName = name => fullNames[name.trim()] || name.trim();
  const fullSquad = squad => squad.split('/').map(fullName).join(' / ');
  const tables = published.tables || {}, superSix = published.superSix || { tiers: {}, rosters: {}, weeks: [], scoring: { matchPoints: [] } };
  delete season.published;
  season.legacy = true;
  season.champions = published.champions || {};
  season.superSix = superSix;
  // Winners are decided in the Super Six, which has its own two tiers.
  season.championTiers = Object.entries(superSix.tiers).map(([id, t]) => ({ id, name: t.name }));
  season.table = tables;
  for (const [tierId, rows] of Object.entries(tables)) {
    season.tiers[tierId] ||= { teams: {} };
    for (const row of rows) {
      const team = season.tiers[tierId].teams[row.teamId] ||= { teamId: row.teamId, name: `Team ${row.teamId.toUpperCase()}` };
      team.members = row.members;
      team.fullMembers = fullSquad(row.members); // Champions page only
    }
  }
  // Last five results per team, oldest first, from the imported encounters.
  const played = Object.values(season.fixtures).flatMap(f => Object.values(f)).sort((a, b) => a.completedAt - b.completedAt);
  for (const rows of Object.values(tables)) {
    for (const row of rows) {
      row.form = played.filter(f => f.home === row.teamId || f.away === row.teamId).map(f => (f[f.result.winner] === row.teamId ? 'W' : 'L')).slice(-5);
    }
  }
  for (const [teamId, roster] of Object.entries(superSix.rosters || {})) {
    const team = Object.values(season.tiers).map(t => t.teams[teamId]).find(Boolean);
    if (!team) continue;
    team.superSixMembers = roster; // the Super Six squads differ slightly from the group-stage ones
    team.superSixFullMembers = fullSquad(roster); // Champions page only
  }
  hydrated.set(raw, season);
  return season;
}

const bundled = bundledSeason1();
export const season1Source = data => (data?.legacySeasons?.s1 ? 'firebase' : 'bundled');
export const seasonsOf = data => ({ s1: hydrateLegacy(data?.legacySeasons?.s1 || bundled), ...(data?.seasons || {}) });
export const seasonList = data => Object.values(seasonsOf(data)).sort((a, b) => b.archivedAt - a.archivedAt);
export const seasonTeams = season => new Map(Object.values(season.tiers || {}).flatMap(t => Object.values(t.teams || {})).map(t => [t.teamId, t]));
export const seasonTable = (season, tierId) => standings(Object.values(season.tiers?.[tierId]?.teams || {}), season.fixtures?.[tierId] || {}, season.leagueRules);
export const seasonTiers = season => orderedTiers(season.tierConfig || {}).filter(t => season.tiers?.[t.id] || season.fixtures?.[t.id]);
export const championTiers = season => season.championTiers || seasonTiers(season);

// Winner and runner-up of one tier, or null while they are not recorded.
export const tierResult = (season, tierId) => season.champions?.[tierId] || null;
