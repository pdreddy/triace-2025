// Turns the old per-club Realtime Database export into the multi-club layout:
//   pprcMaster/  one record per person (unique name across every club), their PPRC rating and history
//   clubs/<club>/seasons/<season>/  teams and matches, with players stored as ids
// Pure (no I/O): feed it the parsed export, get back the tree to write and a report to review.
import { PPRC_PARAMS, nameKey, playerIdFor, createRegistry, resolveName, computePprc, splitHistory } from './pprc.js';

// Where each club's matches live in the old database, and which season they belong to. Earlier
// sources win when the same match appears twice (e.g. KOC2DB keeps full names, KOC2DBPONEW abbreviates them).
export const SOURCES = [
  { club: 'koc', season: 's1', path: 'KOC2DB' },
  { club: 'koc', season: 's1', path: 'KOC2DBPONEW' },
  { club: 'koc', season: 's1', path: 'KOC2DBPO' },
  { club: 'koc', season: 's3', path: 'koc_s3/matches', approvedOnly: true },
  { club: 'triace', season: 's1', path: 'TriAceDBNEW' },
  { club: 'triace', season: 's1', path: 'TriAceDB' },
  { club: 'triace', season: 's1', path: 'TriAceDB2' },
  { club: 'triace', season: 's1', path: 'TriAceDBNEW_Play', stage: 'po' },
  { club: 'triace', season: 'super6', path: 'TriAceDBSUPER6' }
];
export const CLUBS = {
  koc: { name: 'KOC', seasons: { s1: 'Season 1', s2: 'Season 2', s3: 'Season 3' } },
  triace: { name: 'Triace', seasons: { s1: 'Season 1', super6: 'Super 6' } }
};

const at = (data, path) => path.split('/').reduce((node, part) => (node == null ? node : node[part]), data);
const num = v => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const safeKey = s => String(s).replace(/[.$#[\]/\s]+/g, '_');
const editDistance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let prev = row[0]; row[0] = i; for (let j = 1; j <= b.length; j++) { const cur = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } }
  return row[b.length];
};
// A new person needs a real full name: two or more parts, none of them a lone initial or a placeholder like "P1".
const looksLikeFullName = key => { const parts = key.split(' '); return parts.length >= 2 && parts.every(p => p.length >= 2 && !/\d/.test(p)); };
const dupKey = m => [m.t1, m.t2, m.g1, m.g2, m.s1, m.s2].join('|');

// ---------- The player master ----------
export function buildMaster(data) {
  const players = {}; // id -> record
  const upsert = (name, patch) => {
    const key = nameKey(name); if (!key) return null;
    const id = playerIdFor(key);
    const cur = players[id] || { id, name: String(name).trim().replace(/\s+/g, ' '), nameKey: key, clubs: {}, seed: {} };
    players[id] = { ...cur, ...patch, seed: { ...cur.seed, ...(patch.seed || {}) } };
    return id;
  };
  // Best known ratings first: the graded list, then the auction roster, then the season rating table.
  for (const g of data.koc_users_grades || []) if (g?.name) upsert(g.name, { seed: { singles: num(g.s), doubles: num(g.d) }, seedSource: 'koc_users_grades', clubs: { koc: true } });
  for (const p of Object.values(data.koc_s3?.playerRatings || {})) {
    const id = upsert(p.fullName || p.name, { clubs: { koc: true } }); if (!id) continue;
    const s = players[id].seed;
    players[id].seed = { singles: s.singles ?? num(p.verifiedSinglesUtr) ?? num(p.singlesUtr), doubles: s.doubles ?? num(p.verifiedDoublesUtr) ?? num(p.doublesUtr) };
    players[id].seedSource ||= 'koc_s3/playerRatings';
  }
  // Claimed profiles only contribute the old id, never contact details.
  for (const [k, v] of Object.entries(data.ratingsMaster || {})) {
    const id = playerIdFor(v?.name || k);
    if (players[id] && v?.playerId) players[id].legacyIds = [...new Set([...(players[id].legacyIds || []), v.playerId])];
  }
  return players;
}

// ---------- Matches ----------
const courtType = line => (line.type === 'singles' || line.type === 'doubles' ? line.type : /^s/i.test(line.label || '') ? 'singles' : 'doubles');
function courtWinner(line, match) {
  if (line.winnerTeamNum === 1 || line.winnerTeamNum === 2) return line.winnerTeamNum === 1 ? 'home' : 'away';
  const w1 = num(line.setWins?.team1), w2 = num(line.setWins?.team2);
  if (w1 != null && w2 != null && w1 !== w2) return w1 > w2 ? 'home' : 'away';
  if (line.winner && nameKey(line.winner) === nameKey(match.t1)) return 'home';
  if (line.winner && nameKey(line.winner) === nameKey(match.t2)) return 'away';
  const g1 = num(line.g1) ?? 0, g2 = num(line.g2) ?? 0;
  return g1 === g2 ? null : g1 > g2 ? 'home' : 'away';
}

export function buildMultiClub(data, { overrides = {}, createMissing = true, sources = SOURCES, params = PPRC_PARAMS } = {}) {
  const master = buildMaster(data);
  // An override is either an existing player id, or { name, singles?, doubles? } for a person who is not in the master yet.
  const resolvedOverrides = {};
  for (const [raw, value] of Object.entries(overrides)) {
    if (!value) continue;
    if (typeof value === 'string') { resolvedOverrides[raw] = value; continue; }
    const id = playerIdFor(value.name);
    master[id] ||= { id, name: String(value.name).trim().replace(/\s+/g, ' '), nameKey: nameKey(value.name), clubs: {}, seed: { singles: num(value.singles), doubles: num(value.doubles) }, seedSource: 'override' };
    resolvedOverrides[raw] = id;
  }
  const registry = createRegistry(Object.values(master).map(p => ({ id: p.id, name: p.name })), resolvedOverrides);
  const report = { sources: [], names: { how: {}, unresolved: {}, ambiguous: {}, similar: {}, provisional: [] }, courts: { total: 0, rated: 0, skipped: {} }, seasons: {} };
  const tree = { clubs: {} };
  for (const [club, def] of Object.entries(CLUBS)) tree.clubs[club] = { meta: { name: def.name }, seasons: Object.fromEntries(Object.entries(def.seasons).map(([s, label]) => [s, { meta: { label }, matches: {} }])) };

  // Names are resolved in passes: exact and unique-token matches first, which also tells us who plays for
  // each team; then ambiguous first names are settled from that team's own players; only then is anyone created.
  const slots = [], rosters = new Map();
  const ratedMatches = [], seenIds = new Set(), seenKeys = new Set();
  for (const src of sources) {
    const raw = at(data, src.path) || {}, stat = { path: src.path, club: src.club, season: src.season, read: 0, duplicate: 0, notApproved: 0, imported: 0 };
    report.sources.push(stat);
    for (const [legacyId, m] of Object.entries(raw)) {
      stat.read++;
      if (src.approvedOnly && String(m.status || '').toUpperCase() !== 'APPROVED') { stat.notApproved++; continue; }
      const idKey = `${src.club}/${src.season}/${legacyId}`, key = `${src.club}/${src.season}/${dupKey(m)}`;
      if (seenIds.has(idKey) || seenKeys.has(key)) { stat.duplicate++; continue; }
      seenIds.add(idKey); seenKeys.add(key);
      const id = safeKey(`${src.club}-${src.season}-${legacyId}`), ts = num(m.ts) ?? num(m.createdAt) ?? 0;
      const team = side => `${src.club}/${src.season}/${nameKey(side === 'home' ? m.t1 : m.t2)}`;
      const courts = (m.lines || []).map((line, i) => {
        const names = { home: line.players?.team1 || [], away: line.players?.team2 || [] };
        const court = {
          label: line.label || `Court ${i + 1}`, type: courtType(line), names, ids: { home: [], away: [] },
          homeGames: num(line.g1) ?? 0, awayGames: num(line.g2) ?? 0, winner: courtWinner(line, m) || undefined,
          score: (line.sets || []).map(x => `${x.team1}-${x.team2}`).join(' ') || undefined
        };
        for (const sideName of ['home', 'away']) names[sideName].forEach((rawName, k) => slots.push({ rawName, team: team(sideName), club: src.club, season: src.season, set: id => { court.ids[sideName][k] = id; } }));
        return court;
      });
      const canonical = {
        id, club: src.club, season: src.season, stage: m.isPlayoff ? 'po' : src.stage || 'rr', ts,
        home: { name: m.t1, ...(m.t1Id ? { teamId: m.t1Id } : {}) }, away: { name: m.t2, ...(m.t2Id ? { teamId: m.t2Id } : {}) },
        courts, source: { path: src.path, legacyId }
      };
      tree.clubs[src.club].seasons[src.season].matches[id] = canonical;
      ratedMatches.push(canonical); stat.imported++;
    }
  }
  const learn = (slot, id) => { slot.set(id); (rosters.get(slot.team) || rosters.set(slot.team, new Set()).get(slot.team)).add(id); };
  const pending = [];
  for (const slot of slots) { // pass 1: no guessing
    const r = resolveName(registry, slot.rawName);
    if (r.id) { learn(slot, r.id); report.names.how[r.how] = (report.names.how[r.how] || 0) + 1; } else pending.push(slot);
  }
  const stillPending = [];
  for (const slot of pending) { // pass 2: the team's own players decide
    const r = resolveName(registry, slot.rawName, { roster: [...(rosters.get(slot.team) || [])] });
    if (r.id) { learn(slot, r.id); report.names.how[r.how] = (report.names.how[r.how] || 0) + 1; } else stillPending.push({ slot, r });
  }
  const allKeys = () => Object.values(master).map(p => p.nameKey);
  for (const { slot, r } of stillPending) { // pass 3: create a person only for a clear, new full name
    const key = nameKey(slot.rawName), known = resolveName(registry, slot.rawName); // someone created a moment ago may now match
    if (known.id) { learn(slot, known.id); report.names.how[known.how] = (report.names.how[known.how] || 0) + 1; continue; }
    if (r.how === 'ambiguous') { const e = report.names.ambiguous[slot.rawName] ||= { count: 0, candidates: r.candidates, in: {} }; e.count++; e.in[`${slot.club}/${slot.season}`] = (e.in[`${slot.club}/${slot.season}`] || 0) + 1; report.names.how.ambiguous = (report.names.how.ambiguous || 0) + 1; continue; }
    const similar = looksLikeFullName(key) ? allKeys().find(k => k.length >= 8 && editDistance(k, key) <= 2) : null;
    if (createMissing && looksLikeFullName(key) && !similar) {
      const id = playerIdFor(key);
      if (!master[id]) { master[id] = { id, name: String(slot.rawName).trim().replace(/\s+/g, ' '), nameKey: key, clubs: {}, seed: {}, provisional: true }; registry.add({ id, name: master[id].name }); report.names.provisional.push(master[id].name); }
      learn(slot, id); report.names.how.created = (report.names.how.created || 0) + 1; continue;
    }
    const bucket = similar ? report.names.similar : report.names.unresolved;
    const e = bucket[slot.rawName] ||= { count: 0, in: {}, ...(similar ? { closeTo: similar } : {}) }; e.count++; e.in[`${slot.club}/${slot.season}`] = (e.in[`${slot.club}/${slot.season}`] || 0) + 1;
    report.names.how.unresolved = (report.names.how.unresolved || 0) + 1;
  }
  for (const m of ratedMatches) for (const c of m.courts) {
    const complete = ['home', 'away'].every(sideName => c.names[sideName].length && c.names[sideName].every((_, k) => c.ids[sideName][k]));
    c.home = complete ? c.ids.home : undefined; c.away = complete ? c.ids.away : undefined; delete c.ids;
  }

  // Team rosters for the current KOC season (passwords and other private fields are never copied).
  const teams = {};
  for (const t of Object.values(data.koc_s3?.teams || {})) {
    teams[t.id] = { id: t.id, name: t.name, abbreviation: t.abbreviation, group: t.group, captain: resolveName(registry, t.captain).id || null, players: (t.players || []).map(p => resolveName(registry, p.name).id).filter(Boolean) };
    for (const id of teams[t.id].players) if (master[id]) master[id].clubs.koc = true;
  }
  tree.clubs.koc.seasons.s3.teams = teams;
  tree.clubs.koc.seasons.s2.meta.note = 'No season 2 match data exists in the export.';

  // One rating run over every club and season, in time order.
  const seeds = Object.fromEntries(Object.values(master).map(p => [p.id, { singles: p.seed?.singles, doubles: p.seed?.doubles }]));
  const rated = computePprc({ players: seeds, matches: ratedMatches, params });
  for (const m of ratedMatches) for (const c of m.courts) { report.courts.total++; }
  report.courts.skipped = rated.skipped.reduce((o, s) => ({ ...o, [s.reason]: (o[s.reason] || 0) + 1 }), {});
  report.courts.rated = report.courts.total - rated.skipped.length;
  for (const m of ratedMatches) { const s = report.seasons[`${m.club}/${m.season}`] ||= { matches: 0, courts: 0 }; s.matches++; s.courts += m.courts.length; }

  // Stored by calendar year so a player's page can load the latest ten and open one year at a time.
  const ratingHistory = {}, recent = {};
  for (const [pid, entries] of Object.entries(rated.history)) {
    if (!entries.length) continue;
    const view = splitHistory(entries);
    recent[pid] = view.recent;
    for (const [i, e] of [...entries].sort((a, b) => a.ts - b.ts).entries()) {
      const year = new Date(e.ts).getUTCFullYear();
      ((ratingHistory[pid] ||= {})[year] ||= {})[safeKey(`${e.matchId}_${String(i).padStart(3, '0')}`)] = e;
    }
  }
  const nameIndex = Object.fromEntries(Object.values(master).map(p => [p.nameKey, p.id]));
  tree.pprcMaster = {
    meta: { algorithm: params, builtFrom: sources.map(s => s.path), players: Object.keys(master).length },
    players: Object.fromEntries(Object.values(master).map(({ id, ...p }) => [id, p])),
    nameIndex, ratings: rated.ratings, ratingHistory, recent
  };
  report.players = { total: Object.keys(master).length, provisional: report.names.provisional.length, rated: Object.values(rated.ratings).filter(r => r.played.singles + r.played.doubles > 0).length };
  report.skippedCourts = rated.skipped;
  return { tree, report };
}

// A readable summary of what a migration would do.
export function reportText(report) {
  const lines = ['# PPRC migration report (dry run)', '', '## Players', `- ${report.players.total} people in the master (${report.players.provisional} created from match names, flagged \`provisional\`)`, `- ${report.players.rated} have at least one rated court`, '', '## Matches by source'];
  for (const s of report.sources) lines.push(`- ${s.path} → ${s.club}/${s.season}: ${s.read} read, ${s.imported} imported, ${s.duplicate} duplicates${s.notApproved ? `, ${s.notApproved} not approved` : ''}`);
  lines.push('', '## Seasons', ...Object.entries(report.seasons).map(([k, v]) => `- ${k}: ${v.matches} matches, ${v.courts} courts`));
  lines.push('', '## Courts', `- ${report.courts.total} courts, ${report.courts.rated} rated, skipped: ${JSON.stringify(report.courts.skipped)}`);
  lines.push('', '## How names were matched', ...Object.entries(report.names.how).map(([k, v]) => `- ${k}: ${v}`));
  const amb = Object.entries(report.names.ambiguous).sort((a, b) => b[1].count - a[1].count), unk = Object.entries(report.names.unresolved).sort((a, b) => b[1].count - a[1].count);
  lines.push('', `## Needs a decision: ambiguous names (${amb.length})`, ...amb.map(([n, v]) => `- "${n}" ×${v.count}: ${v.candidates.join(', ')}`));
  lines.push('', `## Needs a decision: unknown single names (${unk.length})`, ...unk.map(([n, v]) => `- "${n}" ×${v.count}`));
  const sim = Object.entries(report.names.similar || {});
  lines.push('', `## Possible misspellings: not created, point them at the right person in overrides.json (${sim.length})`, ...sim.map(([n, v]) => `- "${n}" ×${v.count} looks like ${v.closeTo}`));
  lines.push('', `## New people created from match names (${report.names.provisional.length})`, ...[...new Set(report.names.provisional)].map(n => `- ${n}`));
  return lines.join('\n');
}
