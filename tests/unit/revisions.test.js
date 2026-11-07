import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyCalendar, applyEarlyBird, applyLeagueRules, DEFAULT_LEAGUE_RULES } from '../../functions/lib/tournament.js';

const calendar = extra => ({ registrationOpens: '', registrationCloses: '', seasonStart: '', roundDays: 7, buffers: [], playoffGapWeeks: 1, ...extra });
const early = extra => ({ enabled: true, opens: '2026-01-01', ends: '2026-02-01', surchargeUsd: 10, ...extra });

for (const [name, apply, payload, key] of [
  ['calendar', applyCalendar, calendar, 'calendar'],
  ['early bird', applyEarlyBird, early, 'earlyBird'],
  ['league rules', applyLeagueRules, extra => ({ ...DEFAULT_LEAGUE_RULES, ...extra }), 'leagueRules']
]) {
  test(`${name}: each save bumps the revision and a stale save is refused`, () => {
    const first = apply(initialState(), { ...payload(), expectedRevision: 0 });
    assert.equal(first.result.revision, 1);
    assert.equal(first.state[key].revision, 1);
    const second = apply(first.state, { ...payload(), expectedRevision: 1 });
    assert.equal(second.state[key].revision, 2);
    assert.throws(() => apply(second.state, { ...payload(), expectedRevision: 1 }), /changed in another session/, 'a page that still holds revision 1 cannot overwrite revision 2');
  });

  test(`${name}: a request without a revision is still accepted (older pages during a rollout)`, () => {
    const saved = apply(initialState(), payload());
    assert.equal(saved.state[key].revision, 1);
    assert.equal(apply(saved.state, payload()).state[key].revision, 2);
  });
}

test('the revision never leaks into the validated fields', () => {
  assert.throws(() => applyCalendar(initialState(), { ...calendar(), surprise: 1, expectedRevision: 0 }), /Invalid calendar fields/);
});
