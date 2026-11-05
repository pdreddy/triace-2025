import test from 'node:test';
import assert from 'node:assert/strict';
import { earlyBirdStatus, nextDay, EARLY_BIRD } from '../../src/config/earlyBird.js';

const plan = { opens: '2026-11-06', ends: '2026-11-13', surchargeUsd: 10 };

test('early bird defaults: opens tomorrow (6 Nov), ends 13 Nov, $10 more from 14 Nov', () => {
  assert.deepEqual(EARLY_BIRD, plan);
  assert.equal(nextDay('2026-11-13'), '2026-11-14');
});

test('status follows the calendar day', () => {
  assert.equal(earlyBirdStatus(plan, '2026-11-05').phase, 'upcoming');
  assert.match(earlyBirdStatus(plan, '2026-11-05').headline, /opens Nov 6/);
  assert.equal(earlyBirdStatus(plan, '2026-11-06').phase, 'open');
  assert.equal(earlyBirdStatus(plan, '2026-11-13').phase, 'open');   // last early-bird day
  assert.equal(earlyBirdStatus(plan, '2026-11-14').phase, 'late');   // from the 14th: $10 more
  assert.match(earlyBirdStatus(plan, '2026-11-10').detail, /From Nov 14, registration costs \$10 more/);
  assert.match(earlyBirdStatus(plan, '2026-12-01').detail, /\$10 more/);
});
