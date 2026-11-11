import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCORE_ERRORS as E, COURTS, cleanCourt, courtScoreText, validateDoublesSet, validateSinglesSet, validateMatchTiebreak, validateCourt, validateMatchScore, matchResult, standings, isApproved } from '../../functions/lib/scoring.js';

const tb = (home, away) => ({ tiebreak: { home, away } });
const dset = (home, away, t) => ({ home, away, ...(t ? tb(...t) : {}) });
const errs = r => r.errors;

test('doubles: every valid set score passes, in both directions', () => {
  for (const [a, b] of [[4, 0], [4, 1], [4, 2]]) {
    assert.equal(validateDoublesSet(dset(a, b)).valid, true);
    assert.equal(validateDoublesSet(dset(b, a)).valid, true);
  }
  assert.deepEqual(validateDoublesSet(dset(4, 3, [7, 5])), { valid: true, errors: [], winner: 'home' });
  assert.equal(validateDoublesSet(dset(3, 4, [5, 7])).winner, 'away');
  assert.equal(validateDoublesSet(dset(4, 3, [9, 7])).valid, true);
});

test('doubles: invalid set scores use the exact message', () => {
  for (const [a, b] of [[5, 3], [4, 4], [3, 3], [5, 0], [0, 0], [4, 5], [6, 4], [2, 1], [-1, 4], [4.5, 1]]) {
    assert.deepEqual(errs(validateDoublesSet(dset(a, b))), [E.doublesSet], `${a}-${b}`);
  }
  assert.equal(E.doublesSet, 'Invalid set score. Sets must end 4-0, 4-1, 4-2, or 4-3.');
  assert.deepEqual(errs(validateDoublesSet(dset(4, 2, [7, 5]))), [E.doublesSet]); // tiebreak on a non-4-3 set
});

test('doubles: a 4-3 set requires tiebreak points and a valid tiebreak', () => {
  assert.deepEqual(errs(validateDoublesSet(dset(4, 3))), [E.doublesTiebreakRequired]);
  assert.equal(E.doublesTiebreakRequired, 'A 4-3 set requires tiebreak points.');
  for (const t of [[7, 6], [6, 4], [7, 7], [8, 5], [10, 7], [5, 7]]) {
    assert.deepEqual(errs(validateDoublesSet(dset(4, 3, t))), [E.tiebreak], t.join('-')); // too close, too low, wrong winner, or too far
  }
  assert.equal(E.tiebreak, 'Tiebreak must be won by at least 2 points, with the winner reaching at least 7.');
  assert.equal(validateDoublesSet(dset(4, 3, [7, 0])).valid, true);
  assert.equal(validateDoublesSet(dset(4, 3, [8, 6])).valid, true);
});

test('singles pro set: valid scores 8-0 to 8-6 and 8-7 with tiebreak', () => {
  for (let l = 0; l <= 6; l++) {
    assert.equal(validateSinglesSet({ home: 8, away: l }).winner, 'home');
    assert.equal(validateSinglesSet({ home: l, away: 8 }).winner, 'away');
  }
  assert.deepEqual(validateSinglesSet({ home: 8, away: 7, ...tb(7, 4) }), { valid: true, errors: [], winner: 'home' });
  assert.equal(validateSinglesSet({ home: 7, away: 8, ...tb(3, 7) }).winner, 'away');
});

test('singles pro set: invalid scores, missing or bad tiebreak', () => {
  for (const [a, b] of [[9, 7], [9, 8], [8, 8], [7, 7], [7, 5], [6, 4], [10, 8], [8, 9], [0, 0]]) {
    assert.deepEqual(errs(validateSinglesSet({ home: a, away: b })), [E.proSet], `${a}-${b}`);
  }
  assert.deepEqual(errs(validateSinglesSet({ home: 8, away: 7 })), [E.proSetTiebreakRequired]);
  assert.deepEqual(errs(validateSinglesSet({ home: 8, away: 7, ...tb(7, 6) })), [E.tiebreak]);
  assert.deepEqual(errs(validateSinglesSet({ home: 8, away: 7, ...tb(4, 7) })), [E.tiebreak]); // tiebreak winner != set winner
  assert.deepEqual(errs(validateSinglesSet({ home: 8, away: 3, ...tb(7, 3) })), [E.proSet]);
  assert.equal(E.proSet, 'Invalid pro set score. Singles must end 8-0 to 8-6, or 8-7.');
  assert.equal(E.proSetTiebreakRequired, 'An 8-7 pro set requires tiebreak points.');
});

test('match tiebreak: first to 10, win by 2', () => {
  for (const [a, b] of [[10, 0], [10, 8], [0, 10], [8, 10], [11, 9], [12, 10], [15, 13]]) assert.equal(validateMatchTiebreak({ home: a, away: b }).valid, true, `${a}-${b}`);
  for (const [a, b] of [[10, 9], [9, 7], [10, 10], [11, 8], [7, 5], [0, 0], [11, 10]]) assert.deepEqual(errs(validateMatchTiebreak({ home: a, away: b })), [E.matchTiebreak], `${a}-${b}`);
  assert.equal(E.matchTiebreak, 'Match tiebreak must be won by at least 2 points, with the winner reaching at least 10.');
});

const split = [dset(4, 2), dset(1, 4)];
test('doubles court: straight sets, no third set allowed', () => {
  const r = validateCourt({ type: 'doubles', sets: [dset(4, 1), dset(4, 3, [7, 3])] });
  assert.deepEqual(r, { valid: true, errors: [], winner: 'home', games: { home: 8, away: 4 } });
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: [dset(4, 1), dset(4, 2)], third: { format: 'matchTiebreak', home: 10, away: 5 } })), [E.thirdNotAllowed]);
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: [dset(4, 1), dset(4, 2)], third: { format: 'fullSet', set: dset(4, 0) } })), [E.thirdNotAllowed]);
  assert.equal(E.thirdNotAllowed, 'Third set is only allowed when the first two sets are split.');
});

test('doubles court: split sets need a third set with a chosen format', () => {
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: split })), [E.thirdRequired]);
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: split, third: {} })), [E.thirdRequired]);
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: split, third: { home: 10, away: 4 } })), [E.thirdFormat]);
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: split, third: { format: 'tiebreak', home: 10, away: 4 } })), [E.thirdFormat]);
  assert.equal(E.thirdRequired, 'Third set is required when the first two sets are split.');
  assert.equal(E.thirdFormat, 'Please select the third-set format: 10-point match tiebreak or full set.');
});

test('doubles court: third set as match tiebreak counts 1 game; as full set counts its games', () => {
  const mtb = validateCourt({ type: 'doubles', sets: split, third: { format: 'matchTiebreak', home: 10, away: 7 } });
  assert.deepEqual(mtb, { valid: true, errors: [], winner: 'home', games: { home: 4 + 1 + 1, away: 2 + 4 } });
  const full = validateCourt({ type: 'doubles', sets: split, third: { format: 'fullSet', set: dset(2, 4) } });
  assert.deepEqual(full, { valid: true, errors: [], winner: 'away', games: { home: 4 + 1 + 2, away: 2 + 4 + 4 } });
  assert.equal(validateCourt({ type: 'doubles', sets: split, third: { format: 'fullSet', set: dset(4, 3, [7, 2]) } }).valid, true);
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: split, third: { format: 'matchTiebreak', home: 10, away: 9 } })), [E.matchTiebreak]);
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: split, third: { format: 'fullSet', set: dset(5, 3) } })), [E.doublesSet]);
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: split, third: { format: 'fullSet', set: dset(4, 3) } })), [E.doublesTiebreakRequired]);
});

test('court: missing scores are incomplete; invalid sets report their own error', () => {
  assert.deepEqual(errs(validateCourt(null)), [E.incomplete]);
  assert.deepEqual(errs(validateCourt({ type: 'singles', set: {} })), [E.incomplete]);
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: [dset(4, 1)] })), [E.incomplete]);
  assert.deepEqual(errs(validateCourt({ type: 'super' })), [E.incomplete]);
  assert.deepEqual(errs(validateCourt({ type: 'doubles', sets: [dset(5, 1), dset(4, 3)] })), [E.doublesSet, E.doublesTiebreakRequired]);
  assert.equal(E.incomplete, 'All courts must have a completed score before submitting.');
});

const singles = (a, b, t) => ({ set: { home: a, away: b, ...(t ? tb(...t) : {}) } });
const straight = (a = 4, b = 1) => ({ sets: [dset(a, b), dset(a, b)] });
const rr = (s, d1, d2) => ({ s, d1, d2 });

test('round robin: 2 of 3 courts wins, score and games recorded', () => {
  const r = matchResult('rr', rr(singles(8, 5), straight(4, 2), straight(1, 4)));
  assert.equal(r.winner, 'home'); assert.equal(r.score, '2-1');
  assert.deepEqual([r.courtsHome, r.courtsAway], [2, 1]);
  assert.deepEqual([r.gamesHome, r.gamesAway], [8 + 8 + 2, 5 + 4 + 8]);
  assert.equal(matchResult('rr', rr(singles(2, 8), straight(1, 4), straight(1, 4))).score, '3-0');
  assert.equal(matchResult('rr', rr(singles(2, 8), straight(1, 4), straight(1, 4))).winner, 'away');
  assert.equal(matchResult('rr', rr(singles(8, 7, [7, 5]), straight(1, 4), straight(1, 4))).winner, 'away');
});

test('round robin: incomplete or invalid matches cannot produce a result', () => {
  assert.deepEqual(validateMatchScore('rr', rr(singles(8, 5), straight(4, 2))), { valid: false, errors: [E.incomplete] });
  assert.deepEqual(validateMatchScore('rr', {}), { valid: false, errors: [E.incomplete] });
  assert.deepEqual(validateMatchScore('rr', rr(singles(9, 7), straight(4, 2), straight(4, 2))).errors, [E.proSet]);
  assert.throws(() => matchResult('rr', rr(singles(8, 5), straight(4, 2))), { message: E.incomplete });
  assert.equal(validateMatchScore('nope', {}).valid, false);
});

test('playoffs: five courts, 3 of 5 wins, Doubles 3 is a 10-point tiebreak', () => {
  assert.deepEqual(COURTS.po.map(c => c.label), ['Singles 1', 'Doubles 1', 'Singles 2', 'Doubles 2', 'Doubles 3']);
  const courts = { s1: singles(8, 3), d1: straight(4, 0), s2: singles(2, 8), d2: straight(0, 4), d3: { home: 10, away: 6 } };
  const r = matchResult('po', courts);
  assert.equal(r.winner, 'home'); assert.equal(r.score, '3-2');
  assert.deepEqual(r.courts.d3, { winner: 'home', gamesHome: 1, gamesAway: 0 });
  assert.deepEqual([r.gamesHome, r.gamesAway], [8 + 8 + 2 + 0 + 1, 3 + 0 + 8 + 8 + 0]);
  const sweep = matchResult('po', { ...courts, s2: singles(8, 1), d2: straight(4, 1), d3: { home: 3, away: 10 } });
  assert.equal(sweep.score, '4-1');
  assert.deepEqual(validateMatchScore('po', { ...courts, d3: { home: 10, away: 9 } }).errors, [E.matchTiebreak]);
  assert.deepEqual(validateMatchScore('po', { ...courts, d3: undefined }).errors, [E.incomplete]);
});

const m = (home, away, winner, extra = {}) => ({ home, away, status: 'Approved', format: 'rr', result: { winner, courtsHome: winner === 'home' ? 2 : 1, courtsAway: winner === 'home' ? 1 : 2, gamesHome: 20, gamesAway: 15, ...extra } });

test('standings: only approved round-robin results count', () => {
  const rows = standings(['A', 'B', 'C'], [
    m('A', 'B', 'home'),
    { ...m('A', 'C', 'home'), status: 'Pending' },
    { ...m('B', 'C', 'home'), status: 'Rejected' },
    { ...m('A', 'C', 'away'), format: 'po' },
    { ...m('B', 'C', 'home'), status: 'final' }
  ]);
  const by = Object.fromEntries(rows.map(r => [r.teamId, r]));
  assert.deepEqual([by.A.matchesPlayed, by.A.wins, by.A.losses, by.A.points], [1, 1, 0, 1]);
  assert.deepEqual([by.B.matchesPlayed, by.B.wins, by.B.losses, by.B.points], [2, 1, 1, 1]);
  assert.deepEqual([by.C.matchesPlayed, by.C.wins, by.C.losses, by.C.points], [1, 0, 1, 0]);
  assert.deepEqual([by.A.courtsWon, by.A.courtsLost, by.A.gamesWon, by.A.gamesLost], [2, 1, 20, 15]);
  assert.deepEqual([by.B.courtsWon, by.B.courtsLost, by.B.gamesWon, by.B.gamesLost], [1 + 2, 2 + 1, 15 + 20, 20 + 15]);
  assert.equal(by.C.courtDiff, -1);
  assert.equal(isApproved({ status: 'approved' }), true);
  assert.equal(isApproved({ status: 'submitted' }), false);
  assert.equal(isApproved({}), false);
});

test('standings: tiebreakers run points, head-to-head, court diff, game diff, games won', () => {
  // Head-to-head beats court difference: B is +2 on courts, A only +1, but A beat B.
  const rows = standings(['A', 'B', 'X', 'Y'], [
    m('A', 'B', 'home'),
    m('B', 'X', 'home', { courtsHome: 3, courtsAway: 0, gamesHome: 40, gamesAway: 5 })
  ]);
  assert.deepEqual(rows.slice(0, 2).map(r => [r.teamId, r.points, r.courtDiff]), [['A', 1, 1], ['B', 1, 2]]);

  const tied = (extraA, extraB) => standings(['A', 'B', 'X', 'Y'], [
    m('A', 'X', 'home', extraA), m('B', 'Y', 'home', extraB)
  ]).map(r => r.teamId);
  // Same points, no head-to-head: court difference decides.
  assert.deepEqual(tied({ courtsHome: 3, courtsAway: 0 }, {}).slice(0, 2), ['A', 'B']);
  assert.deepEqual(tied({}, { courtsHome: 3, courtsAway: 0 }).slice(0, 2), ['B', 'A']);
  // Same courts: game difference decides.
  assert.deepEqual(tied({ gamesHome: 30, gamesAway: 10 }, {}).slice(0, 2), ['A', 'B']);
  assert.deepEqual(tied({}, { gamesHome: 30, gamesAway: 10 }).slice(0, 2), ['B', 'A']);
  // Same game difference: games won decides.
  assert.deepEqual(tied({ gamesHome: 25, gamesAway: 20 }, { gamesHome: 15, gamesAway: 10 }).slice(0, 2), ['A', 'B']);
  assert.deepEqual(tied({ gamesHome: 15, gamesAway: 10 }, { gamesHome: 25, gamesAway: 20 }).slice(0, 2), ['B', 'A']);
  // Fully level: stable by team id.
  assert.deepEqual(tied({}, {}).slice(0, 2), ['A', 'B']);
});

test('standings: three-way tie uses wins among the tied teams, then court difference', () => {
  const rows = standings(['A', 'B', 'C'], [
    m('A', 'B', 'home'), m('B', 'C', 'home'), m('C', 'A', 'home', { courtsHome: 3, courtsAway: 0 })
  ]);
  // Each team has 1 win and 1 loss; head-to-head is level, so court difference: C +2, A 0, B 0 (then games, then id).
  assert.equal(rows[0].teamId, 'C');
  assert.deepEqual(rows.map(r => r.position), [1, 2, 3]);
});

test('court score text is written from the winner\'s side and clean copies drop unknown fields', () => {
  assert.equal(courtScoreText({ type: 'singles', set: { home: 8, away: 7, tiebreak: { home: 7, away: 5 } } }, 'home'), '8-7(7-5)');
  assert.equal(courtScoreText({ type: 'singles', set: { home: 3, away: 8 } }, 'away'), '8-3');
  assert.equal(courtScoreText({ type: 'doubles', sets: [dset(4, 2), dset(1, 4)], third: { format: 'matchTiebreak', home: 7, away: 10 } }, 'away'), '2-4 4-1 10-7');
  assert.equal(courtScoreText({ type: 'doubles', sets: [dset(4, 3, [7, 4]), dset(4, 0)] }, 'home'), '4-3(7-4) 4-0');
  assert.equal(courtScoreText({ type: 'super', home: 10, away: 8 }, 'home'), '10-8');
  const dirty = cleanCourt({ type: 'doubles', evil: 1, sets: [{ home: '4', away: '1', x: 1 }, { home: 4, away: 2 }], third: { format: 'fullSet', set: { home: 1, away: 4 }, y: 2 } });
  assert.deepEqual(dirty, { type: 'doubles', sets: [{ home: 4, away: 1 }, { home: 4, away: 2 }], third: { format: 'fullSet', set: { home: 1, away: 4 } } });
  assert.deepEqual(cleanCourt({ type: 'doubles', sets: [dset(4, 2), dset(1, 4)], third: { format: 'fullSet', set: dset(4, 3, [7, 1]) } }).third, { format: 'fullSet', set: dset(4, 3, [7, 1]) });
});
