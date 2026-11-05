import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonsOf, seasonTiers, tierResult, seasonTeams } from '../../src/data/seasons.js';

const season1 = seasonsOf({}).s1;

test('Season 1 import keeps every encounter, both groups and every team’s members', () => {
  assert.deepEqual(seasonTiers(season1).map(t => t.name), ['Group A', 'Group B']);
  assert.equal(Object.keys(season1.fixtures.a).length + Object.keys(season1.fixtures.b).length, 73);
  assert.equal(season1.table.a.length, 9);
  assert.equal(season1.table.b.length, 9);
  const teams = seasonTeams(season1);
  assert.equal(teams.size, 18);
  assert.ok([...teams.values()].every(t => t.members.split('/').length === 3));
  assert.equal(season1.grandFinal, undefined);
});

test('published table agrees with the imported results on played, won and lost', () => {
  for (const tier of ['a', 'b']) {
    for (const row of season1.table[tier]) {
      const games = Object.values(season1.fixtures[tier]).filter(f => f.home === row.teamId || f.away === row.teamId);
      const won = games.filter(f => f[f.result.winner] === row.teamId).length;
      assert.deepEqual([games.length, won, games.length - won], [row.m, row.w, row.l], row.teamId);
    }
  }
});

test('Season 1 has no winners until they are announced; closed seasons use their recorded champions', () => {
  assert.equal(tierResult(season1, 'a'), null);
  const closed = { champions: { goat: { winner: 'x', runnerUp: 'y' } } };
  assert.deepEqual(tierResult(closed, 'goat'), { winner: 'x', runnerUp: 'y' });
  assert.equal(tierResult(closed, 'rising'), null);
});
