// Registering a team also creates the captain's login. A failure to create the login must never lose the registration:
// the team is saved without a login (loginPending) and the admin can create it later with "Reset login".
// Dependencies are passed in so the flow can be tested without Firebase.
import { ValidationError } from './tournament.js';
import { captainUid } from './captainAccount.js';

export async function runRegistration({ teamId, names, createAccount, deleteAccount, register, log = () => {} }) {
  const uid = captainUid(teamId);
  let login = null, loginFailed = false;
  try { login = await createAccount(uid, names); }
  catch (error) {
    loginFailed = true;
    if (error?.code !== 'auth/uid-already-exists') log(error);   // already exists = a repeat of the same request
  }
  let result;
  try { result = await register(login && { uid, username: login.username }); }
  catch (error) {
    // An operational error can arrive after a database commit. Deleting the
    // account in that case would break a registration that was actually saved.
    const refused = error instanceof ValidationError || ['failed-precondition', 'invalid-argument', 'permission-denied', 'unauthenticated'].includes(error?.code);
    if (login && refused) await deleteAccount(uid).catch(() => {});
    else if (login) log(error); // Retain the account until the uncertain commit can be reconciled.
    throw error;
  }
  if (!result.created && !result.loginAttached && login) await deleteAccount(uid).catch(() => {});                  // a repeat that found the team already registered
  if ((result.created || result.loginAttached) && login) return { ...result, login };
  if (result.created && loginFailed) return { ...result, loginPending: true };
  return result;
}
