import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUtrFile, planUtrUpload, validateUtrUpdates } from '../../functions/lib/pprcSync.js';

test('parses CSV with a name column', () => {
  const r = parseUtrFile('name,singles,doubles\nAsha Rao,6.5,6.8\n', 'a.csv');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].name, 'Asha Rao');
});

test('parses JSON', () => {
  const r = parseUtrFile(JSON.stringify([{ name: 'Asha Rao', singles: 6.5, doubles: 7 }]), 'a.json');
  assert.equal(r.rows.length, 1);
  assert.equal(r.errors.length, 0);
});

test('plans a new player and flags first-name-only', () => {
  const { rows } = parseUtrFile('name,singles,doubles\nAsha Rao,6.5,6.8\nMadhu,5,5\n', 'a.csv');
  const plan = planUtrUpload(rows, []);
  assert.equal(plan.counts.new, 1);
  assert.equal(plan.updates.length, 1);
});

test('rejects out-of-range UTRs', () => {
  assert.throws(() => validateUtrUpdates([{ id: 'p_asha_rao', name: 'Asha Rao', singles: 20, doubles: 5 }]));
});
