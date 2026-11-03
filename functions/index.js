import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { applyRegistration, applyConfiguration, applyRecalculation, applyLeagueRules, ValidationError } from './lib/tournament.js';
import { applyGenerateFixtures, applyGeneratePlayoffs, applySubmitResult, applyReviewResult, applyManageSeason, applySetSchedule, applyMoveFixture, applyIssueChallenge, applyUpdateTeam, applyWithdrawTeam, applyClaimTeam, applyResetCaptainCode } from './lib/league.js';
import { newCaptainCode, hashCaptainCode } from './lib/captainCode.js';
initializeApp();
const options = { region: 'us-central1', maxInstances: 10, timeoutSeconds: 60 };
function requireAuth(request, admin = false) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  if (admin && request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Administrator access is required.');
}
async function mutate(operation) {
  let outcome, updateError;
  const root = getDatabase().ref('traice2_0');
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

export const registerTeam = onCall(options, async request => {
  requireAuth(request);
  const code = newCaptainCode(), result = await mutate(state => applyRegistration(state, request.data, request.auth.uid, Date.now(), hashCaptainCode(code)));
  return result.created ? { ...result, captainCode: code } : result;
});
export const saveConfiguration = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyConfiguration(state, request.data)); });
export const recalculateTiers = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyRecalculation(state)); });
export const generateFixtures = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyGenerateFixtures(state, request.data)); });
export const submitResult = onCall(options, async request => { requireAuth(request); return mutate(state => applySubmitResult(state, request.data, request.auth.uid, request.auth.token.admin === true)); });
export const reviewResult = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyReviewResult(state, request.data)); });
export const generatePlayoffs = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyGeneratePlayoffs(state, request.data)); });
export const saveLeagueRules = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyLeagueRules(state, request.data)); });
export const manageSeason = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyManageSeason(state, request.data)); });
const isAdmin = request => request.auth?.token?.admin === true;
export const setSchedule = onCall(options, async request => { requireAuth(request, true); return mutate(state => applySetSchedule(state, request.data)); });
export const moveFixture = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyMoveFixture(state, request.data)); });
export const issueChallenge = onCall(options, async request => { requireAuth(request); return mutate(state => applyIssueChallenge(state, request.data, request.auth.uid, isAdmin(request))); });
export const updateTeam = onCall(options, async request => { requireAuth(request); return mutate(state => applyUpdateTeam(state, request.data, request.auth.uid, isAdmin(request))); });
export const withdrawTeam = onCall(options, async request => { requireAuth(request); return mutate(state => applyWithdrawTeam(state, request.data, request.auth.uid, isAdmin(request))); });
export const claimTeam = onCall(options, async request => { requireAuth(request); return mutate(state => applyClaimTeam(state, { teamId: request.data?.teamId, codeHash: hashCaptainCode(request.data?.code) }, request.auth.uid)); });
export const resetCaptainCode = onCall(options, async request => {
  requireAuth(request, true);
  const code = newCaptainCode();
  await mutate(state => applyResetCaptainCode(state, { teamId: request.data?.teamId, codeHash: hashCaptainCode(code) }));
  return { teamId: request.data?.teamId, captainCode: code };
});
