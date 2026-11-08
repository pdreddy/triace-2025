import test from 'node:test';
import assert from 'node:assert/strict';
import { computePprc } from '../../functions/lib/pprc.js';

const players = { strong: { singles: 6.4, doubles: 6.4 }, weak: { singles: 4.2, doubles: 4.2 } };
const sweep = (id, winner, homeGames, awayGames, ts) => ({ id, club: 'ladder', season: 'y2026', ts, courts: [{ label: 'Singles', type: 'singles', home: ['strong'], away: ['weak'], homeGames, awayGames, winner }] });

test('a win never lowers a rating and a loss never raises one, even a 12-0 win over a much weaker player', () => {
  const day = 86400000, matches = [sweep('m1', 'home', 12, 0, 1 * day), sweep('m2', 'home', 12, 3, 8 * day)];
  const { ratings, history } = computePprc({ players, matches });
  for (const e of history.strong) assert.ok(e.change >= 0, `the strong player won, change ${e.change}`);
  for (const e of history.weak) assert.ok(e.change <= 0, `the weak player lost, change ${e.change}`);
  assert.ok(ratings.strong.singles >= 6.4, `strong ended at ${ratings.strong.singles}`);
  assert.ok(ratings.weak.singles <= 4.2, `weak ended at ${ratings.weak.singles}`);
});
