import test from 'node:test';
import assert from 'node:assert/strict';
import { formOf, trendOf, sparkPoints } from '../../functions/lib/pprcProfile.js';

const recent = [{ won: true, overall: 7 }, { won: false, overall: 6.5 }, { won: true, overall: 6.6 }];

test('form is the latest results, newest first', () => assert.deepEqual(formOf(recent, 2), ['W', 'L']));
test('the trend runs oldest to newest', () => assert.deepEqual(trendOf(recent), [6.6, 6.5, 7]));
test('spark points span the box, the highest value at the top, and a flat or short series is safe', () => {
  assert.equal(sparkPoints([1, 2, 3], 100, 20, 0), '0.0,20.0 50.0,10.0 100.0,0.0');
  assert.equal(sparkPoints([5, 5], 100, 20, 0), '0.0,10.0 100.0,10.0');
  assert.equal(sparkPoints([5], 100, 20), '');
});
