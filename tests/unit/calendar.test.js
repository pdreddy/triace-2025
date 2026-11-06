import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCalendar, parseBuffers, roundStart, registrationWindow, DEFAULT_CALENDAR } from '../../functions/lib/calendar.js';
import { adminEmail, loginIdentifier, validateAdminUsername, newAdminPassword, checkRemoval, adminUsername } from '../../functions/lib/admins.js';
import { initialState, applyCalendar, applyRegistration, ValidationError, DEFAULT_SETTINGS, DEFAULT_TIERS, publicState } from '../../functions/lib/tournament.js';
import { applyAutoSchedule, applyAddBuffer, applySetSchedule } from '../../functions/lib/league.js';

const seeded = () => {
  const s = initialState(); s.settings = { ...DEFAULT_SETTINGS }; s.tierConfig = structuredClone(DEFAULT_TIERS);
  const ids = Object.keys(s.tierConfig), tier = ids[0];
  s.tiers = { [tier]: { teams: Object.fromEntries(['a', 'b', 'c', 'd'].map((id, i) => [id, { teamId: id, registeredAt: i }])) } };
  return { s, tier };
};

test('buffers: text becomes sorted, merged entries; bad text is refused', () => {
  assert.deepEqual(parseBuffers('3:1, 6:2'), [{ afterRound: 3, weeks: 1 }, { afterRound: 6, weeks: 2 }]);
  assert.deepEqual(validateCalendar({ buffers: '6:2, 3:1, 3:1' }).buffers, [{ afterRound: 3, weeks: 2 }, { afterRound: 6, weeks: 2 }]);
  for (const bad of ['x', '3', '0:1', '3:0', '3:13']) assert.throws(() => validateCalendar({ buffers: bad }), /buffer|round/i, bad);
});

test('round dates skip buffer weeks', () => {
  const buffers = [{ afterRound: 2, weeks: 1 }];
  assert.deepEqual([1, 2, 3, 4].map(r => roundStart('2026-11-23', 7, buffers, r)), ['2026-11-23', '2026-11-30', '2026-12-14', '2026-12-21']);
});

test('the calendar validates dates and order', () => {
  assert.equal(validateCalendar({}).roundDays, 7);
  assert.throws(() => validateCalendar({ registrationOpens: '2026-13-40' }), /date/);
  assert.throws(() => validateCalendar({ registrationOpens: '2026-11-10', registrationCloses: '2026-11-01' }), /before it opens/);
  assert.throws(() => validateCalendar({ registrationCloses: '2026-11-20', seasonStart: '2026-11-20' }), /after registration closes/);
  assert.throws(() => validateCalendar({ roundDays: 0 }), /1–60/);
  assert.throws(() => validateCalendar({ nope: 1 }), /fields/);
});

test('registration follows the window and the manual switch', () => {
  const at = day => Date.parse(`${day}T12:00:00Z`);
  const cal = { ...DEFAULT_CALENDAR, registrationOpens: '2026-11-06', registrationCloses: '2026-11-20' };
  assert.equal(registrationWindow({ registrationEnabled: true }, cal, at('2026-11-04')).open, false);
  assert.equal(registrationWindow({ registrationEnabled: true }, cal, at('2026-11-06')).open, true);
  assert.equal(registrationWindow({ registrationEnabled: true }, cal, at('2026-11-20')).open, true);
  assert.equal(registrationWindow({ registrationEnabled: true }, cal, at('2026-11-22')).open, false);
  assert.equal(registrationWindow({ registrationEnabled: false }, {}, at('2026-11-10')).open, false);
  assert.equal(registrationWindow({ registrationEnabled: true }, {}, at('2030-01-01')).open, true, 'no dates: always open');
  const { s } = seeded(); s.calendar = cal;
  assert.throws(() => applyRegistration(s, {}, 'u', at('2026-12-01')), /closed on 2026-11-20/);
});

test('applyCalendar saves and refuses with real ValidationErrors; it is public', () => {
  const { s } = seeded();
  const { state } = applyCalendar(s, { seasonStart: '2026-11-23', roundDays: 7, buffers: '3:1' });
  assert.equal(publicState(state).calendar.buffers[0].weeks, 1);
  for (const bad of [{}, null, { roundDays: 99 }, { seasonStart: 'x' }]) { if (bad && Object.keys(bad).length === 0) continue; assert.throws(() => applyCalendar(s, bad), e => e instanceof ValidationError, JSON.stringify(bad)); }
});

test('auto-schedule creates fixtures, dates rounds with buffers, keeps results, and add-buffer shifts later rounds', () => {
  const { s, tier } = seeded();
  assert.throws(() => applyAutoSchedule(s), /season start/);
  s.calendar = { ...DEFAULT_CALENDAR, seasonStart: '2026-11-23', buffers: [{ afterRound: 1, weeks: 1 }], playoffGapWeeks: 1 };
  const { state, result } = applyAutoSchedule(s);
  assert.equal(result.tiers.find(t => t.tierId === tier).created, true);
  const f = Object.values(state.fixtures[tier]);
  assert.equal(f.length, 6);                                           // 4 teams: 3 rounds × 2
  assert.equal(f.find(x => x.round === 1).startsOn, '2026-11-23');
  assert.equal(f.find(x => x.round === 2).startsOn, '2026-12-07');   // one buffer week after round 1
  assert.equal(state.schedules[tier].playoffsStart, '2026-12-28');   // r3 starts Dec 14, ends 20; +1 week gap
  const again = applyAutoSchedule(state);
  assert.equal(again.result.tiers.find(t => t.tierId === tier).created, false, 'running it twice keeps the fixtures');
  const buf = applyAddBuffer(state, { afterRound: 2, weeks: 2 });
  assert.equal(Object.values(buf.state.fixtures[tier]).find(x => x.round === 3).startsOn, '2026-12-28');
  assert.deepEqual(buf.state.calendar.buffers.map(b => b.afterRound), [1, 2]);
  const played = structuredClone(state); Object.values(played.fixtures[tier])[0].status = 'final';
  played.tiers[tier].teams.e = { teamId: 'e', registeredAt: 9 };
  assert.match(applyAutoSchedule(played).result.tiers.find(t => t.tierId === tier).skipped, /has results/i);
  assert.throws(() => applyAddBuffer(state, { afterRound: 0, weeks: 1 }), e => e instanceof ValidationError);
  assert.equal(applySetSchedule(state, { tierId: tier, start: '2026-11-30', intervalDays: 7, buffers: '1:1' }).result.schedule.buffers[0].weeks, 1);
});

test('admin accounts: names, sign-in identifier, passwords and removal rules', () => {
  assert.equal(validateAdminUsername(' Sam.K '), 'sam.k');
  for (const bad of ['', 'ab', '1abc', 'a b c', 'x'.repeat(25), 'sam@x.com']) assert.throws(() => validateAdminUsername(bad), /sign-in name/, bad);
  assert.equal(adminEmail('Sam'), 'sam@traice.local');
  assert.equal(adminUsername('sam@traice.local'), 'sam');
  assert.equal(loginIdentifier('sam'), 'sam@traice.local');
  assert.equal(loginIdentifier(' other@example.com '), 'other@example.com');
  const pw = newAdminPassword(); assert.match(pw, /^[a-z2-9]{12}$/); assert.notEqual(pw, newAdminPassword());
  const admins = [{ uid: 'a' }, { uid: 'b' }];
  assert.throws(() => checkRemoval(admins, 'a', 'a'), /own admin access/);
  assert.throws(() => checkRemoval([{ uid: 'a' }], 'a', 'z'), /at least one/);
  assert.throws(() => checkRemoval(admins, 'q', 'a'), /not an administrator/);
  assert.doesNotThrow(() => checkRemoval(admins, 'b', 'a'));
});

test('the text backup lists every team with phones, grouped by tier', async () => {
  const { registrationsText } = await import('../../functions/lib/backupText.js');
  const txt = registrationsText({ t1: { teamId: 't1', registeredAt: 1, assignedTier: 'x', captain: { firstName: 'Arjun', lastName: 'Rana', utr: 600 }, whatsappPhone: '+15550000001', ace1: { fullName: 'Ace One', utr: 600 }, ace1Phone: '+15550000002', ace2: { fullName: 'Ace Two', utr: 600 }, ace2Phone: '+15550000003', combinedUtr: 1800, captainUsername: 'arjuace' } }, { x: { name: 'GOAT Tier' } }, { when: new Date('2026-11-06T00:00:00Z') });
  for (const part of ['1 team', '== GOAT Tier (1) ==', 'Arjun Rana', '+15550000001', '+15550000003', 'Login username: arjuace', 'Team ID: t1']) assert.ok(txt.includes(part), part);
  assert.ok(registrationsText({}).includes('0 teams'));
});

test('after the tier is full, further teams join a waitlist, are told their place, and move up when a place opens', async () => {
  const { applyWithdrawTeam } = await import('../../functions/lib/league.js');
  const { applyLeagueRules, DEFAULT_LEAGUE_RULES } = await import('../../functions/lib/tournament.js');
  let state = initialState();
  const payload = (n, utr = 600) => ({ teamId: `waitlist-team-${String(n).padStart(4, '0')}`, whatsappPhone: '+15550000001', ace1Phone: '+15550000002', ace2Phone: '+15550000003',
    captain: { firstName: `Cap${'abcdefghijklmnop'[n]}`, lastName: 'Lee', singlesUtr: utr, doublesUtr: null }, ace1: { fullName: `Ace One ${n}`, singlesUtr: utr, doublesUtr: null }, ace2: { fullName: `Ace Two ${n}`, singlesUtr: utr, doublesUtr: null },
    selectedTier: 'higher', consent: true, rulesAccepted: true });
  assert.equal(DEFAULT_LEAGUE_RULES.tierCapacity, 9);
  const results = [];
  for (let n = 0; n < 11; n++) { const r = applyRegistration(state, payload(n), `u${n}`, 1000 + n); state = r.state; results.push(r.result); }
  const tier = results[0].assignedTier;
  assert.equal(Object.keys(state.tiers[tier].teams).length, 9);
  assert.ok(results.slice(0, 9).every(r => r.waitlisted.length === 0));
  assert.deepEqual(results[9].waitlisted, [{ tierId: tier, position: 1 }]);
  assert.deepEqual(results[10].waitlisted, [{ tierId: tier, position: 2 }]);
  assert.equal(Object.keys(state.tiers[tier].waitlist).length, 2);
  assert.deepEqual(applyRegistration(state, payload(9), 'u9', 5000).result.waitlisted, [{ tierId: tier, position: 1 }], 'a repeat reports the same place');
  const out = applyWithdrawTeam(state, { teamId: payload(2).teamId }, 'x', true);
  assert.deepEqual(out.result.promoted.map(p => p.teamId), [payload(9).teamId]);
  assert.equal(Object.keys(out.state.tiers[tier].teams).length, 9);
  assert.deepEqual(Object.keys(out.state.tiers[tier].waitlist), [payload(10).teamId]);
  const raised = applyLeagueRules(out.state, { ...DEFAULT_LEAGUE_RULES, tierCapacity: 12 });
  assert.equal(raised.result.promoted.length, 1);
  assert.equal(raised.state.tiers[tier].waitlist, undefined);
  assert.throws(() => applyLeagueRules(state, { ...DEFAULT_LEAGUE_RULES, tierCapacity: 99 }), /0–64/);
  assert.equal(Object.keys(applyLeagueRules(state, { ...DEFAULT_LEAGUE_RULES, tierCapacity: 0 }).state.tiers[tier].teams).length, 11, 'no limit seats everyone');
});
