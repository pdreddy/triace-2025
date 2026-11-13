import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoService } from '../../src/services/demo.js';

test('concurrent auth subscriptions share the initial session request', async t => {
  let finish;
  const reply = new Promise(resolve => { finish = resolve; });
  const fetch = t.mock.method(globalThis, 'fetch', () => reply);
  const service = createDemoService(), users = [], errors = [];
  const offA = service.subscribeAuth(user => users.push(user), error => errors.push(error));
  const offB = service.subscribeAuth(user => users.push(user), error => errors.push(error));
  assert.equal(fetch.mock.callCount(), 1, 'two anonymous sessions could leave the cookie and UI with different owners');
  finish({ ok: true, json: async () => ({ uid: 'same-session', anonymous: true }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(users.length >= 2);
  assert.ok(users.every(user => user.uid === 'same-session'));
  assert.deepEqual(errors, []);
  offA(); offB();
});
