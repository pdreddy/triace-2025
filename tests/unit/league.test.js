import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyRegistration, applyRecalculation } from '../../functions/lib/tournament.js';
import { roundRobin, applyGenerateFixtures, applySubmitResult, applyReviewResult, standings, playoffSpots, encounterWinner } from '../../functions/lib/league.js';

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
  assert.throws(() => applySubmitResult(state, { tierId: 'goat', fixtureId: f.id, matches: result('home', 'away', 'home').slice(0, 2) }, homeOwner), /Doubles 1, Doubles 2 and Singles/);
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
