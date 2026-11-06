// Registering a team also creates the captain's login. A failure to create the login must never lose the registration:
// the team is saved without a login (loginPending) and the admin can create it later with "Reset login".
// Dependencies are passed in so the flow can be tested without Firebase.
import { captainUid } from './captainAccount.js';

export async function runRegistration({ teamId, firstName, createAccount, deleteAccount, register, log = () => {} }) {
  const uid = captainUid(teamId);
  let login = null, loginFailed = false;
  try { login = await createAccount(uid, firstName); }
  catch (error) {
    if (error?.code !== 'auth/uid-already-exists') { loginFailed = true; log(error); }   // already exists = a repeat of the same request
  }
  let result;
  try { result = await register(login && { uid, username: login.username }); }
  catch (error) {
    if (login) await deleteAccount(uid).catch(() => {});                                    // registration refused: do not leave an orphan login
    throw error;
  }
  if (!result.created && login) await deleteAccount(uid).catch(() => {});                  // a repeat that found the team already registered
  if (result.created && login) return { ...result, login };
  if (result.created && loginFailed) return { ...result, loginPending: true };
  return result;
}
