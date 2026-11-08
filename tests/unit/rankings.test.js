import test from 'node:test';
import assert from 'node:assert/strict';
import { rankPlayers } from '../../functions/lib/rankings.js';

const list = [
  { id: 'a', name: 'Asha', overall: 7.19, singles: 7.39, doubles: 6.98, played: 38, clubs: ['koc', 'triace'] },
  { id: 'b', name: 'Bala', overall: 6.5, singles: 6.0, doubles: 7.0, played: 12, clubs: ['koc'] },
  { id: 'c', name: 'Chitra', overall: 6.5, singles: 6.6, doubles: 6.4, played: 9, clubs: ['ladder'] },
  { id: 'd', name: 'Dev', overall: 8.0, singles: 8.0, doubles: 8.0, played: 3, clubs: ['ladder'] },
  { id: 'e', name: 'Esha', overall: 5.0, singles: 5.0, played: 20, clubs: ['triace'] }
];

test('ranks by the chosen rating and leaves out players with five or fewer courts by default', () => {
  assert.deepEqual(rankPlayers(list).map(p => [p.name, p.rank]), [['Asha', 1], ['Bala', 2], ['Chitra', 2], ['Esha', 4]]);
  assert.deepEqual(rankPlayers(list, { metric: 'doubles' }).map(p => p.name), ['Bala', 'Asha', 'Chitra'], 'Esha has no doubles rating');
  assert.equal(rankPlayers(list, { metric: 'singles' })[0].value, 7.39);
});

test('club filter, unverified players on request, and search keeps the real rank', () => {
  assert.deepEqual(rankPlayers(list, { club: 'ladder' }).map(p => p.name), ['Chitra']);
  assert.deepEqual(rankPlayers(list, { club: 'ladder', verifiedOnly: false }).map(p => [p.name, p.verified]), [['Dev', false], ['Chitra', true]]);
  assert.deepEqual(rankPlayers(list, { query: 'es' }).map(p => [p.name, p.rank]), [['Esha', 4]]);
});

test('tied ratings share a rank and the next place is skipped', () => {
  const rows = rankPlayers(list);
  assert.equal(rows[1].rank, rows[2].rank);
  assert.equal(rows[3].rank, 4);
});
