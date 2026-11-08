import test from 'node:test';
import assert from 'node:assert/strict';
import { makeResolver } from '../../src/data/nameResolver.js';

const list = [
  { id: 'p_hari_mothukuri', name: 'Hari Mothukuri' },
  { id: 'p_sridhar_kuppuswamy', name: 'Sridhar Kuppuswamy' },
  { id: 'p_prashanth_gourineni', name: 'Prashanth Gourineni' },
  { id: 'p_krishna_a', name: 'Krishna Anand' },
  { id: 'p_krishna_b', name: 'Krishna Bhat' },
];

test('Season 1 names use the migration decisions, so a short name becomes the PPRC spelling and links', () => {
  const resolve = makeResolver(list);
  assert.deepEqual(resolve('Hari', 'a5'), { name: 'Hari Mothukuri', id: 'p_hari_mothukuri' });
  assert.deepEqual(resolve('Sri', 'b7'), { name: 'Sridhar Kuppuswamy', id: 'p_sridhar_kuppuswamy' });
});

test('a unique partial name matches the list; an ambiguous or unknown name stays as written', () => {
  const resolve = makeResolver(list);
  assert.equal(resolve('Prashant', 'zz').id, 'p_prashanth_gourineni', 'a shortened spelling that fits one player');
  assert.equal(resolve('Prashanth', 'zz').id, 'p_prashanth_gourineni');
  assert.deepEqual(resolve('Krishna', 'zz'), { name: 'Krishna', id: null });
  assert.deepEqual(resolve('Somebody New', 'a1'), { name: 'Somebody New', id: null });
});

test('before the PPRC list loads, decided names still read in the full spelling without a link', () => {
  assert.deepEqual(makeResolver()('Hari', 'a5'), { name: 'Hari Mothukuri', id: null });
});

test('spelling variants of one person resolve to one player', () => {
  const resolve = makeResolver([{ id: 'p_damodhara_reddy_palavali', name: 'Damodhara Reddy Palavali' }, { id: 'p_sridhar_kuppuswamy', name: 'Sridhar Kuppuswamy' }, { id: 'p_rajasekhar_chintha', name: 'Rajasekhar Chintha' }]);
  for (const raw of ['Damu', 'Palvali', 'Damdodhara Plavali', 'damu palavali', 'Damodhara Palavali']) assert.equal(resolve(raw, 'a4').id, 'p_damodhara_reddy_palavali', raw);
  for (const raw of ['Sridhar', 'Sridhar.', 'SRIDHAR']) assert.equal(resolve(raw, 'b7').id, 'p_sridhar_kuppuswamy', raw);
  for (const raw of ['RajC', 'Raj C', 'raj chinta']) assert.equal(resolve(raw, 'a4').id, 'p_rajasekhar_chintha', raw);
});

test('a verified player (more than 5 rated courts) carries the PPRC rating, others do not', () => {
  const resolve = makeResolver([{ id: 'p_hari_mothukuri', name: 'Hari Mothukuri', overall: 6.11, singles: 5.9, doubles: 6.3, played: 29 }, { id: 'p_prashanth_gourineni', name: 'Prashanth Gourineni', overall: 5.5, played: 4 }]);
  assert.deepEqual(resolve('Hari', 'a5'), { name: 'Hari Mothukuri', id: 'p_hari_mothukuri', rating: 6.11, singles: 5.9, doubles: 6.3, verified: true });
  assert.deepEqual(resolve('Prashanth', 'zz'), { name: 'Prashanth Gourineni', id: 'p_prashanth_gourineni' });
});
