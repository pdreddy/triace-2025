// Turns a raw Firebase error into "what to fix", for the technical-details panel on the live site.
export function diagnose(message = '') {
  const text = String(message);
  if (/permission[_ ]denied|rules do not allow/i.test(text)) return 'The database rejected the read. The Realtime Database rules are probably not published, or do not cover the configured root. Publish them (merge database.rules.json into the live rules, then npm run rules:deploy).';
  if (/operation-not-allowed|admin-restricted-operation|sign-in method/i.test(text)) return 'Anonymous sign-in is switched off. Firebase Console → Authentication → Sign-in method → turn on Anonymous (and Email/Password).';
  if (/functions\/not-found|not-found|404|could not finish|internal|CORS|bootstrapTournament/i.test(text)) return 'The Cloud Functions do not answer. They are probably not deployed to this project (firebase deploy --only functions:traice), the project is not on the Blaze plan, or the function region does not match us-central1.';
  if (/Firebase setup is missing|api-key|invalid-api-key|projectId/i.test(text)) return 'The Firebase web settings are missing or wrong in this build. Check VITE_FIREBASE_* in Netlify (Site configuration → Environment variables) or netlify.toml, then redeploy.';
  if (/network|offline|failed to fetch|ERR_|timeout/i.test(text)) return 'The browser could not reach Firebase. Check the connection, a blocker or firewall, and that the database URL in the build is correct.';
  return 'Open the browser console (F12 → Console) for the full error.';
}

// ---- Live setup check (the /status page) ----
// What a callable function's answer to an empty request says about whether it is deployed.
export function classifyCallable(code = '', message = '') {
  const c = String(code).replace(/^functions\//, '');
  if (!c) return { status: 'ok', detail: 'answers' };
  if (['unauthenticated', 'permission-denied', 'failed-precondition', 'invalid-argument', 'already-exists', 'aborted'].includes(c)) return { status: 'ok', detail: 'deployed (it refused the empty test request, as it should)' };
  if (c === 'not-found') return { status: 'fail', detail: 'not deployed', fix: 'Deploy the functions: ./deploy.sh --no-hosting' };
  // Our own server wraps unexpected crashes in this message; a bare "internal" is what a browser sees when the function is not deployed at all
  // (the 404 has no cross-site headers, so the browser hides it).
  if (c === 'internal' && !/Could not save the update/i.test(message)) return { status: 'fail', detail: 'no answer: most likely not deployed yet', fix: 'Deploy the functions: ./deploy.sh --no-hosting (then run this check again). If it is deployed, open Firebase Console → Functions → Logs for the error.' };
  return { status: 'fail', detail: `crashed: ${c}`, fix: 'The function exists but failed. Open Firebase Console → Functions → Logs and look at the latest error. Check the project is on the Blaze plan.' };
}
// What the answer to a sign-in with an account that does not exist says about the Email/Password provider.
export function classifyPasswordProbe(code = '') {
  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-email'].includes(code)) return { status: 'ok', detail: 'Email/Password sign-in is on' };
  if (code === 'auth/operation-not-allowed') return { status: 'fail', detail: 'Email/Password sign-in is off', fix: 'Firebase Console → Authentication → Sign-in method → turn on Email/Password. Admin and captain sign-in need it.' };
  if (code === 'auth/too-many-requests') return { status: 'warn', detail: 'Firebase is limiting sign-in attempts from this network right now', fix: 'Wait a few minutes and run the check again.' };
  return { status: 'warn', detail: `unexpected answer: ${code || 'none'}` };
}
export const STATUS_ICON = { ok: '✓', fail: '✗', warn: '!', running: '…' };
