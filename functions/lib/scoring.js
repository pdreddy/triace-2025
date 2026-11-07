// Score validation, match results and standings for the Triace league. Pure functions, no I/O,
// so the same rules run in the browser, the Cloud Functions and the unit tests.
//
// Shapes (sides are always 'home' / 'away'):
//   set          { home: 4, away: 3, tiebreak?: { home: 7, away: 5 } }
//   singles      { type: 'singles', set }                          one 8-game pro set
//   doubles      { type: 'doubles', sets: [set, set], third?: { format: 'matchTiebreak', home, away }
//                                                          | { format: 'fullSet', set } }
//   super        { type: 'super', home: 10, away: 7 }              playoff Doubles 3, 10-point tiebreak
//   Tiebreak points are never counted as games (a match tiebreak / super tiebreak counts as 1 game for the winner).

export const SCORE_ERRORS = {
  doublesSet: 'Invalid set score. Sets must end 4-0, 4-1, 4-2, or 4-3.',
  doublesTiebreakRequired: 'A 4-3 set requires tiebreak points.',
  tiebreak: 'Tiebreak must be won by at least 2 points, with the winner reaching at least 7.',
  matchTiebreak: 'Match tiebreak must be won by at least 2 points, with the winner reaching at least 10.',
  // Singles tiebreak is played at 7-7, so the longest pro set is 8-7 (these two replace the 9-7 / 9-8 wording).
  proSet: 'Invalid pro set score. Singles must end 8-0 to 8-6, or 8-7.',
  proSetTiebreakRequired: 'An 8-7 pro set requires tiebreak points.',
  thirdNotAllowed: 'Third set is only allowed when the first two sets are split.',
  thirdRequired: 'Third set is required when the first two sets are split.',
  thirdFormat: 'Please select the third-set format: 10-point match tiebreak or full set.',
  incomplete: 'All courts must have a completed score before submitting.'
};

// Courts in the order they are played. `super` is the playoff Doubles 3 10-point tiebreak.
export const COURTS = {
  rr: [
    { key: 'singles', label: 'Singles', type: 'singles' },
    { key: 'd1', label: 'Doubles 1', type: 'doubles' },
    { key: 'd2', label: 'Doubles 2', type: 'doubles' }
  ],
  po: [
    { key: 's1', label: 'Singles 1', type: 'singles' },
    { key: 'd1', label: 'Doubles 1', type: 'doubles' },
    { key: 's2', label: 'Singles 2', type: 'singles' },
    { key: 'd2', label: 'Doubles 2', type: 'doubles' },
    { key: 'd3', label: 'Doubles 3', type: 'super' }
  ]
};

const isInt = n => Number.isInteger(n) && n >= 0;
const winnerOf = (a, b) => (a > b ? 'home' : b > a ? 'away' : null);

// A tiebreak to `target` points, win by 2 (the winner may go beyond the target, e.g. 9-7).
function tiebreakOk(home, away, target) {
  if (!isInt(home) || !isInt(away)) return false;
  const hi = Math.max(home, away), lo = Math.min(home, away);
  return hi >= target && hi - lo >= 2 && (hi === target ? true : hi - lo === 2);
}

function validateTiebreak(set, winner, message, errors) {
  const tb = set.tiebreak;
  if (!tb || tb.home == null || tb.away == null) return false;
  if (!tiebreakOk(tb.home, tb.away, 7) || winnerOf(tb.home, tb.away) !== winner) errors.push(message);
  return true;
}

// Doubles short set: 4-0 .. 4-3, 4-3 decided by a 7-point tiebreak.
export function validateDoublesSet(set) {
  const errors = [];
  const { home, away } = set || {};
  const ok = isInt(home) && isInt(away) && ((home === 4 && away <= 3) || (away === 4 && home <= 3));
  if (!ok) return { valid: false, errors: [SCORE_ERRORS.doublesSet], winner: null };
  const winner = winnerOf(home, away);
  if (Math.min(home, away) === 3) {
    if (!validateTiebreak(set, winner, SCORE_ERRORS.tiebreak, errors)) errors.push(SCORE_ERRORS.doublesTiebreakRequired);
  } else if (set.tiebreak && (set.tiebreak.home != null || set.tiebreak.away != null)) {
    errors.push(SCORE_ERRORS.doublesSet);
  }
  return { valid: errors.length === 0, errors, winner };
}

// Singles pro set: 8-0 .. 8-6, or 8-7 decided by a 7-point tiebreak played at 7-7.
export function validateSinglesSet(set) {
  const errors = [];
  const { home, away } = set || {};
  const ok = isInt(home) && isInt(away) && ((home === 8 && away <= 7) || (away === 8 && home <= 7));
  if (!ok) return { valid: false, errors: [SCORE_ERRORS.proSet], winner: null };
  const winner = winnerOf(home, away);
  if (Math.min(home, away) === 7) {
    if (!validateTiebreak(set, winner, SCORE_ERRORS.tiebreak, errors)) errors.push(SCORE_ERRORS.proSetTiebreakRequired);
  } else if (set.tiebreak && (set.tiebreak.home != null || set.tiebreak.away != null)) {
    errors.push(SCORE_ERRORS.proSet);
  }
  return { valid: errors.length === 0, errors, winner };
}

// 10-point match tiebreak (doubles third set, and the playoff Doubles 3 court).
export function validateMatchTiebreak(score) {
  const { home, away } = score || {};
  if (!tiebreakOk(home, away, 10)) return { valid: false, errors: [SCORE_ERRORS.matchTiebreak], winner: null };
  return { valid: true, errors: [], winner: winnerOf(home, away) };
}

const filled = set => set && (set.home != null || set.away != null);
const dedupe = list => [...new Set(list)];

// Validates one court and, when valid, returns its winner and game totals.
export function validateCourt(court) {
  if (!court) return { valid: false, errors: [SCORE_ERRORS.incomplete] };
  if (court.type === 'singles') {
    if (!filled(court.set)) return { valid: false, errors: [SCORE_ERRORS.incomplete] };
    const r = validateSinglesSet(court.set);
    return r.valid ? { valid: true, errors: [], winner: r.winner, games: { home: court.set.home, away: court.set.away } } : { valid: false, errors: r.errors };
  }
  if (court.type === 'super') {
    if (!filled(court)) return { valid: false, errors: [SCORE_ERRORS.incomplete] };
    const r = validateMatchTiebreak(court);
    return r.valid ? { valid: true, errors: [], winner: r.winner, games: { home: r.winner === 'home' ? 1 : 0, away: r.winner === 'away' ? 1 : 0 } } : { valid: false, errors: r.errors };
  }
  if (court.type !== 'doubles') return { valid: false, errors: [SCORE_ERRORS.incomplete] };

  const [s1, s2] = court.sets || [];
  if (!filled(s1) || !filled(s2)) return { valid: false, errors: [SCORE_ERRORS.incomplete] };
  const r1 = validateDoublesSet(s1), r2 = validateDoublesSet(s2);
  const errors = [...r1.errors, ...r2.errors];
  const split = r1.winner && r2.winner && r1.winner !== r2.winner;
  const third = court.third;
  const hasThird = !!third && (third.format || filled(third) || filled(third.set));

  let thirdResult = null;
  if (split) {
    if (!hasThird) errors.push(SCORE_ERRORS.thirdRequired);
    else if (third.format !== 'matchTiebreak' && third.format !== 'fullSet') errors.push(SCORE_ERRORS.thirdFormat);
    else if (third.format === 'matchTiebreak') {
      thirdResult = validateMatchTiebreak(third);
      errors.push(...thirdResult.errors);
    } else {
      thirdResult = validateDoublesSet(third.set);
      errors.push(...thirdResult.errors);
    }
  } else if (hasThird && r1.winner && r2.winner) {
    errors.push(SCORE_ERRORS.thirdNotAllowed);
  }
  if (errors.length) return { valid: false, errors: dedupe(errors) };

  const wins = { home: 0, away: 0 };
  wins[r1.winner]++; wins[r2.winner]++;
  const games = { home: s1.home + s2.home, away: s1.away + s2.away };
  if (thirdResult) {
    wins[thirdResult.winner]++;
    if (third.format === 'matchTiebreak') games[thirdResult.winner] += 1; // match tiebreak = 1 game for the winner
    else { games.home += third.set.home; games.away += third.set.away; }
  }
  return { valid: true, errors: [], winner: wins.home > wins.away ? 'home' : 'away', games };
}

// courts: object keyed by court key (see COURTS), e.g. { singles: {...}, d1: {...}, d2: {...} }.
export function validateMatchScore(format, courts) {
  const spec = COURTS[format];
  if (!spec) return { valid: false, errors: [SCORE_ERRORS.incomplete] };
  const errors = [];
  for (const { key, type } of spec) {
    const c = courts?.[key];
    const r = validateCourt(c && { ...c, type });
    if (!r.valid) errors.push(...r.errors);
  }
  return { valid: errors.length === 0, errors: dedupe(errors) };
}

// Winner, court score and game totals for a fully valid match. Throws the first error otherwise.
export function matchResult(format, courts) {
  const check = validateMatchScore(format, courts);
  if (!check.valid) throw new Error(check.errors[0]);
  const out = { courtsHome: 0, courtsAway: 0, gamesHome: 0, gamesAway: 0, courts: {} };
  for (const { key, type } of COURTS[format]) {
    const r = validateCourt({ ...courts[key], type });
    out.courts[key] = { winner: r.winner, gamesHome: r.games.home, gamesAway: r.games.away };
    out[r.winner === 'home' ? 'courtsHome' : 'courtsAway']++;
    out.gamesHome += r.games.home; out.gamesAway += r.games.away;
  }
  out.winner = out.courtsHome > out.courtsAway ? 'home' : 'away';
  out.score = `${Math.max(out.courtsHome, out.courtsAway)}-${Math.min(out.courtsHome, out.courtsAway)}`;
  return out;
}

// Only Approved results count ('final' is the existing league status for an approved result).
export const isApproved = match => ['approved', 'final'].includes(String(match?.status || '').toLowerCase());

// matches: [{ home, away, status, format?, result: matchResult(...) }]. Playoff matches never count.
// Order: points, head-to-head (wins among the teams tied on points), court difference,
// game difference, games won, then team id so the order is always stable.
export function standings(teamIds, matches) {
  const rows = new Map(teamIds.map(id => [id, { teamId: id, matchesPlayed: 0, wins: 0, losses: 0, points: 0, courtsWon: 0, courtsLost: 0, gamesWon: 0, gamesLost: 0 }]));
  const h2h = new Map(); // `${winner}>${loser}` -> wins
  for (const m of matches || []) {
    if (!isApproved(m) || !m.result || m.format === 'po') continue;
    const home = rows.get(m.home), away = rows.get(m.away);
    if (!home || !away) continue;
    const r = m.result, homeWon = r.winner === 'home';
    home.matchesPlayed++; away.matchesPlayed++;
    home.courtsWon += r.courtsHome; home.courtsLost += r.courtsAway; away.courtsWon += r.courtsAway; away.courtsLost += r.courtsHome;
    home.gamesWon += r.gamesHome; home.gamesLost += r.gamesAway; away.gamesWon += r.gamesAway; away.gamesLost += r.gamesHome;
    const [w, l] = homeWon ? [home, away] : [away, home];
    w.wins++; w.points += 1; l.losses++;
    const key = `${w.teamId}>${l.teamId}`;
    h2h.set(key, (h2h.get(key) || 0) + 1);
  }
  const list = [...rows.values()];
  const tied = row => list.filter(o => o.points === row.points);
  const headToHead = row => tied(row).reduce((n, o) => n + (o === row ? 0 : (h2h.get(`${row.teamId}>${o.teamId}`) || 0)), 0);
  const diff = (a, b) => b - a;
  return list
    .map(row => ({ ...row, courtDiff: row.courtsWon - row.courtsLost, gameDiff: row.gamesWon - row.gamesLost, _h2h: headToHead(row) }))
    .sort((a, b) => diff(a.points, b.points) || diff(a._h2h, b._h2h) || diff(a.courtDiff, b.courtDiff) || diff(a.gameDiff, b.gameDiff) || diff(a.gamesWon, b.gamesWon) || String(a.teamId).localeCompare(String(b.teamId)))
    .map(({ _h2h, ...row }, i) => ({ ...row, position: i + 1 }));
}
