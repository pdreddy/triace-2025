// PPRC: one player identity and one rating algorithm for every club and tournament.
// Pure functions only (no I/O), so the same code runs in the browser, Cloud Functions, the
// migration script and the tests. Version the parameters: changing them means recomputing history.

// The PPRC rating is built the way UTR and similar systems are: every court a player has played says how well they
// played at that level, and the rating is the weighted average of those performances.
//  - A court's performance is the opponents' level plus a margin from the share of games won (an even share is the
//    same level; winning 92% of the games is `span` above). In doubles each player's performance is worked out from
//    the pair's, so a strong partner does not inflate it.
//  - Recent courts count more (halving every `halfLifeDays`), courts with more games count more (up to `gamesCap`), and courts against
//    opponents whose own rating is still uncertain count less.
//  - The seed (the player's UTR) is the starting point and counts like `seedWeight` games, so a new player stays near
//    it and moves away as evidence builds; that share is the rating's reliability.
//  - Singles and doubles are rated separately. Because ratings depend on each other (you are measured against your
//    opponents), they are solved together over every match from every club until they settle, so the result does not
//    depend on the order matches were entered and a new match simply refines it.
export const PPRC_PARAMS = Object.freeze({
  version: 2,
  min: 1, max: 16.5, defaultSeed: 3.5,
  span: 2.0,           // rating points between an even share of games and a clean sweep
  shareLimit: 0.92,    // a share of games is limited to 8%..92%, so one 8-0 never says more than that
  halfLifeDays: 150,   // an older court counts half as much every 150 days
  seedWeight: 24,      // the seed counts like this many games of evidence (about two courts)
  gamesCap: 16,        // a court counts for at most this many games
  iterations: 60, damping: 0.5, tolerance: 0.0005
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, n = 2) => Number(v.toFixed(n));

// ---------- Names: one unique key per person across every club ----------
export function nameKey(name) {
  return String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
// How every name is written: "Vivekvardhan Reddy Mereddy". Single spaces, each part capitalised, initials
// ("K", "KP") kept as typed. The name key (above) ignores all of this, so "DINKAR  bhardwaj" is still one person.
export function displayName(name) {
  return String(name ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').split(' ')
    .map(part => (/^[A-Z]{1,2}\.?$/.test(part) ? part : part.toLowerCase().replace(/(^|[-'\u2019])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase())))
    .join(' ');
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
// `preferred` (optional Set of ids) settles what is left when exactly one preferred player fits.
export function resolveName(registry, raw, { roster, preferred } = {}) {
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
  // `preferred` (the cleanest list, e.g. KOC season 3): a name that fits exactly one of them goes to that person.
  const best = preferred ? all.filter(id => preferred.has(id)) : [];
  if (best.length === 1) return { id: best[0], how: 'preferred', candidates: all };
  return { id: null, how: all.length ? 'ambiguous' : 'unknown', candidates: all };
}

// ---------- Rating ----------
const DAY = 86400000;
export const gamesLabel = (mine, theirs) => `${mine}-${theirs}`;

// players: { [id]: { singles?: number, doubles?: number } } seed ratings (UTR). A missing seed falls back to the other
// discipline, then to the default.
// matches: [{ id, club, season, stage, ts, courts: [{ label, type: 'singles'|'doubles', home: [id], away: [id],
//   homeGames, awayGames, winner: 'home'|'away', score? }] }]. Order does not matter.
// A court is skipped (and reported) if a side has no player or someone is not in `players`.
// `asOf` (default: the latest match) is the moment ratings are worked out for; older courts count less.
export function computePprc({ players, matches, params = PPRC_PARAMS, asOf }) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const seedOf = (p, type) => clamp(Number(p?.[type]) || Number(p?.[type === 'singles' ? 'doubles' : 'singles']) || params.defaultSeed, params.min, params.max);
  const ids = Object.keys(players || {}), TYPES = ['singles', 'doubles'];
  const seed = {}, rating = {}, evidence = {}, played = {}, record = {}, history = {};
  for (const id of ids) {
    seed[id] = { singles: seedOf(players[id], 'singles'), doubles: seedOf(players[id], 'doubles') };
    rating[id] = { ...seed[id] }; evidence[id] = { singles: 0, doubles: 0 }; history[id] = [];
    played[id] = { singles: 0, doubles: 0 }; record[id] = { singles: { wins: 0, losses: 0 }, doubles: { wins: 0, losses: 0 } };
  }

  // Every court that can be rated, in time order.
  const skipped = [], courts = [];
  const ordered = [...(matches || [])].sort((a, b) => (a.ts - b.ts) || String(a.id).localeCompare(String(b.id)));
  for (const match of ordered) {
    (match.courts || []).forEach((court, index) => {
      const sides = { home: court.home || [], away: court.away || [] };
      const bad = !TYPES.includes(court.type) ? 'type' : !sides.home.length || !sides.away.length ? 'players' : [...sides.home, ...sides.away].some(id => !seed[id]) ? 'unknown player' : (court.winner !== 'home' && court.winner !== 'away') ? 'winner' : null;
      if (bad) { skipped.push({ matchId: match.id, court: court.label || index + 1, reason: bad }); return; }
      const games = { home: Number(court.homeGames) || 0, away: Number(court.awayGames) || 0 }, total = games.home + games.away;
      const shareOf = side => {
        const raw = total ? games[side] / total : (court.winner === side ? params.shareLimit : 1 - params.shareLimit);
        const limited = clamp(raw, 1 - params.shareLimit, params.shareLimit);
        return court.winner === side ? Math.max(limited, 0.5) : Math.min(limited, 0.5); // winning never rates below the opponents' level
      };
      courts.push({ match, ts: match.ts, court, sides, games, total, share: { home: shareOf('home'), away: shareOf('away') }, seq: courts.length });
    });
  }
  if (courts.length) solve();
  return { ratings: buildRatings(), history, skipped };

  function solve() {
    const DAY = 86400000, end = Number.isFinite(asOf) ? asOf : Math.max(...courts.map(c => c.ts));
    const decay = (from, to) => Math.pow(0.5, Math.max(0, to - from) / (params.halfLifeDays * DAY));
    const gamesWeight = c => Math.min(c.total || params.gamesCap / 2, params.gamesCap); // evidence in games, the same unit as the seed's weight
    const reliability = Object.fromEntries(ids.map(id => [id, { singles: 0, doubles: 0 }]));

    // One performance per player per court, from the current ratings of everyone else on court.
    const performances = () => {
      const out = [];
      for (const c of courts) {
        const type = c.court.type;
        for (const side of ['home', 'away']) {
          const mine = c.sides[side], theirs = c.sides[side === 'home' ? 'away' : 'home'];
          const level = theirs.reduce((sum, id) => sum + rating[id][type], 0) / theirs.length;
          const team = level + params.span * (2 * c.share[side] - 1);
          const oppReliability = theirs.reduce((sum, id) => sum + reliability[id][type], 0) / theirs.length;
          for (const id of mine) {
            const partner = mine.find(x => x !== id);
            const raw = type === 'doubles' && partner ? 2 * team - rating[partner][type] : team; // the pair's level, split between the two
            // A win never rates below the player's own rating and a loss never above it, so winning cannot lower a rating (UTR can).
            const own = rating[id][type], perf = clamp(raw, team - 2 * params.span, team + 2 * params.span), won = c.court.winner === side;
            out.push({ id, type, seq: c.seq, ts: c.ts, side, perf: won ? Math.max(perf, own) : Math.min(perf, own), base: gamesWeight(c) * (0.5 + 0.5 * oppReliability) });
          }
        }
      }
      return out;
    };

    // Solve for ratings that agree with each other.
    for (let step = 0; step < params.iterations; step++) {
      const sums = {};
      for (const e of performances()) { const k = `${e.id}|${e.type}`, w = e.base * decay(e.ts, end), x = sums[k] ||= { w: 0, m: 0 }; x.w += w; x.m += w * e.perf; }
      let moved = 0;
      for (const id of ids) for (const type of TYPES) {
        const x = sums[`${id}|${type}`] || { w: 0, m: 0 };
        const target = clamp((seed[id][type] * params.seedWeight + x.m) / (params.seedWeight + x.w), params.min, params.max);
        const next = clamp(rating[id][type] + params.damping * (target - rating[id][type]), params.min, params.max);
        moved = Math.max(moved, Math.abs(next - rating[id][type]));
        rating[id][type] = next; evidence[id][type] = x.w; reliability[id][type] = x.w / (x.w + params.seedWeight);
      }
      if (moved < params.tolerance) break;
    }

    // History: the rating after each court, from that player's own courts up to then, against the settled ratings of
    // the others. `change` is the move since their previous court in that discipline.
    const events = performances(), byPlayer = {};
    for (const e of events) (byPlayer[e.id] ||= []).push(e);
    const ratingAt = (id, list, type, upTo, t) => {
      let w = 0, m = 0;
      for (const e of list) if (e.type === type && e.seq <= upTo) { const x = e.base * decay(e.ts, t); w += x; m += x * e.perf; }
      return { rating: clamp((seed[id][type] * params.seedWeight + m) / (params.seedWeight + w), params.min, params.max), weight: w };
    };
    const byCourt = new Map(courts.map(c => [c.seq, c]));
    for (const id of ids) {
      const list = (byPlayer[id] || []).sort((a, b) => a.seq - b.seq), last = { ...seed[id] };
      for (const e of list) {
        const c = byCourt.get(e.seq), other = e.side === 'home' ? 'away' : 'home', won = c.court.winner === e.side;
        const now = ratingAt(id, list, e.type, e.seq, e.ts);
        const sg = e.type === 'singles' ? now : ratingAt(id, list, 'singles', e.seq, e.ts), db = e.type === 'doubles' ? now : ratingAt(id, list, 'doubles', e.seq, e.ts);
        played[id][e.type]++; record[id][e.type][won ? 'wins' : 'losses']++;
        // The same rule as in the solve, for what is shown: a win never lowers the rating and a loss never raises it.
        const shown = won ? Math.max(now.rating, last[e.type]) : Math.min(now.rating, last[e.type]), before = last[e.type];
        last[e.type] = shown;
        history[id].push({
          matchId: c.match.id, club: c.match.club, season: c.match.season, stage: c.match.stage || null, ts: c.ts, court: c.court.label || null, type: e.type, won,
          partner: c.sides[e.side].find(x => x !== id) || null, opponents: c.sides[other], games: gamesLabel(c.games[e.side], c.games[other]), score: c.court.score || null,
          change: round(shown - before, 3), after: round(shown, 3),
          overall: round((last.singles * (sg.weight + params.seedWeight) + last.doubles * (db.weight + params.seedWeight)) / (sg.weight + db.weight + 2 * params.seedWeight))
        });
      }
    }
  }

  // Courts, wins and losses per club season, e.g. { koc_s3: { club, season, courts, wins, losses } }.
  function seasonsOf(entries) {
    const out = {};
    for (const h of entries) {
      const x = out[`${h.club}_${h.season}`] ||= { club: h.club, season: h.season, courts: 0, wins: 0, losses: 0 };
      x.courts++; x[h.won ? 'wins' : 'losses']++;
    }
    return out;
  }

  function buildRatings() {
    const out = {};
    for (const id of ids) {
      const ws = evidence[id].singles, wd = evidence[id].doubles, k = params.seedWeight;
      out[id] = {
        singles: round(rating[id].singles), doubles: round(rating[id].doubles),
        overall: round((rating[id].singles * (ws + k) + rating[id].doubles * (wd + k)) / (ws + wd + 2 * k)), // each discipline counts by the evidence behind it
        seed: { singles: round(seed[id].singles), doubles: round(seed[id].doubles) },
        reliability: { singles: round(ws / (ws + k)), doubles: round(wd / (wd + k)) },
        played: played[id], wins: record[id].singles.wins + record[id].doubles.wins, losses: record[id].singles.losses + record[id].doubles.losses,
        seasons: seasonsOf(history[id]),
        record: record[id], lastPlayed: history[id].length ? Math.max(...history[id].map(h => h.ts)) : null, version: params.version
      };
    }
    return out;
  }
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

// Players whose name starts with what was typed, each typed word matching the start of a different part of the name
// ("viv red" finds "Vivekvardhan Reddy Mereddy"). Most experienced first; at most `limit`.
export function matchPlayers(list, query, limit = 5) {
  const words = nameKey(query).split(' ').filter(Boolean);
  if (!words.length || words.join('').length < 2) return [];
  return (list || [])
    .filter(p => { const parts = nameKey(p.name).split(' '); return words.every(w => parts.some(part => part.startsWith(w))); })
    .sort((a, b) => (b.played || 0) - (a.played || 0) || String(a.name).localeCompare(b.name))
    .slice(0, limit);
}
