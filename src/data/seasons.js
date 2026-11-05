// Season 1 ran before this app. Its matches come from the Realtime Database export
// (scripts/convert-season1.mjs → season1.json); its published table, team members and
// winners live in season1-table.json, which is edited by hand.
import export1 from './season1.json' with { type: 'json' };
import published from './season1-table.json' with { type: 'json' };
import { orderedTiers } from '../../functions/lib/tournament.js';
import { standings } from '../../functions/lib/league.js';

function legacySeason() {
  const season = structuredClone(export1);
  season.champions = published.champions || {};
  season.superSix = published.superSix;
  // Winners are decided in the Super Six, which has its own two tiers.
  season.championTiers = Object.entries(published.superSix.tiers).map(([id, t]) => ({ id, name: t.name }));
  season.table = published.tables;
  for (const [tierId, rows] of Object.entries(published.tables)) {
    season.tiers[tierId] ||= { teams: {} };
    for (const row of rows) {
      const team = season.tiers[tierId].teams[row.teamId] ||= { teamId: row.teamId, name: `Team ${row.teamId.toUpperCase()}` };
      team.members = row.members;
    }
  }
  for (const [teamId, roster] of Object.entries(published.superSix.rosters)) {
    const team = Object.values(season.tiers).map(t => t.teams[teamId]).find(Boolean);
    if (team) team.superSixMembers = roster; // the Super Six squads differ slightly from the group-stage ones
  }
  return season;
}
const season1 = legacySeason();

export const LEGACY_SEASONS = { [season1.id]: season1 };
export const seasonsOf = data => ({ ...LEGACY_SEASONS, ...(data?.seasons || {}) });
export const seasonList = data => Object.values(seasonsOf(data)).sort((a, b) => b.archivedAt - a.archivedAt);
export const seasonTeams = season => new Map(Object.values(season.tiers || {}).flatMap(t => Object.values(t.teams || {})).map(t => [t.teamId, t]));
export const seasonTable = (season, tierId) => standings(Object.values(season.tiers?.[tierId]?.teams || {}), season.fixtures?.[tierId] || {}, season.leagueRules);
export const championTiers = season => season.championTiers || seasonTiers(season);
export const seasonTiers = season => orderedTiers(season.tierConfig || {}).filter(t => season.tiers?.[t.id] || season.fixtures?.[t.id]);

// Winner and runner-up of one tier, or null while they are not recorded (Season 1: not announced yet).
export const tierResult = (season, tierId) => season.champions?.[tierId] || null;
