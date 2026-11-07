// PPRC: one player identity and one rating algorithm for every club and tournament.
// Pure functions only (no I/O), so the same code runs in the browser, Cloud Functions, the
// migration script and the tests. Version the parameters: changing them means recomputing history.

export const PPRC_PARAMS = Object.freeze({
  version: 1,
  min: 1, max: 16.5, defaultSeed: 3.5,
  spread: 0.75,                          // rating gap that moves the expected game share (logistic)
  k: { singles: 0.30, doubles: 0.24 },   // base step per court
  provisional: { boost: 1.5, halfLifeMatches: 6 }, // newer players move faster until they have played ~a dozen courts
  resultWeight: 0.2                      // actual = (1 - w) * game share + w * (won ? 1 : 0)
});

// Seeds count as one match each, so a player's overall figure moves smoothly as they play.
const overallOf = p => (p.singles * (p.played.singles + 1) + p.doubles * (p.played.doubles + 1)) / (p.played.singles + p.played.doubles + 2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, n = 2) => Number(v.toFixed(n));

// ---------- Names: one unique key per person across every club ----------
export function nameKey(name) {
  return String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export const playerIdFor = key => `p_${nameKey(key).replace(/ /g, '_')}`;

// entries: [{ id, name, aliases?: string[] }]. overrides: { [nameKey]: playerId } confirmed by an admin.
export function createRegistry(entries = [], overrides = {}) {
  const byKey = new Map(), byId = new Map(), list = [];
  const add = entry => {
    byId.set(entry.id, entry);
    list.push({ id: entry.id, tokens: nameKey(entry.name).split(' ') });
    for (const label of [entry.name, ...(entry.aliases || [])]) { const k = nameKey(label); if (k && !byKey.has(k)) byKey.set(k, entry.id); }
  };
  entries.forEach(add);
  return { byKey, byId, list, overrides: Object.fromEntries(Object.entries(overrides).map(([k, v]) => [nameKey(k), v])), add };
}

// Resolution order: admin override, exact name or alias, tokens that each start a different name
// part of exactly one player (so "Sashi R" finds "Sashi Raju", "Krishna" finds a unique Krishna).
// Several candidates is `ambiguous`, never a guess; no candidate is `unknown`.
// `roster` (optional ids) narrows the candidates first, e.g. the two teams playing the match.
export function resolveName(registry, raw, { roster } = {}) {
  const key = nameKey(raw);
  if (!key) return { id: null, how: 'unknown', candidates: [] };
  if (registry.overrides[key]) return { id: registry.overrides[key], how: 'override', candidates: [] };
  if (registry.byKey.has(key)) return { id: registry.byKey.get(key), how: 'exact', candidates: [] };
  const wanted = key.split(' ');
  const matches = pool => pool.filter(p => wanted.every(w => p.tokens.some(t => t.startsWith(w)))).map(p => p.id);
  const inRoster = roster ? matches(registry.list.filter(p => roster.includes(p.id))) : [];
  if (inRoster.length === 1) return { id: inRoster[0], how: 'roster', candidates: [] };
  const all = matches(registry.list);
  if (all.length === 1) return { id: all[0], how: 'tokens', candidates: [] };
  return { id: null, how: all.length ? 'ambiguous' : 'unknown', candidates: all };
}

// ---------- Rating ----------
const expectedShare = (mine, theirs, spread) => 1 / (1 + Math.exp(-(mine - theirs) / spread));
export const gamesLabel = (mine, theirs) => `${mine}-${theirs}`;

// players: { [id]: { singles?: number, doubles?: number } } seed ratings (UTR). A missing seed falls back
// to the other discipline, then to the default.
// matches: [{ id, club, season, stage, ts, courts: [{ label, type: 'singles'|'doubles', home: [id], away: [id],
//   homeGames, awayGames, winner: 'home'|'away', score? }] }]. Order does not matter: they are sorted by time.
// A court is skipped (and reported) if a side has no player or someone is not in `players`.
export function computePprc({ players, matches, params = PPRC_PARAMS }) {
  const state = new Map(), history = {}, skipped = [];
  const seedOf = (p, type) => clamp(Number(p?.[type]) || Number(p?.[type === 'singles' ? 'doubles' : 'singles']) || params.defaultSeed, params.min, params.max);
  for (const [id, p] of Object.entries(players || {})) {
    const s = seedOf(p, 'singles'), d = seedOf(p, 'doubles');
    state.set(id, { id, seed: { singles: s, doubles: d }, singles: s, doubles: d, played: { singles: 0, doubles: 0 }, wins: 0, losses: 0, record: { singles: { wins: 0, losses: 0 }, doubles: { wins: 0, losses: 0 } }, last: null });
    history[id] = [];
  }
  const ordered = [...(matches || [])].sort((a, b) => (a.ts - b.ts) || String(a.id).localeCompare(String(b.id)));
  for (const match of ordered) {
    (match.courts || []).forEach((court, index) => {
      const sides = { home: court.home || [], away: court.away || [] };
      const bad = !['singles', 'doubles'].includes(court.type) ? 'type' : !sides.home.length || !sides.away.length ? 'players' : [...sides.home, ...sides.away].some(id => !state.has(id)) ? 'unknown player' : (court.winner !== 'home' && court.winner !== 'away') ? 'winner' : null;
      if (bad) { skipped.push({ matchId: match.id, court: court.label || index + 1, reason: bad }); return; }
      const type = court.type, avg = ids => ids.reduce((sum, id) => sum + state.get(id)[type], 0) / ids.length;
      const rating = { home: avg(sides.home), away: avg(sides.away) };
      const games = { home: Number(court.homeGames) || 0, away: Number(court.awayGames) || 0 }, total = games.home + games.away;
      const deltas = {};
      for (const side of ['home', 'away']) {
        const other = side === 'home' ? 'away' : 'home', won = court.winner === side;
        const share = total ? games[side] / total : (won ? 1 : 0);
        const actual = (1 - params.resultWeight) * share + params.resultWeight * (won ? 1 : 0);
        const lowest = Math.min(...sides[side].map(id => state.get(id).played[type]));
        const boost = 1 + params.provisional.boost * Math.exp(-lowest / params.provisional.halfLifeMatches);
        const raw = params.k[type] * boost * (actual - expectedShare(rating[side], rating[other], params.spread));
        deltas[side] = won ? Math.max(0, raw) : Math.min(0, raw); // a win never costs rating and a loss never earns it
      }
      for (const side of ['home', 'away']) {
        const other = side === 'home' ? 'away' : 'home', won = court.winner === side;
        for (const id of sides[side]) {
          const p = state.get(id);
          p[type] = clamp(p[type] + deltas[side], params.min, params.max);
          p.played[type]++; won ? p.wins++ : p.losses++; p.record[type][won ? 'wins' : 'losses']++;
          p.last = match.ts;
          history[id].push({
            matchId: match.id, club: match.club, season: match.season, stage: match.stage || null, ts: match.ts, court: court.label || null, type, won,
            partner: sides[side].find(x => x !== id) || null, opponents: sides[other], games: gamesLabel(games[side], games[other]), score: court.score || null,
            change: round(deltas[side], 3), after: round(p[type], 3), overall: round(overallOf(p))
          });
        }
      }
    });
  }
  const ratings = {};
  for (const p of state.values()) {
    ratings[p.id] = {
      singles: round(p.singles), doubles: round(p.doubles),
      overall: round(overallOf(p)),
      seed: { singles: round(p.seed.singles), doubles: round(p.seed.doubles) },
      played: p.played, wins: p.wins, losses: p.losses, record: p.record, lastPlayed: p.last, version: params.version
    };
  }
  return { ratings, history, skipped };
}

// ---------- History views ----------
// The latest `count` matches, newest first, then everything older grouped by calendar year (UTC),
// newest year first. The UI shows the first list and opens a year only when it is clicked.
export function splitHistory(entries, count = 10) {
  const newest = [...(entries || [])].sort((a, b) => (b.ts - a.ts) || String(b.matchId).localeCompare(String(a.matchId)));
  const years = new Map();
  for (const entry of newest.slice(count)) {
    const year = new Date(entry.ts).getUTCFullYear();
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(entry);
  }
  return { recent: newest.slice(0, count), years: [...years].map(([year, items]) => ({ year, count: items.length, items })) };
}
