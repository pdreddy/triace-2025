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

test('the project rules keep Triace as it was and add public reads of the shared player data, with no writes from clients', () => {
  const rules = JSON.parse(fs.readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8')).rules;
  assert.equal(rules['.write'], false); assert.equal(rules['.read'], false);
  assert.ok(rules.traice2_0 && rules.traice2_0.registrations && rules.traice2_0.tiers, 'the Triace rules are still there');
  assert.equal(rules.pprcMaster['.read'], true); assert.equal(rules.clubs['.read'], true);
  for (const section of [rules.pprcMaster, rules.clubs]) assert.ok(!JSON.stringify(section).includes('.write'), 'no path in the shared data lets a client write');
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

import { runImport, runTriaceImport, ImportRefused } from '../../functions/lib/pprcImport.js';

// A tiny in-memory Realtime Database with the admin shape the importer uses: ref(path).once/set/update/remove.
function fakeDb(initial = {}) {
  const root = structuredClone(initial), parts = p => String(p).split('/').filter(Boolean);
  const get = path => parts(path).reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), root);
  const put = (path, value) => {
    const keys = parts(path), last = keys.pop();
    let node = root;
    for (const key of keys) { if (!node[key] || typeof node[key] !== 'object') { if (value == null) return; node[key] = {}; } node = node[key]; }
    if (value == null) delete node[last]; else node[last] = structuredClone(value);
  };
  const join = (a, b) => [a, b].filter(Boolean).join('/');
  const calls = { updates: [], removes: [] };
  return { root, calls, ref: (path = '') => ({
    once: async () => ({ val: () => structuredClone(get(path) ?? null) }),
    set: async value => put(path, value),
    remove: async () => { calls.removes.push(path); put(path, null); },
    update: async changes => { calls.updates.push(Object.keys(changes).length); for (const [key, value] of Object.entries(changes)) put(join(path, key), value); }
  }) };
}

test('import: writes the tree, leaves everything else alone, and logs what it did', async () => {
  const db = fakeDb({ traice2_0: { tiers: { goat: { teams: { t1: { captainFirstName: 'John' } } } } } });
  const result = await runImport(db, tree, { now: 777, source: 'multiclub.json' });
  assert.deepEqual(db.root.pprcMaster, tree.pprcMaster);
  assert.deepEqual(db.root.clubs, tree.clubs);
  assert.equal(db.root.traice2_0.tiers.goat.teams.t1.captainFirstName, 'John', 'Triace data is untouched');
  assert.deepEqual(Object.keys(db.root).sort(), ['clubs', 'importLog', 'pprcMaster', 'traice2_0']);
  assert.deepEqual(db.root.importLog[777].sections, ['pprcMaster', 'clubs']);
  assert.equal(result.written, Object.keys(planImport(tree).paths).length);
});

test('import: a section that already has data is refused, and nothing is changed', async () => {
  const db = fakeDb({ pprcMaster: { players: { p_old: { name: 'Old' } } } });
  await assert.rejects(() => runImport(db, tree), err => err instanceof ImportRefused && /Already has data: pprcMaster/.test(err.message));
  assert.deepEqual(db.root, { pprcMaster: { players: { p_old: { name: 'Old' } } } }, 'not even the import log was written');
  assert.deepEqual(db.calls.updates, []);
});

test('import --replace: saves a backup first, removes the old section, writes the new one', async () => {
  const db = fakeDb({ pprcMaster: { players: { p_old: { name: 'Old' } } }, traice2_0: { keep: true } });
  let backed = null;
  const result = await runImport(db, tree, { replace: true, saveBackup: existing => { backed = existing; return 'backup.json'; } });
  assert.deepEqual(backed, { pprcMaster: { players: { p_old: { name: 'Old' } } } }, 'only the section being replaced is backed up');
  assert.equal(db.root.pprcMaster.players.p_old, undefined, 'the old record is gone');
  assert.deepEqual(db.root.pprcMaster.players.p_a, { name: 'A' });
  assert.deepEqual(db.calls.removes, ['pprcMaster']);
  assert.equal(db.root.traice2_0.keep, true);
  assert.equal(result.backup, 'backup.json');
});

test('import: a big tree is written in batches of at most 200 paths', async () => {
  const big = { pprcMaster: { players: Object.fromEntries(Array.from({ length: 450 }, (_, i) => [`p_${i}`, { name: `P${i}` }])) } };
  const db = fakeDb(), seen = [];
  await runImport(db, big, { progress: (done, total) => seen.push([done, total]) });
  assert.deepEqual(db.calls.updates.slice(0, 3), [200, 200, 50]);
  assert.deepEqual(seen.at(-1), [450, 450]);
  assert.equal(Object.keys(db.root.pprcMaster.players).length, 450);
});

test('Triace registrations import: marks known players, creates new ones, logs', async () => {
  const db = fakeDb({ pprcMaster: { nameIndex: { 'dinkar bhardwaj': 'p_dinkar_bhardwaj' }, playerList: { p_dinkar_bhardwaj: { name: 'Dinkar Bhardwaj', clubs: ['koc'] } }, players: { p_dinkar_bhardwaj: { name: 'Dinkar Bhardwaj', clubs: { koc: true } } } } });
  const { summary } = await runTriaceImport(db, [
    { teamId: 't', role: 'ace1', name: 'Dinkar Bhardwaj', singlesUtr: 6, doublesUtr: null, pprcId: null },
    { teamId: 't', role: 'ace2', name: 'Brand New', singlesUtr: 5, doublesUtr: 5.5, pprcId: null }
  ], { now: 5 });
  assert.equal(summary.created.length, 1);
  assert.deepEqual(db.root.pprcMaster.playerList.p_dinkar_bhardwaj.clubs, ['koc', 'triace']);
  assert.equal(db.root.pprcMaster.players.p_dinkar_bhardwaj.clubs.triace, true);
  assert.equal(db.root.pprcMaster.nameIndex['brand new'], 'p_brand_new');
  assert.equal(db.root.pprcMaster.ratings.p_brand_new.overall, 5.25);
  assert.equal(db.root.importLog[5].created, 1);
});

test('the database helper asks for the key file instead of failing obscurely', async () => {
  const saved = process.env.GOOGLE_APPLICATION_CREDENTIALS; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  try {
    const { openDatabase } = await import('../../scripts/lib/rtdb.mjs');
    await assert.rejects(() => openDatabase('https://example-default-rtdb.firebaseio.com'), /GOOGLE_APPLICATION_CREDENTIALS/);
  } finally { if (saved) process.env.GOOGLE_APPLICATION_CREDENTIALS = saved; }
});

test('a database that never answers fails with a clear message instead of hanging', async () => {
  const { withTimeout } = await import('../../scripts/lib/rtdb.mjs');
  await assert.rejects(() => withTimeout(new Promise(() => {}), 20, 'Could not reach the database.'), /Could not reach/);
  assert.equal(await withTimeout(Promise.resolve(5), 1000, 'x'), 5);
  await assert.rejects(() => withTimeout(Promise.reject(new Error('permission denied')), 1000, 'x'), /permission denied/);
});
