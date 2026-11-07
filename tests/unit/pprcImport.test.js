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

import { planTriacePlayers } from '../../functions/lib/pprcImport.js';

test('Triace registrations: known players are marked, new full names are created from their UTR, first names wait', () => {
  const master = { nameIndex: { 'dinkar bhardwaj': 'p_dinkar_bhardwaj' }, playerList: { p_dinkar_bhardwaj: { name: 'Dinkar Bhardwaj', clubs: ['koc'] }, p_other: { name: 'Other One', clubs: ['koc'] } } };
  const entries = [
    { teamId: 't1', role: 'ace1', name: 'DINKAR bhardwaj', singlesUtr: 6.5, doublesUtr: null, pprcId: null },
    { teamId: 't1', role: 'ace2', name: 'Other One', singlesUtr: 5, doublesUtr: 5, pprcId: 'p_other' },
    { teamId: 't2', role: 'ace1', name: 'new person here', singlesUtr: 5.5, doublesUtr: 6.5, pprcId: null },
    { teamId: 't2', role: 'captain', name: null, firstName: 'Sam', singlesUtr: 5, doublesUtr: null, pprcId: null },
    { teamId: 't3', role: 'ace1', name: 'NEW  Person Here', singlesUtr: 5.5, doublesUtr: 6.5, pprcId: null },
    { teamId: 't3', role: 'ace2', name: 'Ghost Player', singlesUtr: 5, doublesUtr: null, pprcId: 'p_ghost' }
  ];
  const { writes, summary } = planTriacePlayers(entries, master);
  assert.deepEqual(summary.marked.map(m => m.id), ['p_dinkar_bhardwaj', 'p_other']);
  assert.deepEqual(summary.created.map(c => [c.id, c.name]), [['p_new_person_here', 'New Person Here']], 'the same new person in two teams is created once');
  assert.deepEqual(summary.skipped.map(s => s.reason), ['needs a full name', 'unknown PPRC id p_ghost']);
  assert.equal(writes['pprcMaster/players/p_dinkar_bhardwaj/clubs/triace'], true);
  assert.deepEqual(writes['pprcMaster/playerList/p_dinkar_bhardwaj/clubs'], ['koc', 'triace']);
  assert.deepEqual(writes['pprcMaster/players/p_new_person_here'], { name: 'New Person Here', nameKey: 'new person here', clubs: { triace: true }, seed: { singles: 5.5, doubles: 6.5 }, seedSource: 'triace registration' });
  assert.equal(writes['pprcMaster/nameIndex/new person here'], 'p_new_person_here');
  assert.equal(writes['pprcMaster/ratings/p_new_person_here'].overall, 6);
  assert.deepEqual(writes['pprcMaster/ratings/p_new_person_here'].played, { singles: 0, doubles: 0 });
  assert.deepEqual(writes['pprcMaster/playerList/p_new_person_here'], { name: 'New Person Here', overall: 6, played: 0, clubs: ['triace'] });
});
