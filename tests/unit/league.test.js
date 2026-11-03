import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyRegistration, applyRecalculation, applyLeagueRules, publicState, rulesOf, DEFAULT_LEAGUE_RULES } from '../../functions/lib/tournament.js';
import { roundRobin, applyGenerateFixtures, applyGeneratePlayoffs, applySubmitResult, applyReviewResult, standings, playoffSpots, encounterWinner, deriveLineup, matchPlayers, playerRatings, playerId, gameShare, singlesEligibility, applyManageSeason } from '../../functions/lib/league.js';

const team = (captain, id, values = [600, 600, 600]) => ({ teamId: id, captain: { firstName: captain, singlesUtr: values[0], doublesUtr: null }, ace1: { fullName: `${captain} Ace One`, singlesUtr: values[1], doublesUtr: null }, ace2: { fullName: `${captain} Ace Two`, singlesUtr: values[2], doublesUtr: null }, selectedTier: 'goat', consent: true, rulesAccepted: true });
const result = (...winners) => [{ key: 'd1', winner: winners[0], score: '6-4 6-4' }, { key: 'd2', winner: winners[1], score: '3-6 6-3 10-8' }, { key: 's', winner: winners[2], score: '6-2 6-1' }];
function league(count = 4) {
  let state = initialState();
  for (let i = 0; i < count; i++) state = applyRegistration(state, team(`Cap${i}`, `team_${String(i).padStart(16, '0')}`), `owner${i}`, 1000 + i).state;
  return applyGenerateFixtures(state, { tierId: 'goat' }).state;
}

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
  const submitted = applySubmitResult(state, { tierId: 'goat', fixtureId: fixtures[0].id, matches: result('home', 'home', 'away') }, owner).state;
  assert.throws(() => applyGenerateFixtures(submitted, { tierId: 'goat' }), /already has submitted or final results/);
  assert.equal(Object.values(applyGenerateFixtures(submitted, { tierId: 'goat', replace: true }).state.fixtures.goat).filter(f => f.status !== 'scheduled').length, 0);
  assert.throws(() => applyGenerateFixtures(initialState(), { tierId: 'goat' }), /at least two teams/);
});

test('only the two captains may submit; submissions wait for admin approval', () => {
  const state = league(4), f = Object.values(state.fixtures.goat)[0];
  const homeOwner = state.registrations[f.home].ownerUid;
  const outsider = Object.values(state.registrations).find(t => t.teamId !== f.home && t.teamId !== f.away).ownerUid;
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: result('home', 'away', 'home') }, outsider), /Only the captains/);
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: result('home', 'away') }, homeOwner), /Choose the winner of Singles/);
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: result('home', 'away', 'home').slice(0, 2) }, homeOwner), /Enter a result for Doubles 1, Doubles 2, Singles/);
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: [{ key: 'd1', winner: 'home', score: '<b>' }, ...result('home', 'home', 'home').slice(1)] }, homeOwner), /score can only contain/);
  const submitted = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: result('home', 'away', 'home') }, homeOwner).state;
  const pending = submitted.fixtures.goat[f.id];
  assert.equal(pending.status, 'submitted'); assert.equal(pending.submission.side, 'home'); assert.equal(pending.submission.winner, 'home');
  const rejected = applyReviewResult(submitted, { tierId: 'goat', fixtureId: f.id, approve: false }).state.fixtures.goat[f.id];
  assert.equal(rejected.status, 'scheduled'); assert.equal(rejected.submission, undefined);
  const approved = applyReviewResult(submitted, { tierId: 'goat', fixtureId: f.id, approve: true }).state;
  assert.equal(approved.fixtures.goat[f.id].status, 'final');
  assert.throws(() => applySubmitResult(approved, { tierId: 'goat', fixtureId: f.id, matches: result('away', 'away', 'away') }, homeOwner), /result is final/);
  const corrected = applySubmitResult(approved, { tierId: 'goat', fixtureId: f.id, matches: result('away', 'away', 'away') }, 'admin', true).state.fixtures.goat[f.id];
  assert.equal(corrected.status, 'final'); assert.equal(corrected.result.winner, 'away');
});

test('standings award 2 points per win and break ties on match difference', () => {
  let state = league(4);
  const [a, b, c, d] = Object.values(state.registrations).map(t => t.teamId);
  const play = (home, away, winners) => { const f = Object.values(state.fixtures.goat).find(x => (x.home === home && x.away === away) || (x.home === away && x.away === home)); const flip = w => (f.home === home ? w : w === 'home' ? 'away' : 'home'); state = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: result(...winners.map(flip)) }, 'admin', true).state; };
  play(a, b, ['home', 'home', 'home']);
  play(c, d, ['home', 'home', 'away']);
  play(a, c, ['away', 'home', 'home']);
  const table = standings(Object.values(state.tiers.goat.teams), state.fixtures.goat);
  assert.deepEqual(table.map(r => r.team.teamId), [a, c, d, b]);
  assert.deepEqual([table[0].played, table[0].won, table[0].points, table[0].matchesWon, table[0].matchesLost], [2, 2, 4, 5, 1]);
  assert.deepEqual(table[0].form, ['W', 'W']);
  assert.equal(encounterWinner(result('away', 'home', 'away')), 'away');
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
  const saved = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: result('home', 'home', 'away'), lineups }, 'admin', true).state.fixtures.goat[f.id];
  assert.deepEqual(matchPlayers(saved, 'home'), { d1: ['captain', 'ace1'], d2: ['ace2', 'ace1'], s: ['captain'] });
  assert.deepEqual(matchPlayers(saved, 'away'), { d1: ['ace1', 'ace2'], d2: ['captain', 'ace2'], s: ['ace1'] });
  for (const bad of [{ d1: ['captain', 'captain'], d2Partner: 'captain' }, { d1: ['captain', 'ace1'], d2Partner: 'ace2' }, { d1: ['captain'], d2Partner: 'captain' }])
    assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: result('home', 'home', 'home'), lineups: { home: bad, away: lineups.away } }, 'admin', true));
});

function finishLeague(state, count) {
  for (const f of Object.values(state.fixtures.goat)) {
    const order = Object.keys(state.registrations), homeBetter = order.indexOf(f.home) < order.indexOf(f.away);
    const w = homeBetter ? 'home' : 'away';
    state = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: result(w, w, w), lineups }, 'admin', true).state;
  }
  return state;
}
const po = (...winners) => ['d1', 's1', 'd2', 's2', 'stb'].map((key, i) => ({ key, winner: winners[i] || '', score: winners[i] ? '6-3 6-3' : '' }));

test('playoffs seed from standings, play first to 3, and the winners reach the final', () => {
  let state = finishLeague(league(8), 8);
  const [a, b, c, d] = Object.keys(state.registrations);
  state = applyGeneratePlayoffs(state, { tierId: 'goat' }).state;
  const fx = state.fixtures.goat;
  assert.deepEqual([fx['po-sf1'].home, fx['po-sf1'].away, fx['po-sf2'].home, fx['po-sf2'].away], [a, c, b, d]);
  assert.equal(fx['po-final'].status, 'pending');
  assert.equal(standings(Object.values(state.tiers.goat.teams), fx)[0].played, 7, 'playoff matches never count in the league table');
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-final', matches: po('home', 'home', 'home') }, 'admin', true), /waiting for the earlier rounds/);
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-sf1', matches: po('home', 'home', 'home', 'away') }, 'admin', true), /not played once a team has won three/);
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-sf1', matches: po('home', 'home', 'away', 'away', 'home').map((m, i) => (i === 4 ? m : m)).slice(0, 5).map((m, i) => (i === 3 ? { ...m, winner: 'home' } : m)) }, 'admin', true), /not played once a team has won three/);
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-sf1', matches: po('home', 'away', 'home', 'home', 'away') }, 'admin', true), /not played once/);
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-sf1', matches: po('home', 'away', 'home', 'away', 'away') }, 'admin', true).state;
  assert.equal(state.fixtures.goat['po-sf1'].result.winner, 'away');
  const owner = state.registrations[d].ownerUid;
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-sf2', matches: po('away', 'away', 'away') }, owner).state;
  assert.equal(state.fixtures.goat['po-final'].status, 'pending', 'a captain submission does not advance until approved');
  state = applyReviewResult(state, { tierId: 'goat', fixtureId: 'po-sf2', approve: true }).state;
  assert.deepEqual([state.fixtures.goat['po-final'].home, state.fixtures.goat['po-final'].away, state.fixtures.goat['po-final'].status], [c, d, 'scheduled']);
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-sf1', matches: po('home', 'home', 'home') }, 'admin', true).state;
  assert.equal(state.fixtures.goat['po-final'].home, a, 'a corrected semifinal updates the final');
});

test('three-team playoffs use an eliminator; playoffs need finished league results unless forced', () => {
  let state = league(3);
  assert.throws(() => applyGeneratePlayoffs(state, { tierId: 'goat' }), /not final yet/);
  state = applyGeneratePlayoffs(finishLeague(state, 3), { tierId: 'goat' }).state;
  const [a, b, c] = Object.keys(state.registrations), fx = state.fixtures.goat;
  assert.deepEqual([fx['po-elim'].home, fx['po-elim'].away, fx['po-final'].home, fx['po-final'].away], [b, c, a, null]);
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-elim', matches: po('away', 'away', 'home', 'away') }, 'admin', true).state;
  assert.deepEqual([state.fixtures.goat['po-final'].away, state.fixtures.goat['po-final'].status], [c, 'scheduled']);
  assert.ok(applyGeneratePlayoffs(league(4), { tierId: 'goat', force: true }));
});

test('ratings move with game share against expectation and track each player history', () => {
  assert.equal(gameShare('6-0 6-0'), 1); assert.equal(gameShare('6-4 6-4'), 0.6); assert.equal(gameShare('3-6 6-3 10-8'), 10 / 19); assert.equal(gameShare(''), 0.65);
  let state = league(2);
  const f = Object.values(state.fixtures.goat)[0];
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: [{ key: 'd1', winner: 'home', score: '6-1 6-1' }, { key: 'd2', winner: 'home', score: '6-2 6-2' }, { key: 's', winner: 'away', score: '7-5 7-5' }], lineups }, 'admin', true).state;
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
  assert.deepEqual(publicState(state).leagueRules, rules);
  assert.deepEqual(publicState(initialState()).leagueRules, DEFAULT_LEAGUE_RULES, 'older data falls back to defaults');
  const p = team('Gap', 'team_gap0000000000000000', [500, 600, 600]); p.captain.doublesUtr = 700;
  assert.equal(applyRegistration(state, p, 'u').state.registrations.team_gap0000000000000000.captain.utr, 700, 'a 2.00 gap no longer averages when the limit is 2.50');
  let s = league(4); s = applyLeagueRules(s, rules).state;
  const f = Object.values(s.fixtures.goat)[0];
  s = applySubmitResult(s, { tierId: 'goat', fixtureId: f.id, matches: result('home', 'home', 'home') }, 'admin', true).state;
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
  let done = applySubmitResult(applyGeneratePlayoffs(state, { tierId: 'goat', seeds: [ids[0], ids[1]] }).state, { tierId: 'goat', fixtureId: 'po-final', matches: po('away', 'away', 'away') }, 'admin', true).state;
  assert.equal(done.fixtures.goat['po-final'].result.winner, 'away');
});

test('singles minimum counts singles days against the share of scheduled match days', () => {
  let state = league(6);
  const teamId = Object.keys(state.registrations)[0], mine = Object.values(state.fixtures.goat).filter(f => f.home === teamId || f.away === teamId);
  assert.equal(mine.length, 5);
  for (const f of mine.slice(0, 3)) state = applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: result('home', 'home', 'home'), lineups: { home: { d1: ['ace1', 'ace2'], d2Partner: 'ace2' }, away: { d1: ['ace1', 'ace2'], d2Partner: 'ace2' } } }, 'admin', true).state;
  const check = singlesEligibility(teamId, state.fixtures.goat);
  assert.deepEqual([check.matchDays, check.required, check.left], [5, 2, 2]);
  assert.deepEqual(check.players.ace1, { days: 3, met: true, possible: true }, 'ace1 is left out of Doubles 2 and plays every singles');
  assert.deepEqual(check.players.captain, { days: 0, met: false, possible: true });
  assert.equal(singlesEligibility(teamId, state.fixtures.goat, { ...DEFAULT_LEAGUE_RULES, singlesMinPercent: 100 }).players.captain.possible, false);
});

test('closing a season archives it publicly and privately, then starts a clean season', () => {
  let state = finishLeague(league(3), 3);
  const ids = Object.keys(state.registrations);
  state = applyGeneratePlayoffs(state, { tierId: 'goat' }).state;
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-elim', matches: po('home', 'home', 'home') }, 'admin', true).state;
  state = applySubmitResult(state, { tierId: 'goat', fixtureId: 'po-final', matches: po('away', 'away', 'away') }, 'admin', true).state;
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
