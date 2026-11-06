import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'node:crypto';
import { applyCreatePost, applyExpressInterest, applyClosePost, applyMarkPicked, applyReopenPost } from './lib/partners.js';
import { applyRegistration, applyEarlyBird, applyConfiguration, applyRecalculation, applyLeagueRules, bootstrapState, ValidationError } from './lib/tournament.js';
import { applyGenerateFixtures, applyGeneratePlayoffs, applySubmitResult, applyReviewResult, applyManageSeason, applySetSchedule, applyMoveFixture, applyIssueChallenge, applyUpdateTeam, applyWithdrawTeam, applySetCaptainLogin } from './lib/league.js';
import { getAuth } from 'firebase-admin/auth';
import { usernameAttempt, newPassword, loginNames, captainUid, loginEmail } from './lib/captainLogin.js';
import { runRegistration } from './lib/registerFlow.js';
import { resolveDbPaths } from './lib/paths.js';
import { validateLegacySeason } from './lib/legacy.js';
initializeApp();
// TRAICE_DB_ROOT / TRAICE_DB_SEASON1_PATH come from functions/.env (see functions/.env.example).
const paths = resolveDbPaths({ root: process.env.TRAICE_DB_ROOT, season1: process.env.TRAICE_DB_SEASON1_PATH });
const options = { region: 'us-central1', maxInstances: 10, timeoutSeconds: 60 };
function requireAuth(request, admin = false) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  if (admin && request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Administrator access is required.');
}
async function mutate(operation) {
  let outcome, updateError;
  const root = getDatabase().ref(paths.root);
  let listener;
  try {
    // Keep a value listener alive so the transaction starts with authoritative
    // state rather than an empty local cache. Root reads use the Admin SDK only.
    await new Promise((resolve, reject) => { listener = () => resolve(); root.on('value', listener, reject); });
    const transaction = await root.transaction(current => {
      try { const result = operation(current); updateError = null; outcome = result.result; return result.state; }
      catch (error) { updateError = error; return undefined; }
    }, undefined, false);
    if (!transaction.committed && updateError) throw updateError;
    if (!transaction.committed) throw new HttpsError('aborted', 'The update could not complete. Please retry.');
    return outcome;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ValidationError) throw new HttpsError('failed-precondition', error.message);
    console.error('Tournament update failed', { name: error.name, code: error.code });
    throw new HttpsError('internal', 'Could not save the update. Please retry.');
  } finally { if (listener) root.off('value', listener); }
}

export const bootstrapTournament = onCall(options, async () => {
  if ((await getDatabase().ref(`${paths.root}/settings`).get()).exists()) return { created: false };
  return mutate(bootstrapState);
});
export const importSeason1 = onCall(options, async request => {
  requireAuth(request, true);
  try { validateLegacySeason(request.data?.season); } catch (error) { throw new HttpsError('failed-precondition', error.message); }
  const target = getDatabase().ref(paths.season1), existing = (await target.get()).val();
  // Defence in depth: only ever replace a previous Season 1 import, never other data that happens to sit at the path.
  if (existing != null && !(existing.id === 's1' && existing.legacy === true)) throw new HttpsError('failed-precondition', `The database already has other data at “${paths.season1}”. Choose a different Season 1 path.`);
  await target.set(request.data.season);
  return { path: paths.season1 };
});
const TEAM_ID = /^[a-zA-Z0-9_-]{16,80}$/;
// Creates the captain's Email/Password account (uid is derived from the team, so a retry finds it). Retries if the username is taken.
async function createCaptainAccount(uid, names, password = newPassword(names)) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const username = usernameAttempt(names, attempt);   // arjuraj, then arjuraj2, arjuraj3 ... if taken
    try { await getAuth().createUser({ uid, email: loginEmail(username), password, displayName: `${username} (captain)` }); return { username, password }; }
    catch (error) { if (error.code !== 'auth/email-already-exists') throw error; }
  }
  throw new HttpsError('aborted', 'Could not create a login. Please retry.');
}
// Registering also creates the captain's login (username + 8-character password), returned once for the captain to save.
// If the login cannot be created the team is still registered (loginPending) and the admin creates it with Reset login.
export const registerTeam = onCall(options, async request => {
  requireAuth(request);
  const teamId = request.data?.teamId;
  if (typeof teamId !== 'string' || !TEAM_ID.test(teamId)) throw new HttpsError('failed-precondition', 'Invalid registration identifier.');
  return runRegistration({
    teamId, names: loginNames(request.data),
    createAccount: createCaptainAccount,
    deleteAccount: uid => getAuth().deleteUser(uid),
    register: login => mutate(state => applyRegistration(state, request.data, request.auth.uid, Date.now(), login)),
    log: error => console.error('Captain login could not be created; the team is registered without one', { code: error?.code })
  });
});
export const saveConfiguration = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyConfiguration(state, request.data)); });
export const recalculateTiers = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyRecalculation(state)); });
export const generateFixtures = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyGenerateFixtures(state, request.data)); });
export const submitResult = onCall(options, async request => { requireAuth(request); return mutate(state => applySubmitResult(state, request.data, request.auth.uid, request.auth.token.admin === true)); });
export const reviewResult = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyReviewResult(state, request.data)); });
export const generatePlayoffs = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyGeneratePlayoffs(state, request.data)); });
// Find a partner: public posts, private contact details, and a swap of WhatsApp numbers when someone replies.
const newId = () => randomUUID().replaceAll('-', '').slice(0, 20);
export const createPartnerPost = onCall(options, async request => { requireAuth(request); return mutate(state => applyCreatePost(state, request.data, request.auth.uid, Date.now(), newId())); });
export const expressInterest = onCall(options, async request => { requireAuth(request); return mutate(state => applyExpressInterest(state, request.data, request.auth.uid, Date.now(), newId())); });
export const closePartnerPost = onCall(options, async request => { requireAuth(request); return mutate(state => applyClosePost(state, request.data, request.auth.uid, request.auth?.token?.admin === true)); });
export const markPartnerPicked = onCall(options, async request => { requireAuth(request); return mutate(state => applyMarkPicked(state, request.data, request.auth.uid, request.auth?.token?.admin === true)); });
export const reopenPartnerPost = onCall(options, async request => { requireAuth(request); return mutate(state => applyReopenPost(state, request.data, request.auth.uid, request.auth?.token?.admin === true)); });
export const saveEarlyBird = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyEarlyBird(state, request.data)); });
export const saveLeagueRules = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyLeagueRules(state, request.data)); });
export const manageSeason = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyManageSeason(state, request.data)); });
const isAdmin = request => request.auth?.token?.admin === true;
export const setSchedule = onCall(options, async request => { requireAuth(request, true); return mutate(state => applySetSchedule(state, request.data)); });
export const moveFixture = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyMoveFixture(state, request.data)); });
export const issueChallenge = onCall(options, async request => { requireAuth(request); return mutate(state => applyIssueChallenge(state, request.data, request.auth.uid, isAdmin(request))); });
export const updateTeam = onCall(options, async request => { requireAuth(request); return mutate(state => applyUpdateTeam(state, request.data, request.auth.uid, isAdmin(request))); });
export const withdrawTeam = onCall(options, async request => {
  requireAuth(request);
  const result = await mutate(state => applyWithdrawTeam(state, request.data, request.auth.uid, isAdmin(request)));
  await getAuth().deleteUser(captainUid(result.teamId)).catch(() => {});   // the team is gone, so is its login
  return result;
});
// Admin: give a team's captain a new password (and sign out their old sessions). The password is returned once and never stored.
export const resetCaptainLogin = onCall(options, async request => {
  requireAuth(request, true);
  const teamId = request.data?.teamId;
  if (typeof teamId !== 'string' || !TEAM_ID.test(teamId)) throw new HttpsError('invalid-argument', 'Choose a team.');
  const record = (await getDatabase().ref(`${paths.root}/registrations/${teamId}`).get()).val();
  if (!record) throw new HttpsError('not-found', 'That team no longer exists.');
  const names = loginNames(record), uid = captainUid(teamId), password = newPassword(names);
  let username = record.captainUsername;
  try {
    if (username) await getAuth().updateUser(uid, { password });
    else throw Object.assign(new Error('no login yet'), { code: 'auth/user-not-found' });
    await getAuth().revokeRefreshTokens(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') { console.error('Captain login reset failed', { code: error.code }); throw new HttpsError('internal', 'Could not reset the login. Please retry.'); }
    ({ username } = await createCaptainAccount(uid, names, password));   // the team has no login yet, or it was removed
    await mutate(state => applySetCaptainLogin(state, { teamId, uid, username }));
  }
  return { teamId, username, password };
});
