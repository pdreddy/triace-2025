// Ladder 2026 (a singles-only ladder): the exported results table -> matches in the same raw shape the KOC export uses, so
// the PPRC migration resolves the names and rates them like every other match.
// Only played, confirmed matches count: ties, walkovers, byes and results still waiting for confirmation are listed in the
// report and left out of the ratings.
import { nameKey } from './pprc.js';

export const LADDER = { club: 'ladder', season: 'y2026', path: 'ladder_2026' };
const COUNTED = new Set(['locked', 'confirmed']);
const stripRating = name => String(name ?? '').replace(/\s*\[[^\]]*\]\s*$/, '').replace(/\s+/g, ' ').trim();
const timestamp = text => { const t = Date.parse(`${String(text).trim().replace(' ', 'T')}:00Z`); return Number.isFinite(t) ? t : null; };

// "7-6 (TB 8-6), 3-6, 1-0 (TB 12-10)" -> sets from the home player's side. A match tiebreak (1-0) counts as one game.
export function parseSets(text) {
  const sets = [];
  for (const part of String(text ?? '').split(',')) {
    const m = part.match(/^\s*(\d+)\s*-\s*(\d+)/);
    if (m) sets.push({ team1: Number(m[1]), team2: Number(m[2]) });
  }
  return sets;
}

// text: the pipe-separated table (Stage|Group|Round|Home|Away|Winner|WinType|Date|Sets|Status).
// Returns { matches: { [id]: rawMatch }, report: { read, counted, skipped: [{ line, reason, players }] } }.
export function parseLadder(text) {
  const rows = String(text ?? '').split(/\r?\n/).filter(l => l.trim());
  const [head, ...body] = rows, cols = head.split('|').map(c => c.trim());
  const matches = {}, report = { read: 0, counted: 0, skipped: [] };
  body.forEach((line, i) => {
    const cells = line.split('|'), row = Object.fromEntries(cols.map((c, k) => [c, (cells[k] ?? '').trim()]));
    const home = stripRating(row.Home), away = stripRating(row.Away), where = i + 2;
    report.read++;
    const skip = reason => report.skipped.push({ line: where, reason, players: `${home} v ${away}` });
    if (!home || !away) return skip('missing player');
    if (!COUNTED.has(row.Status.toLowerCase())) return skip(`status "${row.Status}"`);
    if (/^(tie|walkover|conditional bye|bye)/i.test(row.WinType)) return skip(row.WinType.toLowerCase());
    const sets = parseSets(row.Sets);
    if (!sets.length) return skip('no score');
    const winnerName = stripRating(row.Winner), winnerNum = nameKey(winnerName) === nameKey(home) ? 1 : nameKey(winnerName) === nameKey(away) ? 2 : 0;
    if (!winnerNum) return skip('winner is not one of the two players');
    const g1 = sets.reduce((n, s) => n + s.team1, 0), g2 = sets.reduce((n, s) => n + s.team2, 0);
    const ts = timestamp(row.Date);
    if (ts == null) return skip('bad date');
    const id = `m${String(report.counted + 1).padStart(3, '0')}`;
    matches[id] = {
      t1: home, t2: away, ts, g1, g2, s1: row.Date, s2: row.Round, isPlayoff: /playoff/i.test(row.Stage), group: row.Group, round: row.Round,
      lines: [{ label: 'Singles', type: 'singles', players: { team1: [home], team2: [away] }, g1, g2, winnerTeamNum: winnerNum, sets }]
    };
    report.counted++;
  });
  return { matches, report };
}

// Everyone who appears in the Ladder 2026 results table, once each, with the rating printed after their name
// ("Raj Chava [5.3022]" is the ladder site's own rating, not a UTR). Used to set up a Singles Ladder season from the
// real roster; a person's identity is still decided by the PPRC name index, never by this spelling alone.
export function ladderRoster(text) {
  const rows = String(text ?? '').split(/\r?\n/).filter(l => l.trim()), cols = rows[0].split('|').map(c => c.trim()), seen = new Map();
  for (const line of rows.slice(1)) {
    const cells = line.split('|');
    for (const col of ['Home', 'Away']) {
      const raw = (cells[cols.indexOf(col)] ?? '').trim(), name = stripRating(raw), rating = Number(raw.match(/\[([\d.]+)\]\s*$/)?.[1]);
      if (name && !seen.has(nameKey(name))) seen.set(nameKey(name), { name, key: nameKey(name), rating: Number.isFinite(rating) ? rating : null });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The whole Ladder 2026 table for display: every row (ties, walkovers, byes and results still waiting for confirmation
// included, each labelled), grouped for the group pages and the playoffs. `decisions` is name-decisions.json: a settled
// spelling replaces the typed one, so every player shows under their PPRC name. Records are plain win/loss/tie counts
// of confirmed results; this is not an official standings formula.
const PLAYOFF_ORDER = ['R16', 'QF', 'SF', 'Final'];
export function ladderSeason(text, decisions = {}) {
  const settled = new Map(Object.entries(decisions).filter(([k, v]) => typeof v === 'string' && !k.includes('::')).map(([k, v]) => [nameKey(k), v]));
  const person = raw => { const typed = stripRating(raw), name = settled.get(nameKey(typed)) || typed; return { name, key: nameKey(name) }; };
  const rows = String(text ?? '').split(/\r?\n/).filter(l => l.trim()), cols = rows[0].split('|').map(c => c.trim());
  const matches = rows.slice(1).map((line, i) => {
    const cells = line.split('|'), row = Object.fromEntries(cols.map((c, k) => [c, (cells[k] ?? '').trim()]));
    const home = person(row.Home), away = person(row.Away), type = row.WinType.toLowerCase(), confirmed = COUNTED.has(row.Status.toLowerCase());
    const kind = type === 'score' ? 'played' : type.startsWith('tie') ? 'tie' : type.startsWith('walkover') ? 'walkover' : 'bye';
    const winnerKey = kind === 'tie' ? null : person(row.Winner).key, winner = winnerKey === home.key ? 'home' : winnerKey === away.key ? 'away' : null;
    return { id: `l${i + 1}`, stage: row.Stage, playoff: /playoff/i.test(row.Stage), group: /^group /i.test(row.Group) ? row.Group : null, round: row.Round, week: Number(row.Round.match(/week (\d+)/i)?.[1]) || null,
      home, away, kind, winner, sets: row.Sets && row.Sets !== '—' ? row.Sets : '', date: row.Date, ts: timestamp(row.Date), confirmed };
  }).filter(m => m.home.name && m.away.name);
  const groups = {};
  for (const m of matches.filter(x => x.group && !x.playoff)) {
    const g = groups[m.group] ||= { name: m.group, players: new Map(), matches: [] };
    g.matches.push(m);
    for (const side of ['home', 'away']) if (!g.players.has(m[side].key)) g.players.set(m[side].key, { ...m[side], played: 0, won: 0, lost: 0, tied: 0 });
    if (!m.confirmed || m.kind === 'bye') continue;
    const h = g.players.get(m.home.key), a = g.players.get(m.away.key);
    h.played++; a.played++;
    if (m.kind === 'tie' || !m.winner) { h.tied++; a.tied++; } else { (m.winner === 'home' ? h : a).won++; (m.winner === 'home' ? a : h).lost++; }
  }
  const list = Object.values(groups).sort((a, b) => a.name.localeCompare(b.name)).map(g => ({ name: g.name, matches: g.matches.sort((a, b) => (a.week ?? 99) - (b.week ?? 99) || a.ts - b.ts),
    players: [...g.players.values()].sort((a, b) => b.won - a.won || a.lost - b.lost || b.tied - a.tied || a.name.localeCompare(b.name)) }));
  const playoffs = matches.filter(m => m.playoff).sort((a, b) => PLAYOFF_ORDER.indexOf(a.round) - PLAYOFF_ORDER.indexOf(b.round) || a.ts - b.ts);
  const final = playoffs.find(m => /^final$/i.test(m.round) && m.confirmed && m.winner);
  return { groups: list, playoffs, champion: final ? final[final.winner] : null, runnerUp: final ? final[final.winner === 'home' ? 'away' : 'home'] : null, players: new Set(matches.flatMap(m => [m.home.key, m.away.key])).size, matches: matches.length };
}
