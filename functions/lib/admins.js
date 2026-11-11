// Extra administrators. An admin is an Email/Password account carrying the `admin` claim; the sign-in name is the part before @traice.local.
export const ADMIN_DOMAIN = 'traice.local';
export const ADMIN_USERNAME = /^[a-z][a-z0-9._-]{2,23}$/;
export const adminEmail = username => `${String(username).trim().toLowerCase()}@${ADMIN_DOMAIN}`;
export const adminUsername = email => String(email || '').replace(new RegExp(`@${ADMIN_DOMAIN.replaceAll('.', '\\.')}$`, 'i'), '');
// Typed at sign-in: a plain name means a @traice.local account; an address is used as it is.
export const loginIdentifier = value => { const v = String(value ?? '').trim(); return v.includes('@') ? v : adminEmail(v); };
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const ADMIN_PASSWORD_LENGTH = 12;
export const newAdminPassword = (pick = max => Math.floor(Math.random() * max)) => Array.from({ length: ADMIN_PASSWORD_LENGTH }, () => ALPHABET[pick(ALPHABET.length)]).join('');
const fail = message => { const error = new Error(message); error.name = 'ValidationError'; throw error; };
export function validateAdminUsername(value) {
  const username = String(value ?? '').trim().toLowerCase();
  if (!ADMIN_USERNAME.test(username)) fail('Choose a sign-in name of 3–24 characters: lowercase letters, numbers, dot, dash or underscore, starting with a letter.');
  return username;
}
// Rules for taking admin rights away: never from yourself, never from the last administrator.
export function checkRemoval(admins, uid, actorUid) {
  if (!admins.some(a => a.uid === uid)) fail('That person is not an administrator.');
  if (uid === actorUid) fail('You cannot remove your own admin access. Ask another admin.');
  if (admins.length <= 1) fail('There must be at least one administrator.');
}
