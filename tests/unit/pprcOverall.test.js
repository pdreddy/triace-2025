import test from 'node:test';
import assert from 'node:assert/strict';
import { computePprc } from '../../functions/lib/pprc.js';

// One singles court and many doubles courts: the overall rating must still be the plain average of the two ratings shown.
test('overall is the plain average of the singles and doubles ratings, however many courts of each were played', () => {
  const players = { a: { singles: 7.4, doubles: 6.1 }, b: { singles: 5, doubles: 5 }, c: { singles: 6, doubles: 6 }, d: { singles: 6, doubles: 6 } };
  const day = 86400000, matches = [{ id: 's', club: 'koc', season: 's3', ts: day, courts: [{ label: 'Singles', type: 'singles', home: ['a'], away: ['b'], homeGames: 8, awayGames: 2, winner: 'home' }] }];
  for (let i = 0; i < 8; i++) matches.push({ id: `d${i}`, club: 'koc', season: 's3', ts: (i + 2) * day, courts: [{ label: 'Doubles', type: 'doubles', home: ['a', 'c'], away: ['b', 'd'], homeGames: 8, awayGames: 4, winner: 'home' }] });
  const { ratings, history } = computePprc({ players, matches });
  for (const id of Object.keys(players)) assert.ok(Math.abs(ratings[id].overall - (ratings[id].singles + ratings[id].doubles) / 2) <= 0.006, `${id}: ${ratings[id].overall} vs ${ratings[id].singles}/${ratings[id].doubles}`);
  const last = history.a.at(-1), singles = ratings.a.singles, doubles = history.a.filter(h => h.type === 'doubles').at(-1).after;
  assert.ok(Math.abs(last.overall - (singles + doubles) / 2) <= 0.02, 'the history carries the same average');
});
