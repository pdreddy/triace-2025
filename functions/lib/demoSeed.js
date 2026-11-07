// Sample registered teams for the local demo, so a fresh run is not empty. Players come from the PPRC tree (the
// migration's multiclub.json) when there is one, so their ratings and verified ticks are real; otherwise made-up names.
import { initialState, applyRegistration } from './tournament.js';
import { applyLinkPprc } from './league.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const syntheticPlayers = count => Array.from({ length: count }, (_, i) => ({ id: null, name: `Demo Player${String.fromCharCode(97 + (i % 26))} Sample${i + 1}`, singles: 4 + (i % 9) * 0.35, doubles: 4.1 + (i % 9) * 0.35, matches: 0 }));

function playersFrom(tree, count) {
  const master = tree?.pprcMaster;
  if (!master?.playerList) return syntheticPlayers(count);
  return Object.entries(master.playerList)
    .map(([id, p]) => ({ id, name: master.players?.[id]?.name || p.name, needsFullName: master.players?.[id]?.needsFullName, singles: master.ratings?.[id]?.seed?.singles ?? 5, doubles: master.ratings?.[id]?.seed?.doubles ?? 5, rating: master.ratings?.[id], overall: p.overall }))
    .filter(p => !p.needsFullName && p.name.split(' ').length >= 2)
    .sort((a, b) => b.overall - a.overall);
}

// `base` is the demo's existing state (so its settings are kept); without one the defaults are used.
export function buildDemoState(tree, { teams = 8, now = Date.now(), base = null } = {}) {
  const pool = playersFrom(tree, teams * 3), n = pool.length;
  let state = base?.settings ? structuredClone(base) : initialState();
  const created = [], links = [];
  for (let i = 0; i < teams && i + 2 * Math.floor(n / 3) < n; i++) {
    const picks = [pool[i], pool[i + Math.floor(n / 3)], pool[i + 2 * Math.floor(n / 3)]];
    if (new Set(picks.map(p => p.name)).size < 3) continue;
    const utr = p => ({ singlesUtr: clamp(Math.round(p.singles * 100), 100, 1650), doublesUtr: clamp(Math.round(p.doubles * 100), 100, 1650) });
    const teamId = `demo_team_${String(i + 1).padStart(2, '0')}_sample0000`;
    const phone = k => `+1555000${String(i * 3 + k).padStart(4, '0')}`;
    const payload = {
      teamId, whatsappPhone: phone(1), ace1Phone: phone(2), ace2Phone: phone(3), selectedTier: 'higher', consent: true, rulesAccepted: true,
      captain: { firstName: picks[0].name.split(' ')[0], ...utr(picks[0]) }, ace1: { fullName: picks[1].name, ...utr(picks[1]) }, ace2: { fullName: picks[2].name, ...utr(picks[2]) }
    };
    try { state = applyRegistration(state, payload, `demo_owner_${i + 1}`, now + i).state; } catch { continue; } // a team that fits no tier is left out
    created.push(teamId);
    ['captain', 'ace1', 'ace2'].forEach((role, k) => {
      const p = picks[k], r = p.rating;
      // Most players are linked; every fourth is left unlinked so the NR badge shows too.
      if (r && p.id && (i * 3 + k) % 4 !== 3) links.push({ teamId, role, player: { id: p.id, overall: r.overall, singles: r.singles, doubles: r.doubles, matches: (r.played?.singles || 0) + (r.played?.doubles || 0) } });
    });
  }
  if (links.length) state = applyLinkPprc(state, { links }, true, now).state;
  return { state, summary: { teams: created.length, linked: links.length } };
}
