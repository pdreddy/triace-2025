import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { applyRegistration, applyConfiguration, applyRecalculation, ValidationError } from './lib/tournament.js';
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

export const registerTeam = onCall(options, async request => { requireAuth(request); return mutate(state => applyRegistration(state, request.data, request.auth.uid)); });
export const saveConfiguration = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyConfiguration(state, request.data)); });
export const recalculateTiers = onCall(options, async request => { requireAuth(request, true); return mutate(state => applyRecalculation(state)); });
