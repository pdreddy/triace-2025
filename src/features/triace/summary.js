// What Player Home shows about a signed-in captain's TRIACE team. Read-only: it uses the same public data and the same
// standings function as the TRIACE pages, so the card can never disagree with them.
import { standings } from '../../../functions/lib/league.js';
import { orderedTiers } from '../../../functions/lib/tournament.js';
import { teamIndex, teamName } from '../../components/League';

export function triaceSummary(data, teamId) {
  const teams = teamIndex(data), team = teams.get(teamId);
  if (!team) return null;
  const tiers = orderedTiers(data.tierConfig || {}).filter(t => data.tiers?.[t.id]?.teams?.[teamId]);
  const row = tiers[0] && standings(Object.values(data.tiers[tiers[0].id].teams), data.fixtures?.[tiers[0].id], data.leagueRules).find(r => r.team.teamId === teamId);
  const next = tiers.flatMap(t => Object.values(data.fixtures?.[t.id] || {})).filter(f => (f.home === teamId || f.away === teamId) && f.status !== 'final')
    .sort((a, b) => (a.dueBy || '9999').localeCompare(b.dueBy || '9999') || a.round - b.round)[0];
  return {
    teamId, name: teamName(team), tier: tiers.map(t => t.name).join(' · ') || 'Not placed yet',
    record: row && row.played ? `${row.won}–${row.lost} · #${row.position} of ${Object.keys(data.tiers[tiers[0].id].teams).length}` : null,
    next: next ? { opponent: teamName(teams.get(next.home === teamId ? next.away : next.home)), dueBy: next.dueBy || null } : null
  };
}
