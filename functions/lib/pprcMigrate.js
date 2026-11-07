// Turns the old per-club Realtime Database export into the multi-club layout:
//   pprcMaster/  one record per person (unique name across every club), their PPRC rating and history
//   clubs/<club>/seasons/<season>/  teams and matches (KOC has seasons 2 and 3, Triace season 1), with players stored as ids
// Pure (no I/O): feed it the parsed export, get back the tree to write and a report to review.
import { PPRC_PARAMS, displayName, nameKey, playerIdFor, createRegistry, resolveName, computePprc, splitHistory } from './pprc.js';

// Where each club's matches live in the old database, and which season they belong to. Earlier
// sources win when the same match appears twice (e.g. KOC2DB, KOC season 2, keeps full names; KOC2DBPONEW abbreviates them).
export const SOURCES = [
  { club: 'koc', season: 's2', path: 'KOC2DB' },
  { club: 'koc', season: 's2', path: 'KOC2DBPONEW' },
  { club: 'koc', season: 's2', path: 'KOC2DBPO' },
  { club: 'koc', season: 's3', path: 'koc_s3/matches', approvedOnly: true },
  { club: 'triace', season: 's1', path: 'TriAceDBNEW' },
  { club: 'triace', season: 's1', path: 'TriAceDB' },
  { club: 'triace', season: 's1', path: 'TriAceDB2' },
  { club: 'triace', season: 's1', path: 'TriAceDBNEW_Play', stage: 'po' },
  { club: 'triace', season: 's1', path: 'TriAceDBSUPER6', stage: 'po' }
];
// A decision of this value means "not a real player": that name is left unrated and never asked about again.
export const IGNORE = '__ignore__';
export const CLUBS = {
  koc: { name: 'KOC', seasons: { s2: 'Season 2', s3: 'Season 3' } }, // there is no season 1 data
  triace: { name: 'Triace', seasons: { s1: 'Season 1' } }
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
export function buildMaster(data, notes = {}) {
  const players = {}; // id -> record
  const upsert = (name, patch) => {
    const key = nameKey(name); if (!key) return null;
    const id = playerIdFor(key);
    const cur = players[id] || { id, name: displayName(name), nameKey: key, clubs: {}, seed: {} };
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
  // Everyone named on a team roster or in an auction is a real person even if they were never graded. Adding
  // them with their full names is what lets a first name in an old match find its owner.
  const rosterNames = new Set();
  const addRoster = (name, seed) => {
    const key = nameKey(name); if (!key || key.split(' ').length < 2 || /^player \d+$/.test(key)) return;
    rosterNames.add(name);
    if (players[playerIdFor(key)]) return;
    // The same person under a shorter or reordered name (e.g. "Satish Orugunta", "Noufal Mohamed") is an alias, not a new person.
    const tokens = key.split(' '), covers = (a, b) => a.every(x => b.some(y => y.startsWith(x)));
    const same = Object.values(players).filter(p => { const t = p.nameKey.split(' '); return covers(tokens, t) || covers(t, tokens); });
    if (same.length === 1) { same[0].aliases = [...new Set([...(same[0].aliases || []), String(name).trim()])]; return; }
    if (same.length > 1) { (notes.similarRoster ||= {})[name] = same.map(p => p.nameKey).join(' / '); return; }
    const near = Object.values(players).find(p => p.nameKey.length >= 8 && editDistance(p.nameKey, key) <= 2);
    if (near) { (notes.similarRoster ||= {})[name] = near.nameKey; return; }
    upsert(name, { seed: seed || {}, seedSource: 'roster', clubs: { koc: true }, fromRoster: true });
  };
  // KOC season 3 is the cleanest list, so it goes in first and its spellings win; older rosters only add to it.
  for (const t of Object.values(data.koc_s3?.teams || {})) for (const p of t.players || []) addRoster(p.name);
  notes.preferred = new Set(Object.keys(players));
  for (const t of Object.values(data.koc_s2?.teams || {})) for (const p of t.players || []) addRoster(p.name);
  for (const a of Object.values(data.auctions || {})) for (const t of a.teams || []) for (const p of t.players || []) addRoster(p.Name);
  for (const a of Object.values(data.auctionsdata || {})) for (const p of a.cfgPlayers || []) addRoster(p.Name, { singles: num(p.s), doubles: num(p.d) });
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
  const notes = {}, master = buildMaster(data, notes);
  // An override is an existing player id, a full name (an existing person, or a new one), or { name, singles?, doubles? }.
  // Key it by the name as written, or "<team>::<name>" to settle that name only for one team (e.g. "Team A4::Vinod").
  const idForDecision = value => {
    const name = typeof value === 'string' ? value : value.name;
    if (typeof value === 'string' && master[value]) return value;
    const id = playerIdFor(name), seed = typeof value === 'object' ? { singles: num(value.singles), doubles: num(value.doubles) } : {};
    master[id] ||= { id, name: displayName(name), nameKey: nameKey(name), clubs: {}, seed, seedSource: 'override', ...(nameKey(name).split(' ').length < 2 ? { needsFullName: true } : {}) };
    return id;
  };
  const resolvedOverrides = {}, scopedOverrides = {}, ignored = new Set();
  for (const [raw, value] of Object.entries(overrides)) {
    if (!value) continue;
    if (value === IGNORE) { ignored.add(raw.includes('::') ? `${nameKey(raw.split('::')[0])}::${nameKey(raw.split('::')[1])}` : nameKey(raw)); continue; }
    const [team, name] = raw.includes('::') ? raw.split('::') : [null, raw];
    if (team) scopedOverrides[`${nameKey(team)}::${nameKey(name)}`] = idForDecision(value); else resolvedOverrides[raw] = idForDecision(value);
  }
  const registry = createRegistry(Object.values(master).map(p => ({ id: p.id, name: p.name, aliases: p.aliases })), resolvedOverrides);
  const report = { sources: [], names: { how: {}, unresolved: {}, ambiguous: {}, similar: {}, provisional: [] }, decisions: [], courts: { total: 0, rated: 0, skipped: {} }, seasons: {} };
  const tree = { clubs: {} };
  for (const [club, def] of Object.entries(CLUBS)) tree.clubs[club] = { meta: { name: def.name }, seasons: Object.fromEntries(Object.entries(def.seasons).map(([s, label]) => [s, { meta: { label }, matches: {} }])) };

  // Names are resolved in passes: exact and unique-token matches first, which also tells us who plays for
  // each team; then ambiguous first names are settled from that team's own players; only then is anyone created.
  const slots = [], rosters = new Map();
  const ratedMatches = [], seenIds = new Set(), seenKeys = new Map();
  for (const src of sources) {
    const raw = at(data, src.path) || {}, stat = { path: src.path, club: src.club, season: src.season, read: 0, duplicate: 0, notApproved: 0, imported: 0 };
    report.sources.push(stat);
    for (const [legacyId, m] of Object.entries(raw)) {
      stat.read++;
      if (src.approvedOnly && String(m.status || '').toUpperCase() !== 'APPROVED') { stat.notApproved++; continue; }
      const idKey = `${src.club}/${src.season}/${legacyId}`, key = `${src.club}/${src.season}/${dupKey(m)}`;
      if (seenIds.has(idKey) || seenKeys.has(key)) {
        stat.duplicate++;
        if (src.stage === 'po' && seenKeys.get?.(key)) seenKeys.get(key).stage = 'po'; // the same match listed again as a playoff: it is a playoff
        continue;
      }
      seenIds.add(idKey);
      const id = safeKey(`${src.club}-${src.season}-${legacyId}`), ts = num(m.ts) ?? num(m.createdAt) ?? 0;
      const team = side => `${src.club}/${src.season}/${nameKey(side === 'home' ? m.t1 : m.t2)}`;
      const courts = (m.lines || []).map((line, i) => {
        const names = { home: line.players?.team1 || [], away: line.players?.team2 || [] };
        const court = {
          label: line.label || `Court ${i + 1}`, type: courtType(line), names, ids: { home: [], away: [] },
          homeGames: num(line.g1) ?? 0, awayGames: num(line.g2) ?? 0, winner: courtWinner(line, m) || undefined,
          score: (line.sets || []).map(x => `${x.team1}-${x.team2}`).join(' ') || undefined
        };
        for (const sideName of ['home', 'away']) names[sideName].forEach((rawName, k) => slots.push({ rawName, court, sideName, ts, vs: sideName === 'home' ? m.t2 : m.t1, team: team(sideName), teamName: sideName === 'home' ? m.t1 : m.t2, club: src.club, season: src.season, set: id => { court.ids[sideName][k] = id; } }));
        return court;
      });
      const canonical = {
        id, club: src.club, season: src.season, stage: m.isPlayoff ? 'po' : src.stage || 'rr', ts,
        home: { name: m.t1, ...(m.t1Id ? { teamId: m.t1Id } : {}) }, away: { name: m.t2, ...(m.t2Id ? { teamId: m.t2Id } : {}) },
        courts, source: { path: src.path, legacyId }
      };
      tree.clubs[src.club].seasons[src.season].matches[id] = canonical;
      seenKeys.set(key, canonical); ratedMatches.push(canonical); stat.imported++;
    }
  }
  // Known rosters by team name (KOC only): seasons 2 and 3 and every auction.
  const known = new Map();
  const knownAdd = (teamName, names) => {
    const k = nameKey(teamName); if (!k) return;
    const set = known.get(k) || known.set(k, new Set()).get(k);
    for (const n of names) { const id = resolveName(registry, n).id; if (id) set.add(id); }
  };
  for (const t of [...Object.values(data.koc_s2?.teams || {}), ...Object.values(data.koc_s3?.teams || {})]) knownAdd(t.name, (t.players || []).map(p => p.name));
  for (const a of Object.values(data.auctions || {})) for (const t of a.teams || []) knownAdd(t.name, (t.players || []).map(p => p.Name));
  const rosterFor = slot => { const learned = rosters.get(slot.team) || new Set(); if (slot.club !== 'koc') return [...learned]; return [...new Set([...learned, ...(known.get(slot.team.split('/').pop()) || [])])]; };
  // What a person deciding needs to see: who else was on court, who against, which opponent team, when.
  const context = slot => ({ ts: slot.ts, season: `${slot.club}/${slot.season}`, court: slot.court.label, with: slot.court.names[slot.sideName].filter(n => n !== slot.rawName), against: slot.court.names[slot.sideName === 'home' ? 'away' : 'home'], vs: slot.vs });
  const learn = (slot, id) => { slot.set(id); (rosters.get(slot.team) || rosters.set(slot.team, new Set()).get(slot.team)).add(id); };
  const pending = [];
  for (const slot of slots) { // pass 1: no guessing
    if (ignored.has(`${nameKey(slot.teamName)}::${nameKey(slot.rawName)}`) || ignored.has(nameKey(slot.rawName))) { report.names.how.ignored = (report.names.how.ignored || 0) + 1; continue; }
    const scoped = scopedOverrides[`${nameKey(slot.teamName)}::${nameKey(slot.rawName)}`];
    const r = scoped ? { id: scoped, how: 'override' } : resolveName(registry, slot.rawName);
    if (r.id) { learn(slot, r.id); report.names.how[r.how] = (report.names.how[r.how] || 0) + 1; } else pending.push(slot);
  }
  const stillPending = [];
  for (const slot of pending) { // pass 2: the team's own players decide
    const r = resolveName(registry, slot.rawName, { roster: rosterFor(slot), preferred: notes.preferred });
    if (r.id) { learn(slot, r.id); report.names.how[r.how] = (report.names.how[r.how] || 0) + 1; } else stillPending.push({ slot, r });
  }
  // For a name that matches nobody: the closest KOC season 3 names, so the person deciding has something to click.
  const closest = raw => {
    const first = nameKey(raw).split(' ')[0]; if (first.length < 3) return [];
    return [...notes.preferred].map(id => ({ id, d: Math.min(...master[id].nameKey.split(' ').map(t => (t.length >= 3 && (t.startsWith(first) || first.startsWith(t)) ? 0.5 : editDistance(t, first)))) }))
      .filter(x => x.d <= 1.5).sort((a, b) => a.d - b.d || a.id.localeCompare(b.id)).slice(0, 4).map(x => x.id);
  };
  const allKeys = () => Object.values(master).map(p => p.nameKey);
  for (const { slot, r } of stillPending) { // pass 3: create a person only for a clear, new full name
    const key = nameKey(slot.rawName), known = resolveName(registry, slot.rawName); // someone created a moment ago may now match
    if (known.id) { learn(slot, known.id); report.names.how[known.how] = (report.names.how[known.how] || 0) + 1; continue; }
    if (r.how === 'ambiguous') { report.decisions.push({ raw: slot.rawName, team: slot.teamName, kind: 'ambiguous', candidates: r.candidates, ctx: context(slot) }); const e = report.names.ambiguous[slot.rawName] ||= { count: 0, candidates: r.candidates, in: {} }; e.count++; e.in[`${slot.club}/${slot.season}`] = (e.in[`${slot.club}/${slot.season}`] || 0) + 1; report.names.how.ambiguous = (report.names.how.ambiguous || 0) + 1; continue; }
    const similar = looksLikeFullName(key) ? allKeys().find(k => k.length >= 8 && editDistance(k, key) <= 2) : null;
    if (createMissing && looksLikeFullName(key) && !similar) {
      const id = playerIdFor(key);
      if (!master[id]) { master[id] = { id, name: displayName(slot.rawName), nameKey: key, clubs: {}, seed: {}, provisional: true }; registry.add({ id, name: master[id].name }); report.names.provisional.push(master[id].name); }
      learn(slot, id); report.names.how.created = (report.names.how.created || 0) + 1; continue;
    }
    report.decisions.push({ raw: slot.rawName, team: slot.teamName, kind: similar ? 'similar' : 'unknown', candidates: similar ? [playerIdFor(similar)] : closest(slot.rawName), ctx: context(slot) });
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

  // One rating run over every club and season, in time order.
  const seeds = Object.fromEntries(Object.values(master).map(p => [p.id, { singles: p.seed?.singles, doubles: p.seed?.doubles }]));
  const rated = computePprc({ players: seeds, matches: ratedMatches, params });
  for (const m of ratedMatches) for (const c of m.courts) { report.courts.total++; }
  report.courts.skipped = rated.skipped.reduce((o, s) => ({ ...o, [s.reason]: (o[s.reason] || 0) + 1 }), {});
  report.courts.rated = report.courts.total - rated.skipped.length;
  for (const m of ratedMatches) { const s = report.seasons[`${m.club}/${m.season}`] ||= { matches: 0, courts: 0 }; s.matches++; s.courts += m.courts.length; }

  // Stored by calendar year so a player's page can load the latest ten and open one year at a time.
  // Every history entry says which game it was: the club (KOC, Triace), season, league or playoffs, the date, who
  // played with and against, so a profile reads as a plain list without further lookups.
  const byMatch = new Map(ratedMatches.map(m => [m.id, m])), nameOf = id => master[id]?.name || id;
  const describe = (pid, e) => {
    const m = byMatch.get(e.matchId), court = m?.courts.find(c => c.label === e.court && [...(c.home || []), ...(c.away || [])].includes(pid));
    const side = court?.home?.includes(pid) ? 'home' : 'away', competition = CLUBS[e.club]?.name || e.club, seasonLabel = CLUBS[e.club]?.seasons[e.season] || e.season, stageLabel = e.stage === 'po' ? 'Playoffs' : 'League';
    return {
      ...e, competition, seasonLabel, stageLabel, title: `${competition} · ${seasonLabel} · ${stageLabel}`, date: new Date(e.ts).toISOString().slice(0, 10),
      team: m?.[side]?.name || null, opponentTeam: m?.[side === 'home' ? 'away' : 'home']?.name || null,
      partnerName: e.partner ? nameOf(e.partner) : null, opponentNames: e.opponents.map(nameOf)
    };
  };
  for (const [pid, entries] of Object.entries(rated.history)) rated.history[pid] = entries.map(e => describe(pid, e));
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
    nameIndex, ratings: rated.ratings, ratingHistory, recent,
    // Matches per year for each player (all of them, the latest ten included), so a profile can list the years without loading them.
    historyYears: Object.fromEntries(Object.entries(ratingHistory).map(([pid, years]) => [pid, Object.fromEntries(Object.entries(years).map(([y, items]) => [y, Object.keys(items).length]))])),
    // A small list for search boxes, so a page does not have to download every profile.
    playerList: Object.fromEntries(Object.values(master).map(p => [p.id, { name: p.name, overall: rated.ratings[p.id].overall, played: rated.ratings[p.id].played.singles + rated.ratings[p.id].played.doubles, clubs: Object.keys(p.clubs || {}).concat(rated.history[p.id].some(e => e.club === 'triace') ? ['triace'] : []).filter((c, i, a) => a.indexOf(c) === i) }]))
  };
  report.players = { total: Object.keys(master).length, provisional: report.names.provisional.length, rated: Object.values(rated.ratings).filter(r => r.played.singles + r.played.doubles > 0).length };
  report.names.similarRoster = notes.similarRoster || {};
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
  const simR = Object.entries(report.names.similarRoster || {});
  const sim = Object.entries(report.names.similar || {});
  lines.push('', `## Possible misspellings: not created, point them at the right person in overrides.json (${sim.length})`, ...sim.map(([n, v]) => `- "${n}" ×${v.count} looks like ${v.closeTo}`));
  lines.push('', `## Roster names that look like an existing person (not added, check they are the same) (${simR.length})`, ...simR.map(([n, k]) => `- "${n}" looks like ${k}`));
  lines.push('', `## New people created from match names (${report.names.provisional.length})`, ...[...new Set(report.names.provisional)].map(n => `- ${n}`));
  return lines.join('\n');
}
