import test from 'node:test';
import assert from 'node:assert/strict';
import { runSetupChecks } from '../../src/services/setupChecks.js';

const config = { projectId: 'demo-test', databaseURL: 'https://demo-test.firebaseio.com' };
const paths = { root: 'tournament', season1: 'legacy/s1' };
test('setup diagnostics preserve an admin account and saved calendar and never invoke a write endpoint', async () => {
  const state = { calendar: { registrationCloses: '2027-01-01' }, registrations: { team: { ownerUid: 'captain' } } };
  const before = structuredClone(state), calls = [], items = [];
  const user = { uid: 'admin', email: 'admin@example.com', isAnonymous: false };
  const callable = async name => {
    calls.push(name);
    if (name === 'saveCalendar') state.calendar = {};
    if (name === 'healthCheck') return { ok: true, service: 'traice' };
    throw new Error(`Unexpected callable: ${name}`);
  };
  await runSetupChecks({ config, paths, report: item => items.push(item),
    read: async path => path.endsWith('/settings') ? { registrationEnabled: true } : null,
    currentUser: () => user, claims: async actual => { assert.equal(actual, user); return { admin: true }; },
    health: () => callable('healthCheck')
  });
  assert.deepEqual(calls, ['healthCheck']);
  assert.deepEqual(state, before);
  assert.equal(items.findLast(i => i.id === 'account').status, 'ok');
  assert.equal(items.findLast(i => i.id === 'password').status, 'warn', 'provider configuration is explicitly unverified');
});
test('diagnostics report inaccessible data and missing health deployment, then continue to account checks', async () => {
  const items = [];
  await runSetupChecks({ config, paths, report: item => items.push(item),
    read: async () => { throw new Error('permission denied'); },
    currentUser: () => null, claims: async () => { throw new Error('must not request claims without an account'); },
    health: async () => { throw Object.assign(new Error('not-found'), { code: 'functions/not-found' }); }
  });
  assert.equal(items.findLast(i => i.id === 'database').status, 'fail');
  assert.equal(items.findLast(i => i.id === 'backend').status, 'fail');
  assert.equal(items.findLast(i => i.id === 'account').status, 'ok');
});
test('a malformed health response is not reported as a working backend', async () => {
  const items = [];
  await runSetupChecks({ config, paths, report: item => items.push(item), read: async () => ({}),
    currentUser: () => null, claims: async () => ({}), health: async () => ({ ok: false }) });
  assert.equal(items.findLast(i => i.id === 'backend').status, 'fail');
});
