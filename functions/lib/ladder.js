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
