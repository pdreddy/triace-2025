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

test('Season 1 table rows carry the last five results', () => {
  for (const row of [...season1.table.a, ...season1.table.b]) {
    assert.equal(row.form.length, Math.min(5, row.m), row.teamId);
    assert.ok(row.form.every(r => r === 'W' || r === 'L'));
  }
  assert.equal(season1.table.b.find(r => r.teamId === 'b9').form.join(''), 'LLLLL');
});

test('Season 1 Super Six winners and squads', () => {
  assert.deepEqual(season1.championTiers.map(t => t.name), ['GOAT tier', 'Rising Aces']);
  assert.deepEqual(tierResult(season1, 'goat'), { winner: 'a1', runnerUp: 'a2' });
  assert.deepEqual(tierResult(season1, 'rising'), { winner: 'a5', runnerUp: 'b5' });
  const { tiers, weeks, rosters } = season1.superSix, teams = seasonTeams(season1);
  assert.ok(Object.values(tiers).every(t => t.teams.length === 6));
  assert.equal(weeks.length, 3);
  for (const week of weeks) for (const [tier, matches] of Object.entries(week.matches)) {
    assert.equal(matches.length, 3);
    assert.ok(matches.every(m => tiers[tier].teams.includes(m.home) && tiers[tier].teams.includes(m.away) && rosters[m.home] && rosters[m.away]));
  }
  assert.equal(teams.get('a1').superSixMembers, 'Yogesh / Dinkar / Sudharshan');
});

test('closed seasons use their recorded champions', () => {
  const closed = { champions: { goat: { winner: 'x', runnerUp: 'y' } } };
  assert.deepEqual(tierResult(closed, 'goat'), { winner: 'x', runnerUp: 'y' });
  assert.equal(tierResult(closed, 'rising'), null);
});
