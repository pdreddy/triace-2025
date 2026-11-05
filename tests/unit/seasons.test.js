import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seasonTable, tierResult, seasonTiers } from '../../src/data/seasons.js';

const season1 = JSON.parse(readFileSync(new URL('../../src/data/season1.json', import.meta.url), 'utf8'));

test('Season 1 import keeps every encounter and both groups', () => {
  assert.deepEqual(seasonTiers(season1).map(t => t.name), ['Group A', 'Group B']);
  assert.equal(Object.keys(season1.fixtures.a).length + Object.keys(season1.fixtures.b).length, 73);
  assert.equal(seasonTable(season1, 'a').length, 9);
  assert.equal(seasonTable(season1, 'b').length, 8);
});

test('Season 1 group winners are the top two of each table; the grand final names the champion', () => {
  for (const tier of ['a', 'b']) {
    const [first, second] = seasonTable(season1, tier), result = tierResult(season1, tier);
    assert.equal(result.winner, first.team.teamId);
    assert.equal(result.runnerUp, second.team.teamId);
    assert.equal(result.basis, 'table');
  }
  const { home, away, result } = season1.grandFinal;
  assert.equal(result.winner === 'home' ? home : away, 'b3');
});

test('closed seasons use their recorded champions', () => {
  const closed = { champions: { goat: { winner: 'x', runnerUp: 'y' } } };
  assert.deepEqual(tierResult(closed, 'goat'), { winner: 'x', runnerUp: 'y', basis: 'final' });
  assert.equal(tierResult(closed, 'rising'), null);
});
