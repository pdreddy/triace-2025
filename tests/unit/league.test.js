import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyRegistration, applyRecalculation, applyLeagueRules, publicState, rulesOf, DEFAULT_LEAGUE_RULES, isOwner } from '../../functions/lib/tournament.js';
import { applyLinkPprc, roundRobin, applyGenerateFixtures, applyGeneratePlayoffs, applySubmitResult, applyReviewResult, standings, playoffSpots, encounterWinner, deriveLineup, matchPlayers, playerRatings, playerId, gameShare, singlesEligibility, applyManageSeason } from '../../functions/lib/league.js';

const team = (captain, id, values = [600, 600, 600]) => ({ teamId: id, whatsappPhone:'+15551234567',ace1Phone:'+15551234568',ace2Phone:'+15551234569', captain: { firstName: captain, singlesUtr: values[0], doublesUtr: null }, ace1: { fullName: `${captain} Ace One`, singlesUtr: values[1], doublesUtr: null }, ace2: { fullName: `${captain} Ace Two`, singlesUtr: values[2], doublesUtr: null }, selectedTier: 'goat', consent: true, rulesAccepted: true });
// Valid courts for the given winners: singles 8-3, doubles 4-1 4-1, playoff Doubles 3 10-5 (written for the home side, mirrored for away).
const courtFor = (type, w) => { const h = w === 'home'; return type === 'singles' ? { set: h ? { home: 8, away: 3 } : { home: 3, away: 8 } } : type === 'super' ? (h ? { home: 10, away: 5 } : { home: 5, away: 10 }) : { sets: h ? [{ home: 4, away: 1 }, { home: 4, away: 1 }] : [{ home: 1, away: 4 }, { home: 1, away: 4 }] }; };
const result = (d1, d2, s) => ({ d1: courtFor('doubles', d1), d2: courtFor('doubles', d2), s: courtFor('singles', s) });
function league(count = 4) {
  let state = initialState();
  for (let i = 0; i < count; i++) state = applyRegistration(state, team(`Cap${i}`, `team_${String(i).padStart(16, '0')}`), `owner${i}`, 1000 + i).state;
  return applyGenerateFixtures(state, { tierId: 'goat' }).state;
}

test('a captain signed in with their team login can submit scores, and nobody else can', () => {
  let state = initialState();
  const ids = ['team_0000000000000000', 'team_0000000000000001'], logins = ids.map(id => ({ uid: `cap_${id}`, username: `cap-${id.slice(-1)}222` }));
  ids.forEach((id, i) => { state = applyRegistration(state, team(`Cap${i}`, id), `anon${i}`, 1000 + i, logins[i]).state; });
  state = applyGenerateFixtures(state, { tierId: 'goat' }).state;
  const fixture = Object.values(state.fixtures.goat)[0], entry = { tierId: 'goat', fixtureId: fixture.id, courts: result('home', 'home', 'away') };
  assert.throws(() => applySubmitResult(state, entry, 'a-stranger'), /Only the captains/);
  const mine = state.registrations[fixture.home].captainUid;                 // the home captain's login, not the browser that registered
  assert.notEqual(mine, state.registrations[fixture.home].ownerUid);
  assert.equal(applySubmitResult(state, entry, mine).state.fixtures.goat[fixture.id].status, 'submitted');
});

test('round robin pairs every team exactly once, with byes for odd counts', () => {
  for (const n of [2, 3, 4, 5, 8]) {
    const ids = Array.from({ length: n }, (_, i) => `t${i}`), rounds = roundRobin(ids), seen = new Set();
    assert.equal(rounds.length, n % 2 ? n : n - 1);
    for (const pairs of rounds) {
      const playing = pairs.flat();
      assert.equal(new Set(playing).size, playing.length, 'no team plays twice in a round');
      for (const [a, b] of pairs) { const key = [a, b].sort().join('|'); assert.ok(!seen.has(key)); seen.add(key); }
    }
    assert.equal(seen.size, (n * (n - 1)) / 2);
  }
});

test('fixtures are generated per tier and protect existing results unless replaced', () => {
  const state = league(4), fixtures = Object.values(state.fixtures.goat);
  assert.equal(fixtures.length, 6);
  assert.ok(fixtures.every(f => f.status === 'scheduled'));
  const owner = state.registrations[fixtures[0].home].ownerUid;
  const submitted = applySubmitResult(state, { tierId: 'goat', fixtureId: fixtures[0].id, courts: result('home', 'home', 'away') }, owner).state;
  assert.throws(() => applyGenerateFixtures(submitted, { tierId: 'goat' }), /already has submitted or final results/);
  assert.equal(Object.values(applyGenerateFixtures(submitted, { tierId: 'goat', replace: true }).state.fixtures.goat).filter(f => f.status !== 'scheduled').length, 0);
  assert.throws(() => applyGenerateFixtures(initialState(), { tierId: 'goat' }), /at least two teams/);
});

test('only the two captains may submit; submissions wait for admin approval', () => {
  const state = league(4), f = Object.values(state.fixtures.goat)[0];
  const homeOwner = state.registrations[f.home].ownerUid;
  const outsider = Object.values(state.registrations).find(t => t.teamId !== f.home && t.teamId !== f.away).ownerUid;
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts: result('home', 'away', 'home') }, outsider), /Only the captains/);
  const submit = courts => applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts }, homeOwner);
  const { s: _singles, ...noSingles } = result('home', 'away', 'home');
  assert.throws(() => submit(noSingles), { message: 'All courts must have a completed score before submitting.' });
  assert.throws(() => submit(undefined), { message: 'All courts must have a completed score before submitting.' });
  assert.throws(() => submit({ ...result('home', 'home', 'home'), s: { set: { home: 9, away: 7 } } }), { message: 'Singles: Invalid pro set score. Singles must end 8-0 to 8-6, or 8-7.' });
  assert.throws(() => submit({ ...result('home', 'home', 'home'), d1: { sets: [{ home: 4, away: 1 }, { home: 1, away: 4 }] } }), { message: 'Doubles 1: Third set is required when the first two sets are split.' });
  assert.throws(() => submit({ ...result('home', 'home', 'home'), d2: { sets: [{ home: 4, away: 3 }, { home: 4, away: 1 }] } }), { message: 'Doubles 2: A 4-3 set requires tiebreak points.' });
  const submitted = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts: result('home', 'away', 'home') }, homeOwner).state;
  const pending = submitted.fixtures.goat[f.id];
  assert.equal(pending.status, 'submitted'); assert.equal(pending.submission.side, 'home'); assert.equal(pending.submission.winner, 'home');
  assert.deepEqual(pending.submission.matches.map(m => [m.key, m.winner, m.score]), [['s', 'home', '8-3'], ['d1', 'home', '4-1 4-1'], ['d2', 'away', '4-1 4-1']]);
  assert.deepEqual([pending.submission.score, pending.submission.courtsHome, pending.submission.courtsAway, pending.submission.gamesHome, pending.submission.gamesAway], ['2-1', 2, 1, 8 + 8 + 2, 3 + 2 + 8]);
  const rejected = applyReviewResult(submitted, { tierId: 'goat', fixtureId: f.id, approve: false }).state.fixtures.goat[f.id];
  assert.equal(rejected.status, 'scheduled'); assert.equal(rejected.submission, undefined);
  const approved = applyReviewResult(submitted, { tierId: 'goat', fixtureId: f.id, approve: true }).state;
  assert.equal(approved.fixtures.goat[f.id].status, 'final');
  assert.throws(() => applySubmitResult(approved, { tierId: 'goat', fixtureId: f.id, courts: result('away', 'away', 'away') }, homeOwner), /result is final/);
  const corrected = applySubmitResult(approved, { tierId: 'goat', fixtureId: f.id, courts: result('away', 'away', 'away') }, 'admin', true).state.fixtures.goat[f.id];
  assert.equal(corrected.status, 'final'); assert.equal(corrected.result.winner, 'away');
});

test('standings award 1 point per win and rank by head-to-head, courts and games', () => {
  let state = league(4);
  const [a, b, c, d] = Object.values(state.registrations).map(t => t.teamId);
  const play = (home, away, winners) => { const f = Object.values(state.fixtures.goat).find(x => (x.home === home && x.away === away) || (x.home === away && x.away === home)); const flip = w => (f.home === home ? w : w === 'home' ? 'away' : 'home'); state = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts: result(...winners.map(flip)) }, 'admin', true).state; };
  play(a, b, ['home', 'home', 'home']);
  play(c, d, ['home', 'home', 'away']);
  play(a, c, ['away', 'home', 'home']);
  const table = standings(Object.values(state.tiers.goat.teams), state.fixtures.goat);
  assert.deepEqual(table.map(r => r.team.teamId), [a, c, d, b]);
  assert.deepEqual([table[0].played, table[0].won, table[0].points, table[0].matchesWon, table[0].matchesLost], [2, 2, 2, 5, 1]);
  assert.deepEqual(table[0].form, ['W', 'W']);
  assert.equal(encounterWinner([{ winner: 'away' }, { winner: 'home' }, { winner: 'away' }]), 'away');
  assert.equal(playoffSpots(8), 4); assert.equal(playoffSpots(7), 3);
});

test('each captain can find their own teams, and recalculation rebuilds that index', () => {
  const state = league(2), [first] = Object.values(state.registrations);
  assert.deepEqual(state.teamsByOwner[first.ownerUid], { [first.teamId]: true });
  const stripped = structuredClone(state); delete stripped.teamsByOwner;
  assert.deepEqual(applyRecalculation(stripped).state.teamsByOwner[first.ownerUid], { [first.teamId]: true });
});

const lineups = { home: { d1: ['captain', 'ace1'], d2Partner: 'ace1' }, away: { d1: ['ace1', 'ace2'], d2Partner: 'ace2' } };
test('a lineup decides every match: Doubles 1 pair, Doubles 2 = third + partner, singles = left out', () => {
  assert.deepEqual(deriveLineup({ d1: ['captain', 'ace1'], d2Partner: 'ace1' }), { d1: ['captain', 'ace1'], d2Partner: 'ace1', third: 'ace2', leftOut: 'captain' });
  const state = league(2), f = Object.values(state.fixtures.goat)[0];
  const saved = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts: result('home', 'home', 'away'), lineups }, 'admin', true).state.fixtures.goat[f.id];
  assert.deepEqual(matchPlayers(saved, 'home'), { d1: ['captain', 'ace1'], d2: ['ace2', 'ace1'], s: ['captain'] });
  assert.deepEqual(matchPlayers(saved, 'away'), { d1: ['ace1', 'ace2'], d2: ['captain', 'ace2'], s: ['ace1'] });
  for (const bad of [{ d1: ['captain', 'captain'], d2Partner: 'captain' }, { d1: ['captain', 'ace1'], d2Partner: 'ace2' }, { d1: ['captain'], d2Partner: 'captain' }])
    assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts: result('home', 'home', 'home'), lineups: { home: bad, away: lineups.away } }, 'admin', true));
});

function finishLeague(state, count) {
  for (const f of Object.values(state.fixtures.goat)) {
    const order = Object.keys(state.registrations), homeBetter = order.indexOf(f.home) < order.indexOf(f.away);
    const w = homeBetter ? 'home' : 'away';
    state = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts: result(w, w, w), lineups }, 'admin', true).state;
  }
  return state;
}
const po = (d1, s1, d2, s2, d3) => ({ d1: courtFor('doubles', d1), s1: courtFor('singles', s1), d2: courtFor('doubles', d2), s2: courtFor('singles', s2), d3: courtFor('super', d3) });

test('playoffs seed from standings, play first to 3, and the winners reach the final', () => {
  let state = finishLeague(league(8), 8);
  const [a, b, c, d] = Object.keys(state.registrations);
  state = applyGeneratePlayoffs(state, { tierId: 'goat' }).state;
  const fx = state.fixtures.goat;
  assert.deepEqual([fx['po-sf1'].home, fx['po-sf1'].away, fx['po-sf2'].home, fx['po-sf2'].away], [a, c, b, d]);
  assert.equal(fx['po-final'].status, 'pending');
  assert.equal(standings(Object.values(state.tiers.goat.teams), fx)[0].played, 7, 'playoff matches never count in the league table');
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-final', courts: po('home', 'home', 'home', 'home', 'home') }, 'admin', true), /waiting for the earlier rounds/);
  const sf1 = courts => applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-sf1', courts }, 'admin', true);
  const { s2: _s2, ...fourCourts } = po('home', 'home', 'home', 'home', 'home');
  assert.throws(() => sf1(fourCourts), { message: 'All courts must have a completed score before submitting.' });
  assert.throws(() => sf1({ ...po('home', 'home', 'home', 'home', 'home'), d3: { home: 10, away: 9 } }), { message: 'Doubles 3: Match tiebreak must be won by at least 2 points, with the winner reaching at least 10.' });
  assert.throws(() => sf1({ ...po('home', 'home', 'home', 'home', 'home'), s1: { set: { home: 8, away: 7 } } }), { message: 'Singles 1: An 8-7 pro set requires tiebreak points.' });
  assert.equal(sf1(po('home', 'home', 'away', 'away', 'home')).state.fixtures.goat['po-sf1'].result.score, '3-2');
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-sf1', courts: po('home', 'away', 'home', 'away', 'away') }, 'admin', true).state;
  assert.equal(state.fixtures.goat['po-sf1'].result.winner, 'away');
  const owner = state.registrations[d].ownerUid;
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-sf2', courts: po('away', 'away', 'away', 'away', 'away') }, owner).state;
  assert.equal(state.fixtures.goat['po-final'].status, 'pending', 'a captain submission does not advance until approved');
  state = applyReviewResult(state, { tierId: 'goat', fixtureId: 'po-sf2', approve: true }).state;
  assert.deepEqual([state.fixtures.goat['po-final'].home, state.fixtures.goat['po-final'].away, state.fixtures.goat['po-final'].status], [c, d, 'scheduled']);
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-sf1', courts: po('home', 'home', 'home', 'home', 'home') }, 'admin', true).state;
  assert.equal(state.fixtures.goat['po-final'].home, a, 'a corrected semifinal updates the final');
});

test('three-team playoffs use an eliminator; playoffs need finished league results unless forced', () => {
  let state = league(3);
  assert.throws(() => applyGeneratePlayoffs(state, { tierId: 'goat' }), /not final yet/);
  state = applyGeneratePlayoffs(finishLeague(state, 3), { tierId: 'goat' }).state;
  const [a, b, c] = Object.keys(state.registrations), fx = state.fixtures.goat;
  assert.deepEqual([fx['po-elim'].home, fx['po-elim'].away, fx['po-final'].home, fx['po-final'].away], [b, c, a, null]);
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-elim', courts: po('away', 'away', 'home', 'away', 'away') }, 'admin', true).state;
  assert.deepEqual([state.fixtures.goat['po-final'].away, state.fixtures.goat['po-final'].status], [c, 'scheduled']);
  assert.ok(applyGeneratePlayoffs(league(4), { tierId: 'goat', force: true }));
});

test('ratings move with game share against expectation and track each player history', () => {
  assert.equal(gameShare('6-0 6-0'), 1); assert.equal(gameShare('6-4 6-4'), 0.6); assert.equal(gameShare('3-6 6-3 10-8'), 10 / 19); assert.equal(gameShare(''), 0.65);
  assert.equal(gameShare('4-3(7-5) 4-3(7-2)'), 8 / 14, 'tiebreak points in brackets are not games');
  let state = league(2);
  const f = Object.values(state.fixtures.goat)[0];
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts: { d1: { sets: [{ home: 4, away: 0 }, { home: 4, away: 0 }] }, d2: { sets: [{ home: 4, away: 1 }, { home: 4, away: 2 }] }, s: { set: { home: 5, away: 8 } } }, lineups }, 'admin', true).state;
  const ratings = playerRatings(Object.values(state.tiers.goat.teams), state.fixtures);
  const homeCaptain = ratings.get(playerId(f.home, 'captain')), awaySingles = ratings.get(playerId(f.away, 'ace1'));
  assert.equal(homeCaptain.start, 6);
  assert.ok(awaySingles.history.find(h => h.match === 'Singles').change > 0, 'the singles winner gains from that match');
  assert.ok(awaySingles.history.find(h => h.match === 'Doubles 1').change < 0, 'and loses from the heavy Doubles 1 defeat');
  assert.ok(ratings.get(playerId(f.home, 'ace1')).rating > 6, 'a dominant doubles winner gains');
  assert.equal(homeCaptain.history.length, 2); assert.equal(homeCaptain.wins + homeCaptain.losses, 2);
  assert.deepEqual([homeCaptain.doubles.wins, homeCaptain.singles.losses], [1, 1]);
  assert.equal(ratings.get(playerId(f.home, 'ace2')).history[0].match, 'Doubles 2');
});

test('league rules are validated, saved and change ratings, points and playoff spots', () => {
  const base = initialState();
  for (const bad of [{ ...DEFAULT_LEAGUE_RULES, pointsPerWin: 0 }, { ...DEFAULT_LEAGUE_RULES, playoffSpotsLarge: 5 }, { ...DEFAULT_LEAGUE_RULES, singlesMinPercent: 101 }, { ...DEFAULT_LEAGUE_RULES, extra: 1 }])
    assert.throws(() => applyLeagueRules(base, bad));
  const rules = { ...DEFAULT_LEAGUE_RULES, utrGapLimit: 250, pointsPerWin: 3, playoffThreshold: 3, playoffSpotsLarge: 2 };
  const state = applyLeagueRules(base, rules).state;
  assert.deepEqual(publicState(state).leagueRules, { ...rules, revision: 1 });
  assert.deepEqual(publicState(initialState()).leagueRules, DEFAULT_LEAGUE_RULES, 'older data falls back to defaults');
  const p = team('Gap', 'team_gap0000000000000000', [500, 600, 600]); p.captain.doublesUtr = 700;
  assert.equal(applyRegistration(state, p, 'u').state.registrations.team_gap0000000000000000.captain.utr, 700, 'a 2.00 gap no longer averages when the limit is 2.50');
  let s = league(4); s = applyLeagueRules(s, rules).state;
  const f = Object.values(s.fixtures.goat)[0];
  s = applySubmitResult(s, { tierId: 'goat', fixtureId: f.id, courts: result('home', 'home', 'home') }, 'admin', true).state;
  assert.equal(standings(Object.values(s.tiers.goat.teams), s.fixtures.goat, rulesOf(s))[0].points, 3);
  assert.equal(playoffSpots(4, rulesOf(s)), 2);
});

test('the admin can map playoff seeds manually, including a two-team final', () => {
  const state = league(5), ids = Object.keys(state.registrations);
  const four = applyGeneratePlayoffs(state, { tierId: 'goat', seeds: [ids[4], ids[3], ids[2], ids[1]] }).state.fixtures.goat;
  assert.deepEqual([four['po-sf1'].home, four['po-sf1'].away, four['po-sf2'].home, four['po-sf2'].away], [ids[4], ids[2], ids[3], ids[1]]);
  const two = applyGeneratePlayoffs(state, { tierId: 'goat', seeds: [ids[0], ids[1]] }).state.fixtures.goat;
  assert.deepEqual([two['po-final'].home, two['po-final'].away, two['po-final'].status], [ids[0], ids[1], 'scheduled']);
  assert.equal(Object.values(two).filter(f => !f.stage).length, 10, 'league fixtures are kept');
  assert.throws(() => applyGeneratePlayoffs(state, { tierId: 'goat', seeds: [ids[0], ids[0], ids[1]] }), /different team/);
  assert.throws(() => applyGeneratePlayoffs(state, { tierId: 'goat', seeds: [ids[0], 'team_not_in_this_tier00'] }), /different team/);
  assert.throws(() => applyGeneratePlayoffs(state, { tierId: 'goat', seeds: [ids[0]] }), /2, 3 or 4/);
  let done = applySubmitResult(applyGeneratePlayoffs(state, { tierId: 'goat', seeds: [ids[0], ids[1]] }).state, { tierId: 'goat', fixtureId: 'po-final', courts: po('away', 'away', 'away', 'away', 'away') }, 'admin', true).state;
  assert.equal(done.fixtures.goat['po-final'].result.winner, 'away');
});

test('singles minimum counts singles days against the share of scheduled match days', () => {
  let state = league(6);
  const teamId = Object.keys(state.registrations)[0], mine = Object.values(state.fixtures.goat).filter(f => f.home === teamId || f.away === teamId);
  assert.equal(mine.length, 5);
  for (const f of mine.slice(0, 3)) state = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts: result('home', 'home', 'home'), lineups: { home: { d1: ['ace1', 'ace2'], d2Partner: 'ace2' }, away: { d1: ['ace1', 'ace2'], d2Partner: 'ace2' } } }, 'admin', true).state;
  const check = singlesEligibility(teamId, state.fixtures.goat);
  assert.deepEqual([check.matchDays, check.required, check.left], [5, 1, 2]);
  assert.deepEqual(check.players.ace1, { days: 3, met: true, possible: true }, 'ace1 is left out of Doubles 2 and plays every singles');
  assert.deepEqual(check.players.captain, { days: 0, met: false, possible: true });
  assert.equal(singlesEligibility(teamId, state.fixtures.goat, { ...DEFAULT_LEAGUE_RULES, singlesMinPercent: 100 }).players.captain.possible, false);
});

test('closing a season archives it publicly and privately, then starts a clean season', () => {
  let state = finishLeague(league(3), 3);
  const ids = Object.keys(state.registrations);
  state = applyGeneratePlayoffs(state, { tierId: 'goat' }).state;
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-elim', courts: po('home', 'home', 'home', 'home', 'home') }, 'admin', true).state;
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-final', courts: po('away', 'away', 'away', 'away', 'away') }, 'admin', true).state;
  state = applyManageSeason(state, { action: 'rename', name: 'Spring 2026' }).state;
  assert.throws(() => applyManageSeason(state, { action: 'archive', name: 'Autumn 2026', confirm: 'wrong' }), /Type the current season name/);
  const { state: next, result: outcome } = applyManageSeason(state, { action: 'archive', name: 'Autumn 2026', confirm: 'Spring 2026' }, 5000);
  const season = next.seasons[outcome.archived];
  assert.equal(season.name, 'Spring 2026');
  assert.deepEqual(season.champions.goat, { winner: ids[1], runnerUp: ids[0] });
  assert.equal(Object.keys(season.tiers.goat.teams).length, 3);
  assert.equal(Object.keys(next.archive[outcome.archived].registrations).length, 3, 'private registrations are kept for the admin');
  assert.deepEqual([Object.keys(next.registrations).length, Object.keys(next.fixtures).length, Object.keys(next.tiers).length], [0, 0, 0]);
  assert.deepEqual(next.season, { name: 'Autumn 2026', startedAt: 5000 });
  assert.equal(publicState(next).seasons[outcome.archived].name, 'Spring 2026');
  assert.equal(publicState(next).archive, undefined, 'the private archive is never public');
});

// ---------- dates, challenges, team management ----------
import { applySetSchedule, applyMoveFixture, addDays, deadlineEnd, isOverdue, onTime, challengeStatus, applyIssueChallenge, applyUpdateTeam, applyWithdrawTeam, applySetCaptainLogin } from '../../functions/lib/league.js';
const day = date => Date.parse(`${date}T12:00:00Z`);

test('a schedule dates every round, deadlines last to the end of the day anywhere, and results record whether they were on time', () => {
  let state = applySetSchedule(league(4), { tierId: 'goat', start: '2026-01-05', intervalDays: 7 }).state;
  const fx = Object.values(state.fixtures.goat), r1 = fx.find(f => f.round === 1), r3 = fx.find(f => f.round === 3);
  assert.deepEqual([r1.startsOn, r1.dueBy, r3.startsOn, r3.dueBy], ['2026-01-05', '2026-01-11', '2026-01-19', '2026-01-25']);
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
  assert.ok(deadlineEnd('2026-01-11') > Date.parse('2026-01-12T11:00:00Z') && deadlineEnd('2026-01-11') < Date.parse('2026-01-12T12:00:00Z'));
  assert.equal(isOverdue(r1, day('2026-01-13')), true); assert.equal(isOverdue(r1, day('2026-01-10')), false);
  assert.throws(() => applySetSchedule(state, { tierId: 'goat', start: '5 Jan', intervalDays: 7 }), /must be a date/);
  assert.throws(() => applySetSchedule(state, { tierId: 'goat', start: '2026-01-05', intervalDays: 0 }), /1–60/);
  const owner = state.registrations[r1.home].ownerUid;
  const late = applySubmitResult(state, { tierId: 'goat', fixtureId: r1.id, courts: result('home', 'home', 'home') }, owner, false, day('2026-01-14')).state;
  const approved = applyReviewResult(late, { tierId: 'goat', fixtureId: r1.id, approve: true }, day('2026-01-15')).state.fixtures.goat[r1.id];
  assert.equal(onTime(approved), false);
  const early = applySubmitResult(state, { tierId: 'goat', fixtureId: r1.id, courts: result('home', 'home', 'home') }, owner, false, day('2026-01-09')).state;
  assert.equal(onTime(applyReviewResult(early, { tierId: 'goat', fixtureId: r1.id, approve: true }, day('2026-01-20')).state.fixtures.goat[r1.id]), true, 'the captain submission time counts, not the approval time');
  const rejected = applyReviewResult(early, { tierId: 'goat', fixtureId: r1.id, approve: false }).state.fixtures.goat[r1.id];
  assert.equal(rejected.completedAt, undefined, 'a rejected score does not count as completed');
  assert.equal(applyMoveFixture(state, { tierId: 'goat', fixtureId: r1.id, dueBy: '2026-01-20' }).state.fixtures.goat[r1.id].dueBy, '2026-01-20');
  const generated = applyGenerateFixtures(league(4), { tierId: 'goat', replace: true, start: '2026-03-02', intervalDays: 14 }).state;
  assert.equal(Object.values(generated.fixtures.goat).find(f => f.round === 2).dueBy, '2026-03-29');
});

function challengeLeague() {
  // 8 teams over 7 weekly rounds from 5 Jan; after round 2, registration order decides the table.
  let state = applySetSchedule(league(8), { tierId: 'goat', start: '2026-01-05', intervalDays: 7 }).state;
  const order = Object.keys(state.registrations);
  for (const f of Object.values(state.fixtures.goat).filter(f => f.round <= 2)) {
    const w = order.indexOf(f.home) < order.indexOf(f.away) ? 'home' : 'away';
    state = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts: result(w, w, w) }, 'admin', true, day(f.dueBy) - 86400000).state;
  }
  return { state, order };
}

test('the challenge rule: who can challenge, when, once only, and a win swaps places', () => {
  const { state, order } = challengeLeague(), now = day('2026-01-20');
  const table = standings(Object.values(state.tiers.goat.teams), state.fixtures.goat).map(r => r.team.teamId);
  const fifth = table[4], third = table[2], second = table[1], seventh = table[6];
  const owner = id => state.registrations[id].ownerUid;
  assert.equal(challengeStatus(state, 'goat', fifth, now).allowed, true);
  assert.match(challengeStatus(state, 'goat', seventh, now).reasons[0], /places 5–6/);
  assert.match(challengeStatus(state, 'goat', fifth, day('2026-02-02')).reasons.join(' '), /last 3 weeks/);
  assert.throws(() => applyIssueChallenge(state, { tierId: 'goat', challenger: fifth, target: third }, owner(seventh), false, now), /captain/);
  assert.throws(() => applyIssueChallenge(state, { tierId: 'goat', challenger: fifth, target: table[0] }, owner(fifth), false, now), /places 2–4/);
  let next = applyIssueChallenge(state, { tierId: 'goat', challenger: fifth, target: third }, owner(fifth), false, now).state;
  const ch = Object.values(next.fixtures.goat).find(f => f.challenge);
  assert.deepEqual([ch.home, ch.away, ch.status, ch.startsOn, ch.dueBy], [fifth, third, 'scheduled', '2026-01-20', '2026-01-26']);
  assert.match(challengeStatus(next, 'goat', fifth, now).reasons.join(' '), /only once/);
  next = applySubmitResult(next, { tierId: 'goat', fixtureId: ch.id, courts: result('home', 'home', 'away') }, 'admin', true, now).state;
  const after = standings(Object.values(next.tiers.goat.teams), next.fixtures.goat);
  assert.deepEqual([after[2].team.teamId, after[4].team.teamId], [fifth, third], 'the winning challenger takes third place');
  assert.equal(after.find(r => r.team.teamId === fifth).played, 2, 'a challenge never adds points or games to the table');
  const lost = applySubmitResult(applyIssueChallenge(state, { tierId: 'goat', challenger: fifth, target: second }, 'x', true, now).state, { tierId: 'goat', fixtureId: `ch${now}`, courts: result('away', 'away', 'away') }, 'admin', true, now).state;
  assert.equal(standings(Object.values(lost.tiers.goat.teams), lost.fixtures.goat)[4].team.teamId, fifth, 'a losing challenger keeps its place');
  let late = structuredClone(state); const mine = Object.values(late.fixtures.goat).find(f => f.round === 1 && (f.home === fifth || f.away === fifth)); mine.completedAt = day('2026-01-15');
  assert.match(challengeStatus(late, 'goat', fifth, now).reasons.join(' '), /on time/);
  const off = { ...rulesOf(state), challengeEnabled: false };
  assert.match(challengeStatus({ ...state, leagueRules: off }, 'goat', fifth, now).reasons[0], /turned off/);
  void order;
});

test('captains and the admin can edit or withdraw teams within the limits', () => {
  let state = league(4);
  const [a, b] = Object.keys(state.registrations), ownerA = state.registrations[a].ownerUid;
  const edit = (extra = {}) => ({ teamId: a, captain: { firstName: 'Renamed', singlesUtr: 600, doublesUtr: null }, ace1: { fullName: 'New Ace', singlesUtr: 600, doublesUtr: null }, ace2: { fullName: 'Other Ace', singlesUtr: 600, doublesUtr: null }, selectedTier: 'goat', ...extra });
  const before = applyUpdateTeam(initialStateWith(state), edit(), ownerA).state;
  assert.equal(before.tiers.goat.teams[a].captainFirstName, 'Renamed');
  assert.throws(() => applyUpdateTeam(state, edit(), ownerA), /Fixtures are already scheduled/);
  assert.throws(() => applyUpdateTeam(state, edit(), 'someone-else', false), /captain or the admin/);
  assert.equal(applyUpdateTeam(state, edit(), 'admin', true).state.registrations[a].ace1.fullName, 'New Ace');
  assert.throws(() => applyUpdateTeam(state, edit({ captain: { firstName: 'Low', singlesUtr: 400, doublesUtr: null }, selectedTier: 'rising' }), 'admin', true), /moves the team to another tier/);
  const withdrawn = applyWithdrawTeam(state, { teamId: a }, 'admin', true, 9).state;
  assert.equal(withdrawn.registrations[a], undefined); assert.equal(withdrawn.withdrawn[a].withdrawnAt, 9);
  assert.equal(withdrawn.tiers.goat.teams[a], undefined);
  assert.equal(Object.values(withdrawn.fixtures.goat).filter(f => f.home === a || f.away === a).length, 0);
  assert.equal(Object.values(withdrawn.fixtures.goat).length, 3);
  assert.throws(() => applyWithdrawTeam(state, { teamId: b }, ownerA), /captain or the admin/);
  void b;
});
function initialStateWith(state) { const copy = structuredClone(state); delete copy.fixtures; return copy; }

test('a captain login owns the team on any device, survives recalculation, and the admin can set one', () => {
  const id = 'team_claim00000000000000', login = { uid: `cap_${id}`, username: 'claim-k7q2' };
  const state = applyRegistration(initialState(), team('Claim', id), 'phone-1', 1, login).state, record = state.registrations[id];
  assert.equal(record.captainUsername, 'claim-k7q2');
  assert.equal(record.captainUid, login.uid);
  assert.deepEqual(record.owners, { [login.uid]: true });
  assert.deepEqual(state.teamsByOwner[login.uid], { [id]: true });
  assert.ok(isOwner(record, login.uid) && isOwner(record, 'phone-1') && !isOwner(record, 'someone-else'));
  assert.equal(applyRegistration(state, team('Claim', id), 'phone-1', 2, null).result.created, undefined, 'repeating a registration changes nothing');
  assert.deepEqual(applyRecalculation(state).state.teamsByOwner[login.uid], { [id]: true }, 'recalculation keeps the login’s teams');
  assert.equal(JSON.stringify(state.tiers).includes('claim-k7q2'), false, 'the username is not in public data');
  // a team registered without a login (or whose login was removed) can be given one by the admin
  const bare = applyRegistration(initialState(), team('Bare', 'team_bare000000000000000'), 'phone-1', 1).state;
  assert.equal(bare.registrations.team_bare000000000000000.captainUsername, undefined);
  const given = applySetCaptainLogin(bare, { teamId: 'team_bare000000000000000', uid: 'cap_x', username: 'bare-2222' }).state;
  assert.ok(isOwner(given.registrations.team_bare000000000000000, 'cap_x'));
  assert.deepEqual(given.teamsByOwner.cap_x, { team_bare000000000000000: true });
  assert.throws(() => applySetCaptainLogin(bare, { teamId: 'team_gone0000000000000', uid: 'cap_y', username: 'gone-1' }), /no longer exists/);
  assert.throws(() => applySetCaptainLogin(bare, { teamId: 'team_bare000000000000000', uid: '', username: '' }), /Invalid captain login/);
});

// ---- singles minimum must be satisfiable by all three players ----
import { MAX_SINGLES_PERCENT, validateLeagueRules } from '../../functions/lib/tournament.js';
test('the singles minimum is something every player of a three-player team can reach', () => {
  assert.equal(MAX_SINGLES_PERCENT, 33);
  assert.equal(DEFAULT_LEAGUE_RULES.singlesMinPercent, 30);
  for (let percent = 0; percent <= MAX_SINGLES_PERCENT; percent++) {
    for (let matchDays = 1; matchDays <= 40; matchDays++) {
      const each = Math.floor((matchDays * percent) / 100);
      assert.ok(each * 3 <= matchDays, `${percent}% of ${matchDays} match days needs ${each * 3} singles slots but there are only ${matchDays}`);
    }
  }
  // the old 40% could not work: 8 match days need 3 singles days each = 9 singles matches, but there are 8
  assert.ok(3 * Math.floor((8 * 40) / 100) > 8);
});

test('an impossible singles minimum can neither be saved nor applied', () => {
  for (const bad of [34, 40, 50, 100]) assert.throws(() => validateLeagueRules({ ...DEFAULT_LEAGUE_RULES, singlesMinPercent: bad }), /0–33%/, `${bad}`);
  assert.doesNotThrow(() => validateLeagueRules({ ...DEFAULT_LEAGUE_RULES, singlesMinPercent: 33 }));
  assert.equal(rulesOf({}).singlesMinPercent, 30, 'nothing saved: the default');
  assert.equal(rulesOf({ leagueRules: { singlesMinPercent: 40 } }).singlesMinPercent, 33, 'an older saved 40% is capped');
  assert.equal(rulesOf({ leagueRules: { singlesMinPercent: 28 } }).singlesMinPercent, 28);
  // a team can really meet it: 8 match days at the default 30% need 2 singles days each (6 of the 8 singles matches)
  const state = league(2), id = Object.keys(state.registrations)[0];
  assert.equal(singlesEligibility(id, state.fixtures.goat, rulesOf(state)).required, Math.floor((Object.values(state.fixtures.goat).length * 30) / 100));
});

test('results saved before the court change (old match order, no totals) still rate and rank correctly', () => {
  let state = league(2);
  const f = Object.values(state.fixtures.goat)[0];
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, courts: result('home', 'home', 'away'), lineups }, 'admin', true).state;
  const fx = state.fixtures.goat[f.id], byKey = Object.fromEntries(fx.result.matches.map(m => [m.key, m]));
  const modern = playerRatings(Object.values(state.tiers.goat.teams), state.fixtures);
  fx.result = { matches: ['d1', 'd2', 's'].map(k => byKey[k]), winner: fx.result.winner, lineups: fx.result.lineups, approvedAt: fx.result.approvedAt };
  const legacy = playerRatings(Object.values(state.tiers.goat.teams), state.fixtures);
  for (const [id, p] of modern) assert.equal(legacy.get(id).rating, p.rating, `${id} rating is the same from an old-order result`);
  const row = standings(Object.values(state.tiers.goat.teams), state.fixtures.goat).find(r => r.team.teamId === f.home);
  assert.deepEqual([row.won, row.matchesWon, row.matchesLost, row.gamesWon], [1, 2, 1, 0]);
});

test('the admin links registered players to PPRC; verified after more than 5 matches, otherwise NR; the public sees no ids', () => {
  const state = league(2), teamId = Object.keys(state.registrations)[0];
  const player = (id, overall, matches) => ({ id, overall, singles: overall, doubles: overall - 0.1, matches });
  assert.throws(() => applyLinkPprc(state, { links: [{ teamId, role: 'ace1', player: player('p_a', 6, 8) }] }, false), /Only the admin/);
  const linked = applyLinkPprc(state, { links: [
    { teamId, role: 'captain', player: player('p_cap', 6.123, 6) },
    { teamId, role: 'ace1', player: player('p_ace_one', 5.5, 5) },
    { teamId, role: 'ace2', player: player('p_ace_two', 5.25, 40) }
  ] }, true, 77);
  assert.deepEqual(linked.result, { linked: 3, unlinked: 0 });
  const record = linked.state.registrations[teamId];
  assert.deepEqual([record.pprcLinks.captain.verified, record.pprcLinks.ace1.verified, record.pprcLinks.ace2.verified], [true, false, true], 'more than 5 matches is verified; exactly 5 is not');
  assert.equal(record.pprcLinks.captain.overall, 6.12); assert.equal(record.pprcLinks.captain.linkedAt, 77);
  const pub = Object.values(linked.state.tiers).flatMap(t => Object.values(t.teams)).find(t => t.teamId === teamId);
  assert.deepEqual(pub.pprc, { captain: { verified: true, rating: 6.12, singles: 6.12, doubles: 6.02 }, ace1: { verified: false }, ace2: { verified: true, rating: 5.25, singles: 5.25, doubles: 5.15 } }, 'ratings (overall, singles, doubles) show only when verified');
  const text = JSON.stringify(publicState(linked.state));
  assert.ok(!text.includes('p_cap') && !text.includes('p_ace') && !text.includes('"matches":5'), 'ids and provisional figures stay private');
  const again = applyLinkPprc(linked.state, { links: [{ teamId, role: 'ace1', player: player('p_ace_one', 5.9, 6) }, { teamId, role: 'captain', player: null }] }, true).state;
  assert.equal(again.registrations[teamId].pprcLinks.captain, undefined, 'a link can be removed');
  const pub2 = Object.values(again.tiers).flatMap(t => Object.values(t.teams)).find(t => t.teamId === teamId);
  assert.deepEqual(pub2.pprc, { ace1: { verified: true, rating: 5.9, singles: 5.9, doubles: 5.8 }, ace2: { verified: true, rating: 5.25, singles: 5.25, doubles: 5.15 } });
  const none = applyLinkPprc(again, { links: ['captain', 'ace1', 'ace2'].map(role => ({ teamId, role, player: null })) }, true).state;
  assert.equal(none.registrations[teamId].pprcLinks, undefined); assert.equal(Object.values(none.tiers).flatMap(t => Object.values(t.teams))[0].pprc, undefined);
});

test('PPRC links are checked: known team and role, a valid player, no duplicate in one team', () => {
  const state = league(2), teamId = Object.keys(state.registrations)[0], ok = { id: 'p_x_y', overall: 5, singles: 5, doubles: 5, matches: 3 };
  const link = (extra = {}, player = ok) => applyLinkPprc(state, { links: [{ teamId, role: 'ace1', player, ...extra }] }, true);
  assert.throws(() => link({ teamId: 'nope' }), /no longer exists/);
  assert.throws(() => link({ role: 'ace3' }), /Invalid player role/);
  assert.throws(() => link({}, { ...ok, id: 'Someone Else' }), /Invalid PPRC player/);
  assert.throws(() => link({}, { ...ok, overall: 99 }), /Invalid PPRC rating/);
  assert.throws(() => link({}, { ...ok, matches: -1 }), /match count/);
  assert.throws(() => link({}, { ...ok, matches: 2.5 }), /match count/);
  assert.throws(() => applyLinkPprc(state, { links: [] }, true), /at least one/);
  assert.throws(() => applyLinkPprc(state, { links: [{ teamId, role: 'ace1', player: ok }, { teamId, role: 'ace2', player: ok }] }, true), /twice/);
});

import { buildDemoState } from '../../functions/lib/demoSeed.js';
test('the demo seed registers sample teams from PPRC players, links most of them, and leaves some as NR', () => {
  const names = Array.from({ length: 24 }, (_, i) => `Person${String.fromCharCode(97 + i)} Surname${i}`);
  const tree = { pprcMaster: { playerList: {}, players: {}, ratings: {} } };
  names.forEach((name, i) => {
    const id = `p_${name.toLowerCase().replace(/ /g, '_')}`, s = 4 + i * 0.12;
    tree.pprcMaster.playerList[id] = { name, overall: s, played: 3, clubs: ['koc'] }; tree.pprcMaster.players[id] = { name };
    tree.pprcMaster.ratings[id] = { overall: s, singles: s, doubles: s, seed: { singles: s, doubles: s }, played: { singles: i % 2 ? 9 : 2, doubles: 1 } };
  });
  const { state, summary } = buildDemoState(tree, { teams: 6, now: 1000 });
  assert.ok(summary.teams >= 3 && summary.linked >= 6);
  const pub = Object.values(state.tiers).flatMap(t => Object.values(t.teams));
  assert.equal(pub.length, summary.teams, 'every created team is listed in a tier');
  const badges = pub.flatMap(t => Object.values(t.pprc || {}));
  assert.ok(badges.some(b => b.verified) && badges.some(b => !b.verified), 'both a verified rating and NR appear');
  assert.ok(pub.some(t => !t.pprc?.captain || !t.pprc?.ace1 || !t.pprc?.ace2), 'some players are left unlinked');
  assert.ok(Object.values(state.registrations).every(r => /^\+1555/.test(r.whatsappPhone) && r.ownerUid.startsWith('demo_owner_')));
  assert.deepEqual(buildDemoState(null, { teams: 4 }).summary.linked, 0, 'without PPRC data the teams are made up and nothing is linked');
  assert.ok(buildDemoState(null, { teams: 4 }).summary.teams >= 2);
});

test('the demo seed keeps an existing demo\'s settings when it only fills an empty state', () => {
  const base = initialState(); base.settings = { ...base.settings, aceNameMaskingEnabled: false };
  const { state, summary } = buildDemoState(null, { teams: 4, base });
  assert.ok(summary.teams >= 2);
  assert.equal(state.settings.aceNameMaskingEnabled, false, 'the demo\'s own settings survive');
  assert.equal(base.registrations && Object.keys(base.registrations).length, 0, 'the state passed in is not changed');
});

test('a PPRC link shows its profile id publicly only when the admin made it public, and keeps that choice when refreshed', () => {
  const state = league(2), teamId = Object.keys(state.registrations)[0];
  const player = (id, matches = 9) => ({ id, overall: 6, singles: 6, doubles: 6, matches });
  const pubOf = s => Object.values(s.tiers).flatMap(t => Object.values(t.teams)).find(t => t.teamId === teamId).pprc;
  const first = applyLinkPprc(state, { links: [{ teamId, role: 'ace1', player: player('p_ace_one') }, { teamId, role: 'ace2', player: player('p_ace_two', 2), public: true }] }, true).state;
  assert.deepEqual(pubOf(first), { ace1: { verified: true, rating: 6, singles: 6, doubles: 6 }, ace2: { verified: false, id: 'p_ace_two' } }, 'only the public link carries an id, verified or not');
  assert.equal(first.registrations[teamId].pprcLinks.ace1.public, false);
  const refreshed = applyLinkPprc(first, { links: [{ teamId, role: 'ace2', player: player('p_ace_two', 12) }] }, true).state;
  assert.deepEqual(pubOf(refreshed).ace2, { verified: true, rating: 6, singles: 6, doubles: 6, id: 'p_ace_two' }, 'a refresh without the flag keeps it public');
  const hidden = applyLinkPprc(refreshed, { links: [{ teamId, role: 'ace2', player: player('p_ace_two', 12), public: false }] }, true).state;
  assert.equal(pubOf(hidden).ace2.id, undefined, 'the admin can hide it again');
  assert.throws(() => applyLinkPprc(state, { links: [{ teamId, role: 'ace1', player: player('p_xx'), public: 'yes' }] }, true), /public flag/);
  assert.ok(!JSON.stringify(publicState(first)).includes('p_ace_one'), 'a link that is not public never leaks its id');
});

test('the public team record shows singles and doubles UTR for every player', () => {
  const state = league(2), pub = Object.values(state.tiers).flatMap(t => Object.values(t.teams))[0];
  assert.deepEqual(Object.keys(pub.utrs).sort(), ['ace1', 'ace2', 'captain']);
  for (const role of ['captain', 'ace1', 'ace2']) assert.deepEqual(Object.keys(pub.utrs[role]).sort(), ['doubles', 'singles']);
  assert.equal(pub.utrs.captain.singles, 600, 'in hundredths, like the counted UTR');
  assert.equal(pub.utrs.captain.doubles, null, 'a missing doubles UTR is null, not hidden');
});
