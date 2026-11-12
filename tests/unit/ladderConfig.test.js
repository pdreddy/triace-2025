import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, RULE_GROUPS, validateRules, diffRules, describeRules, challengeRange, inChallengeRange } from '../../functions/lib/singlesLadder/config.js';
import { nextDeadline, zonedTime, localDate } from '../../functions/lib/singlesLadder/time.js';
import { custom } from './ladderHarness.js';

test('the initial defaults match the agreed starting rules and are valid', () => {
  const v = DEFAULT_RULES;
  assert.deepEqual([v.challenge.maxUp, v.challenge.activeLimit, v.top.threshold, v.top.maxDown, v.streak.wins, v.rematch.days, v.response.hours], [3, 1, 3, 3, 2, 14, 48]);
  assert.deepEqual([v.deadline.day, v.deadline.time, v.deadline.timezone], [0, '23:59', 'America/Chicago']);
  assert.deepEqual([v.points.win, v.points.loss, v.points.challengeBonus, v.points.defenseBonus, v.points.upsetBonus, v.points.upsetMinGap, v.points.upsetMaxGap, v.points.walkoverWin, v.noShow.points], [3, 1, 1, 1, 1, 2, 3, 3, 0]);
  assert.deepEqual([v.decline.free, v.decline.penaltyPoints, v.decline.dropThreshold, v.decline.dropPositions, v.inactivity.days, v.inactivity.dropPositions, v.noShow.graceMinutes], [1, 2, 2, 3, 14, 3, 15]);
  assert.equal(v.late.allowBonuses, false); assert.equal(v.late.allowSwap, false); assert.equal(v.extension.allowSwap, true);
  assert.equal(validateRules(structuredClone(DEFAULT_RULES)).ok, true);
});
test('security controls are not part of the configurable rules', () => {
  const keys = RULE_GROUPS.flatMap(g => [g.id, ...Object.keys(g.fields)]).join(' ').toLowerCase();
  for (const word of ['auth', 'audit', 'admin', 'owner', 'permission']) assert.ok(!keys.includes(word), word);
});
test('a custom configuration is accepted and the defaults are not mutated', () => {
  const result = validateRules(custom({ challenge: { maxUp: 5, activeLimit: 2 }, streak: { maxUp: 8 }, points: { win: 5, walkoverWin: 2 }, deadline: { day: 3, time: '18:30', timezone: 'America/New_York' } }));
  assert.equal(result.ok, true);
  assert.equal(result.values.challenge.maxUp, 5);
  assert.equal(DEFAULT_RULES.challenge.maxUp, 3);
  assert.throws(() => { DEFAULT_RULES.challenge.maxUp = 9; });
});
test('wrong types, out-of-range values, unknown and missing fields are rejected', () => {
  const bad = (changes, key) => { const r = validateRules(custom(changes)); assert.equal(r.ok, false); assert.ok(r.errors[key], `${key}: ${JSON.stringify(r.errors)}`); };
  bad({ challenge: { maxUp: 0 } }, 'challenge.maxUp');
  bad({ challenge: { maxUp: 2.5 } }, 'challenge.maxUp');
  bad({ challenge: { activeLimit: '1' } }, 'challenge.activeLimit');
  bad({ top: { enabled: 'yes' } }, 'top.enabled');
  bad({ response: { onExpire: 'explode' } }, 'response.onExpire');
  bad({ deadline: { day: '0' } }, 'deadline.day');
  bad({ deadline: { time: '24:00' } }, 'deadline.time');
  bad({ deadline: { timezone: 'Mars/Olympus' } }, 'deadline.timezone');
  bad({ points: { secretBonus: 9 } }, 'points.secretBonus');
  const missing = structuredClone(DEFAULT_RULES); delete missing.noShow;
  assert.ok(validateRules(missing).errors.noShow);
  assert.ok(validateRules({ ...structuredClone(DEFAULT_RULES), requireAuth: { enabled: false } }).errors.requireAuth);
  assert.equal(validateRules(null).ok, false);
});
test('contradictory combinations are rejected', () => {
  const bad = (changes, key) => { const r = validateRules(custom(changes)); assert.equal(r.ok, false, key); assert.ok(r.errors[key], `${key}: ${JSON.stringify(r.errors)}`); };
  bad({ streak: { maxUp: 3 } }, 'streak.maxUp');                              // unlocks nothing beyond the normal 3
  bad({ points: { win: 1, loss: 2 } }, 'points.win');
  bad({ points: { upsetMinGap: 4, upsetMaxGap: 3 } }, 'points.upsetMaxGap');
  bad({ points: { walkoverWin: 0 }, noShow: { points: 1 } }, 'noShow.points');
  bad({ decline: { free: 2, dropThreshold: 2 } }, 'decline.dropThreshold');   // a free decline cannot trigger a drop
  bad({ inactivity: { days: 2 }, response: { hours: 48 } }, 'inactivity.days');
  bad({ swap: { enabled: false }, late: { allowSwap: true }, extension: { allowSwap: false } }, 'late.allowSwap');
  bad({ response: { onExpire: 'decline', hours: 12 } }, 'response.hours');
  assert.equal(validateRules(custom({ streak: { enabled: false, maxUp: 3 } })).ok, true);   // irrelevant while the rule is off
  assert.equal(validateRules(custom({ decline: { free: 2, dropThreshold: 0 } })).ok, true);
});
test('challenge range: normal, top players downward, streak unlock, custom', () => {
  const v = DEFAULT_RULES;
  assert.deepEqual(challengeRange(v, 8, 0, 16), { min: 5, max: 8 });
  assert.deepEqual(challengeRange(v, 2, 0, 16), { min: 1, max: 5 });           // top three: three below as well
  assert.deepEqual(challengeRange(v, 4, 0, 16), { min: 1, max: 4 });           // rank 4 is not a top player
  assert.deepEqual(challengeRange(v, 12, 2, 16), { min: 1, max: 12 });         // two wins: any higher position
  assert.equal(inChallengeRange(v, 8, 4, 0, 16), false);
  assert.equal(inChallengeRange(v, 8, 4, 2, 16), true);
  assert.equal(inChallengeRange(v, 8, 8, 0, 16), false);
  assert.equal(inChallengeRange(v, 15, 17, 0, 16), false);
  const c = custom({ challenge: { maxUp: 2 }, top: { threshold: 1, maxDown: 5 }, streak: { wins: 3, maxUp: 6 } });
  assert.deepEqual(challengeRange(c, 10, 2, 16), { min: 8, max: 10 });
  assert.deepEqual(challengeRange(c, 10, 3, 16), { min: 4, max: 10 });
  assert.deepEqual(challengeRange(c, 1, 0, 16), { min: 1, max: 6 });
  assert.deepEqual(challengeRange(custom({ top: { enabled: false } }), 1, 0, 16), { min: 1, max: 1 });
});
test('the Rules page text and the change preview come from the configuration', () => {
  const words = values => describeRules(values).flatMap(s => s.lines).join(' ');
  assert.match(words(DEFAULT_RULES), /up to 3 positions above/);
  assert.match(words(DEFAULT_RULES), /Sunday at 11:59 PM \(America\/Chicago\)/);
  assert.match(words(DEFAULT_RULES), /first valid decline is free; each later one deducts 2 points/);
  const changed = custom({ challenge: { maxUp: 5 }, deadline: { day: 5, time: '20:00' }, decline: { enabled: false } });
  assert.match(words(changed), /up to 5 positions above/);
  assert.match(words(changed), /Friday at 8:00 PM/);
  assert.match(words(changed), /no penalty this season/);
  assert.deepEqual(diffRules(DEFAULT_RULES, changed).map(d => d.key), ['challenge.maxUp', 'deadline.day', 'deadline.time', 'decline.enabled']);
  assert.deepEqual(diffRules(DEFAULT_RULES, changed)[1], { key: 'deadline.day', group: 'Match deadline', label: 'Deadline day', before: 0, after: 5, beforeText: 'Sunday', afterText: 'Friday' });
});

const chicago = { day: 0, time: '23:59', timezone: 'America/Chicago', minDays: 0 };
const iso = ts => new Date(ts).toISOString();
test('deadline is the end of the configured local minute, to the millisecond', () => {
  const due = nextDeadline(Date.parse('2026-11-12T18:00:00Z'), chicago);      // Thursday, CST (UTC-6)
  assert.equal(iso(due), '2026-11-16T05:59:59.999Z');
  assert.equal(nextDeadline(due, chicago), due);                              // the last millisecond is still this week
  assert.equal(iso(nextDeadline(due + 1, chicago)), '2026-11-23T05:59:59.999Z');
});
test('deadlines follow daylight-saving changes in the season timezone', () => {
  assert.equal(iso(nextDeadline(Date.parse('2026-03-05T18:00:00Z'), chicago)), '2026-03-09T04:59:59.999Z');   // spring forward on the deadline day: CDT
  assert.equal(iso(nextDeadline(Date.parse('2026-03-02T18:00:00Z'), { ...chicago, day: 6 })), '2026-03-08T05:59:59.999Z'); // the Saturday before: still CST
  assert.equal(iso(nextDeadline(Date.parse('2026-10-29T18:00:00Z'), chicago)), '2026-11-02T05:59:59.999Z');   // fall back on the deadline day: CST
  // 02:30 does not exist on 8 March 2026 in Chicago: the first real minute after it is used.
  assert.equal(iso(zonedTime(2026, 3, 8, 2, 30, 'America/Chicago')), '2026-03-08T08:00:00.000Z');
  // 01:30 happens twice on 1 November 2026: the later one, so a deadline is never cut short.
  assert.equal(iso(zonedTime(2026, 11, 1, 1, 30, 'America/Chicago')), '2026-11-01T07:30:00.000Z');
  assert.equal(localDate(Date.parse('2026-11-16T05:59:59.999Z'), 'America/Chicago').weekday, 0);
});
test('custom deadline day, time, timezone and minimum days to play', () => {
  const friday = { day: 5, time: '20:00', timezone: 'America/New_York', minDays: 0 };
  assert.equal(iso(nextDeadline(Date.parse('2026-11-12T18:00:00Z'), friday)), '2026-11-14T01:00:59.999Z');
  // Accepted on Saturday with at least 3 days to play: the following Sunday.
  const saturday = Date.parse('2026-11-14T18:00:00Z');
  assert.equal(iso(nextDeadline(saturday, chicago)), '2026-11-16T05:59:59.999Z');
  assert.equal(iso(nextDeadline(saturday, { ...chicago, minDays: 3 })), '2026-11-23T05:59:59.999Z');
});
