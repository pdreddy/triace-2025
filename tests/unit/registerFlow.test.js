import test from 'node:test';
import assert from 'node:assert/strict';
import { runRegistration } from '../../functions/lib/registerFlow.js';
import { initialState, applyRegistration, MAX_TEAMS_PER_BROWSER } from '../../functions/lib/tournament.js';

const base = { teamId: 'team_abcdefghijklmnop', firstName: 'Arjun' };
const fakes = (over = {}) => {
  const calls = { created: [], deleted: [], logged: [] };
  return { calls, deps: {
    createAccount: async (uid, name) => { calls.created.push([uid, name]); return { username: 'arjun-k7q2', password: 'k7q2m9xp' }; },
    deleteAccount: async uid => { calls.deleted.push(uid); },
    register: async login => ({ teamId: base.teamId, created: true, seenLogin: login }),
    log: error => calls.logged.push(error.code),
    ...over
  } };
};

test('normal registration returns the login once', async () => {
  const { deps, calls } = fakes();
  const result = await runRegistration({ ...base, ...deps });
  assert.deepEqual(result.login, { username: 'arjun-k7q2', password: 'k7q2m9xp' });
  assert.deepEqual(result.seenLogin, { uid: 'cap_team_abcdefghijklmnop', username: 'arjun-k7q2' });
  assert.equal(result.loginPending, undefined);
  assert.deepEqual(calls.deleted, []);
});

test('if the login cannot be created the team is still registered, marked loginPending', async () => {
  const { deps, calls } = fakes({ createAccount: async () => { throw Object.assign(new Error('provider disabled'), { code: 'auth/operation-not-allowed' }); } });
  const result = await runRegistration({ ...base, ...deps });
  assert.equal(result.created, true, 'the registration is not lost');
  assert.equal(result.loginPending, true);
  assert.equal(result.login, undefined);
  assert.equal(result.seenLogin, null, 'registered without a login');
  assert.deepEqual(calls.logged, ['auth/operation-not-allowed'], 'the problem is logged for the admin');
});

test('an unexpected error type from the account service also keeps the registration', async () => {
  const { deps } = fakes({ createAccount: async () => { throw new Error('network'); } });
  const result = await runRegistration({ ...base, ...deps });
  assert.equal(result.loginPending, true);
});

test('a repeated request (the login already exists) creates nothing new and returns no login', async () => {
  const { deps, calls } = fakes({
    createAccount: async () => { throw Object.assign(new Error('exists'), { code: 'auth/uid-already-exists' }); },
    register: async login => ({ teamId: base.teamId, seenLogin: login })      // already registered: no "created"
  });
  const result = await runRegistration({ ...base, ...deps });
  assert.equal(result.login, undefined);
  assert.equal(result.loginPending, undefined);
  assert.deepEqual(calls.deleted, [], 'the existing login is left alone');
});

test('a refused registration deletes the login it just created, and the error still reaches the caller', async () => {
  const { deps, calls } = fakes({ register: async () => { throw new Error('Registration is currently closed.'); } });
  await assert.rejects(() => runRegistration({ ...base, ...deps }), /currently closed/);
  assert.deepEqual(calls.deleted, ['cap_team_abcdefghijklmnop']);
});

test('a refused registration with no login created deletes nothing', async () => {
  const { deps, calls } = fakes({
    createAccount: async () => { throw new Error('down'); },
    register: async () => { throw new Error('Registration is currently closed.'); }
  });
  await assert.rejects(() => runRegistration({ ...base, ...deps }), /currently closed/);
  assert.deepEqual(calls.deleted, []);
});

test('a repeat that finds the team already registered removes the login created for it', async () => {
  const { deps, calls } = fakes({ register: async () => ({ teamId: base.teamId }) });   // created flag missing: already registered
  const result = await runRegistration({ ...base, ...deps });
  assert.equal(result.login, undefined);
  assert.deepEqual(calls.deleted, ['cap_team_abcdefghijklmnop']);
});

const team = id => ({ teamId: `team_${String(id).padStart(16, '0')}`, whatsappPhone: '+15550000001', ace1Phone: '+15550000002', ace2Phone: '+15550000003',
  captain: { firstName: 'Cap', singlesUtr: 600, doublesUtr: null }, ace1: { fullName: 'Ace One', singlesUtr: 600, doublesUtr: null }, ace2: { fullName: 'Ace Two', singlesUtr: 600, doublesUtr: null }, selectedTier: 'higher', consent: true, rulesAccepted: true });

test('one browser can register only a few teams; others and repeats are unaffected', () => {
  let state = initialState();
  for (let i = 0; i < MAX_TEAMS_PER_BROWSER; i++) state = applyRegistration(state, team(i), 'browser-1', 1000 + i).state;
  assert.throws(() => applyRegistration(state, team(99), 'browser-1', 2000), /already registered 3 teams from this browser/);
  assert.ok(applyRegistration(state, team(99), 'browser-2', 2000), 'another browser can still register');
  assert.equal(applyRegistration(state, team(0), 'browser-1', 3000).result.created, undefined, 'repeating an earlier registration is not blocked');
});
