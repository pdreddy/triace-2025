import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../../src/services/diagnose.js';

test('common live-site errors point at the right fix', () => {
  assert.match(diagnose('permission_denied at /traice2_0/tiers'), /rules/i);
  assert.match(diagnose('The database rules do not allow reading “traice2_0”.'), /rules/i);
  assert.match(diagnose('Firebase: Error (auth/operation-not-allowed).'), /Anonymous/);
  assert.match(diagnose('Tournament setup could not finish: internal.'), /Cloud Functions/);
  assert.match(diagnose('functions/not-found'), /Cloud Functions/);
  assert.match(diagnose('Firebase setup is missing. Add the web configuration'), /VITE_FIREBASE/);
  assert.match(diagnose('Failed to fetch'), /could not reach/);
  assert.match(diagnose('something odd'), /console/);
  assert.match(diagnose(undefined), /console/);
});

import { classifyCallable, classifyPasswordProbe } from '../../src/services/diagnose.js';
test('the setup check reads the answers of functions and of sign-in correctly', () => {
  for (const code of ['functions/unauthenticated', 'functions/permission-denied', 'functions/failed-precondition', 'functions/invalid-argument']) assert.equal(classifyCallable(code).status, 'ok', code);
  assert.equal(classifyCallable('functions/not-found').status, 'fail');
  assert.match(classifyCallable('functions/not-found').fix, /Deploy the functions/);
  assert.match(classifyCallable('functions/internal', 'internal').detail, /not deployed yet/);
  assert.match(classifyCallable('functions/internal', 'Could not save the update. Please retry.').detail, /crashed/);
  assert.equal(classifyCallable('functions/internal').status, 'fail');
  assert.equal(classifyCallable('functions/unavailable').status, 'fail');
  assert.equal(classifyCallable('').status, 'ok');
  assert.equal(classifyPasswordProbe('auth/invalid-credential').status, 'ok');
  assert.equal(classifyPasswordProbe('auth/user-not-found').status, 'ok');
  assert.equal(classifyPasswordProbe('auth/operation-not-allowed').status, 'fail');
  assert.match(classifyPasswordProbe('auth/operation-not-allowed').fix, /Email\/Password/);
  assert.equal(classifyPasswordProbe('auth/too-many-requests').status, 'warn');
  assert.equal(classifyPasswordProbe('auth/network-request-failed').status, 'warn');
});
