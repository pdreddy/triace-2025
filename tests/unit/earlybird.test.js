import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EARLY_BIRD, earlyBirdStatus, validateEarlyBird, nextDay, daysBetween } from '../../src/config/earlyBird.js';
import { applyEarlyBird, initialState, publicState, ValidationError } from '../../functions/lib/tournament.js';

const plan = { enabled: true, opens: '2026-11-06', ends: '2026-11-13', surchargeUsd: 10 };

test('defaults: opens 6 Nov, ends 13 Nov, $10 more from 14 Nov', () => {
  assert.deepEqual(DEFAULT_EARLY_BIRD, plan);
  assert.equal(nextDay('2026-11-13'), '2026-11-14');
  assert.equal(daysBetween('2026-11-05', '2026-11-13'), 8);
});

test('status follows the calendar day, with a countdown', () => {
  const day = d => earlyBirdStatus(plan, d);
  assert.equal(day('2026-11-05').phase, 'upcoming');
  assert.equal(day('2026-11-05').countdown, 'Opens tomorrow');
  assert.equal(day('2026-11-01').countdown, 'Opens in 5 days');
  assert.match(day('2026-11-05').headline, /opens Nov 6/);
  assert.equal(day('2026-11-06').phase, 'open');
  assert.equal(day('2026-11-06').countdown, '8 days left');
  assert.equal(day('2026-11-12').countdown, '2 days left');
  assert.equal(day('2026-11-13').phase, 'open');                       // last early-bird day
  assert.equal(day('2026-11-13').countdown, 'Last day!');
  assert.equal(day('2026-11-14').phase, 'late');                       // from the 14th: $10 more
  assert.match(day('2026-11-10').detail, /From Nov 14, registration costs \$10 more per team/);
  assert.match(day('2026-11-10').short, /\+\$10 per team from Nov 14/);
  assert.match(day('2026-12-01').detail, /\$10 more/);
  assert.deepEqual(day('2026-11-10').steps.map(s => s.text), ['Nov 6', 'Nov 13', 'From Nov 14']);
  assert.equal(day('2026-11-10').step, 0);
  assert.equal(day('2026-11-13').step, 1);
  assert.equal(day('2026-11-20').step, 2);
});

test('turned off, or with no surcharge, nothing misleading is shown', () => {
  assert.equal(earlyBirdStatus({ ...plan, enabled: false }, '2026-11-08').phase, 'off');
  assert.equal(earlyBirdStatus({ ...plan, enabled: false }, '2026-11-08').short, '');
  const free = earlyBirdStatus({ ...plan, surchargeUsd: 0 }, '2026-11-08');
  assert.doesNotMatch(free.detail + free.short, /\$/);
  assert.equal(earlyBirdStatus({ ...plan, surchargeUsd: 0 }, '2026-11-20').detail, 'Standard registration applies.');
});

test('the admin can only save a sensible plan', () => {
  assert.deepEqual(validateEarlyBird({ ...plan, surchargeUsd: 25 }), { ...plan, surchargeUsd: 25 });
  for (const [bad, pattern] of [
    [{ ...plan, opens: '2026-11-14' }, /cannot end before it opens/],
    [{ ...plan, opens: '2026-02-30' }, /real calendar days/],
    [{ ...plan, ends: 'tomorrow' }, /real calendar days/],
    [{ ...plan, surchargeUsd: -1 }, /whole number/],
    [{ ...plan, surchargeUsd: 10.5 }, /whole number/],
    [{ ...plan, surchargeUsd: 1001 }, /whole number/],
    [{ ...plan, surchargeUsd: NaN }, /whole number/],
    [{ ...plan, enabled: 'yes' }, /on or off/],
    [{ ...plan, extra: 1 }, /Invalid early-bird/],
    [{ enabled: true }, /Invalid early-bird/],
    [null, /Send the early-bird/]
  ]) assert.throws(() => validateEarlyBird(bad), pattern, JSON.stringify(bad));
});

test('the saved plan is public and survives in the state', () => {
  const state = applyEarlyBird(initialState(), { ...plan, surchargeUsd: 15 }).state;
  assert.equal(state.earlyBird.surchargeUsd, 15);
  assert.equal(publicState(state).earlyBird.surchargeUsd, 15);
  assert.equal(publicState(initialState()).earlyBird, undefined, 'no saved plan yet: the app uses the default');
  assert.throws(() => applyEarlyBird(initialState(), { ...plan, ends: '2026-01-01' }), /cannot end before/);
  // the server only turns a ValidationError into a clear refusal; anything else would show as "internal"
  for (const bad of [{}, null, { ...plan, surchargeUsd: -5 }, { ...plan, opens: 'x' }]) assert.throws(() => applyEarlyBird(initialState(), bad), error => error instanceof ValidationError, JSON.stringify(bad));
});

test('impossible early-bird dates produce validation errors instead of an internal RangeError', () => {
  for (const day of ['2026-13-01', '2026-00-00', '2026-99-99', '2026-02-30']) {
    assert.throws(() => validateEarlyBird({ ...DEFAULT_EARLY_BIRD, opens: day }), error => error.name === 'ValidationError');
  }
});
