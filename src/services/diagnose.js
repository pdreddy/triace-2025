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
