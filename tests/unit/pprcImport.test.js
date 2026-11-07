import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { flatten, batches, planImport, clean } from '../../functions/lib/pprcImport.js';

const tree = { pprcMaster: { players: { p_a: { name: 'A' }, p_b: { name: 'B' } }, ratingHistory: { p_a: { 2026: { m1: { x: 1 }, m2: { x: 2 } } } } }, clubs: { koc: { seasons: { s3: { matches: { m1: { id: 'm1' } }, teams: { t1: { name: 'T' } } } } } } };

test('the tree is flattened to paths of bounded depth', () => {
  const paths = flatten({ pprcMaster: tree.pprcMaster }, 3);
  assert.deepEqual(Object.keys(paths).sort(), ['pprcMaster/players/p_a', 'pprcMaster/players/p_b', 'pprcMaster/ratingHistory/p_a']);
  assert.deepEqual(paths['pprcMaster/ratingHistory/p_a'], { 2026: { m1: { x: 1 }, m2: { x: 2 } } });
  assert.deepEqual(flatten({ a: {} }, 3), { a: {} }, 'an empty object is kept as is');
});

test('writes are split into batches without losing a path', () => {
  const paths = Object.fromEntries(Array.from({ length: 450 }, (_, i) => [`p/${i}`, i]));
  const parts = batches(paths, 200);
  assert.deepEqual(parts.map(b => Object.keys(b).length), [200, 200, 50]);
  assert.equal(Object.assign({}, ...parts)['p/449'], 449);
});

test('the plan lists sections, sizes and problems, and can be limited to some sections', () => {
  const plan = planImport(tree);
  assert.deepEqual(plan.sections, ['pprcMaster', 'clubs']);
  assert.ok(plan.paths['clubs/koc/seasons/s3/matches/m1'], 'clubs go down to the individual match');
  assert.equal(plan.stats.pprcMaster.paths, 3); assert.deepEqual(plan.problems, []);
  assert.deepEqual(planImport(tree, { only: ['clubs'] }).sections, ['clubs']);
  assert.equal(planImport({ pprcMaster: { players: { 'bad.key': 1 } } }).problems.length, 1);
});

test('values Firebase cannot store are removed before sending', () => {
  assert.deepEqual(clean({ a: undefined, b: NaN, c: [1, undefined], d: { e: undefined, f: 2 } }), { b: null, c: [1, null], d: { f: 2 } });
});

test('the multi-club rules allow public reads of the player data and no writes from clients', () => {
  const rules = JSON.parse(fs.readFileSync(new URL('../../database.multiclub.rules.json', import.meta.url), 'utf8')).rules;
  assert.equal(rules['.write'], false); assert.equal(rules['.read'], false);
  assert.equal(rules.pprcMaster['.read'], true); assert.equal(rules.clubs['.read'], true);
  const writes = JSON.stringify(rules).match(/"\.write":\s*[^,}]+/g);
  assert.ok(writes.every(w => /false/.test(w)), 'no path lets a client write');
  assert.equal(rules.importLog, undefined, 'the import log is not readable');
});
