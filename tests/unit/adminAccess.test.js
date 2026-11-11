import test from 'node:test';
import assert from 'node:assert/strict';
import { adminStatus } from '../../functions/lib/adminAccess.js';

const now = Date.now();
const admin = (extra = {}) => ({ customClaims: { admin: true }, disabled: false, tokensValidAfterTime: new Date(now - 3600e3).toUTCString(), ...extra });
const token = (secondsAgo = 60) => ({ admin: true, iat: Math.floor(now / 1000) - secondsAgo });

test('a current admin with a fresh token is an admin', () => assert.equal(adminStatus(admin(), token()).admin, true));
test('removing the claim ends access even while the token still says admin', () => assert.deepEqual(adminStatus(admin({ customClaims: { admin: false } }), token()), { admin: false, reason: 'not-admin' }));
test('a disabled or missing account is not an admin', () => {
  assert.equal(adminStatus(admin({ disabled: true }), token()).reason, 'disabled');
  assert.equal(adminStatus(null, token()).reason, 'unknown-account');
});
test('a token issued before the sessions were revoked is refused', () => {
  const revoked = admin({ tokensValidAfterTime: new Date(now - 30e3).toUTCString() });
  assert.equal(adminStatus(revoked, token(600)).reason, 'revoked');
  assert.equal(adminStatus(revoked, token(5)).admin, true, 'a token issued after the revocation is fine');
});
