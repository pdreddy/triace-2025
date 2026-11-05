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
