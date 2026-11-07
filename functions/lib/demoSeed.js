// Sample registered teams for the local demo, so a fresh run is not empty. Players come from the PPRC tree (the
// migration's multiclub.json) when there is one, so their ratings and verified ticks are real; otherwise made-up names.
import { initialState, applyRegistration, parseUtr } from './tournament.js';
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
      if (r && p.id && (i * 3 + k) % 4 !== 3) links.push({ teamId, role, public: true, player: { id: p.id, overall: r.overall, singles: r.singles, doubles: r.doubles, matches: (r.played?.singles || 0) + (r.played?.doubles || 0) } });
    });
  }
  if (links.length) state = applyLinkPprc(state, { links }, true, now).state;
  return { state, summary: { teams: created.length, linked: links.length } };
}

// ---------- Your real teams, from the live admin's CSV export (Private registrations > Export) ----------
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Registers every team in the CSV into a clean demo state (settings and tier setup of `base` are kept). The CSV has one
// counted UTR per player, used as their singles UTR; WhatsApp numbers are used when valid, otherwise made-up ones. A
// team that fits no tier is skipped and reported.
export function buildDemoStateFromCsv(csv, { base = null, now = Date.now() } = {}) {
  const [head = [], ...body] = parseCsv(String(csv).replace(/^\uFEFF/, '')).filter(r => r.some(c => c.trim()));
  const col = name => head.indexOf(name), get = (r, name) => (col(name) < 0 ? '' : String(r[col(name)] ?? '').trim().replace(/^'/, ''));
  if (col('Team ID') < 0 || col('Captain first name') < 0 || col('Ace 1 full name') < 0) throw new Error('This does not look like the registrations export (it needs the columns Team ID, Captain first name, Ace 1 full name).');
  let state = base?.settings ? { ...structuredClone(base), registrations: {}, tiers: {}, teamsByOwner: {}, fixtures: {} } : initialState();
  const created = [], skipped = [];
  body.forEach((r, i) => {
    const teamId = get(r, 'Team ID'), phone = (name, k) => (/^\+[1-9]\d{7,14}$/.test(get(r, name)) ? get(r, name) : `+1555000${String(i * 3 + k).padStart(4, '0')}`);
    try {
      const player = key => ({ singlesUtr: parseUtr(get(r, `${key} UTR`)), doublesUtr: null });
      const selected = get(r, 'Selected tier'), lastName = get(r, 'Captain last name');
      const payload = {
        teamId, whatsappPhone: phone('Captain WhatsApp', 1), ace1Phone: phone('Ace 1 WhatsApp', 2), ace2Phone: phone('Ace 2 WhatsApp', 3),
        selectedTier: ['higher', 'both', 'goat_fallback_rising'].includes(selected) ? selected : 'higher', consent: true, rulesAccepted: true,
        captain: { firstName: get(r, 'Captain first name'), ...(lastName ? { lastName } : {}), ...player('Captain') },
        ace1: { fullName: get(r, 'Ace 1 full name'), ...player('Ace 1') }, ace2: { fullName: get(r, 'Ace 2 full name'), ...player('Ace 2') }
      };
      state = applyRegistration(state, payload, `demo_owner_${i + 1}`, now + i).state;
      created.push(teamId);
    } catch (error) { skipped.push({ teamId: teamId || `row ${i + 2}`, reason: error.message }); }
  });
  return { state, summary: { teams: created.length, skipped } };
}
