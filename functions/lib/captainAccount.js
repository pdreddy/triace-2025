// Browser-safe parts of captain logins (no Node crypto): the made-up email behind a username and the password rules.
export const LOGIN_DOMAIN = 'captain.traice.local';
export const PASSWORD_LETTERS = 6;   // first 3 letters of the last name + first 3 letters of the first name
export const PASSWORD_DIGITS = 4;    // random
export const PASSWORD_LENGTH = PASSWORD_LETTERS + PASSWORD_DIGITS;
export const captainUid = teamId => `cap_${teamId}`;
export const loginEmail = username => `${String(username).trim().toLowerCase()}@${LOGIN_DOMAIN}`;
export const isCaptainEmail = email => typeof email === 'string' && email.toLowerCase().endsWith(`@${LOGIN_DOMAIN}`);
export const usernameFrom = email => String(email || '').split('@')[0];
// Phones capitalise the first letter and add spaces: passwords are all lowercase, so forgive both (and a stray #).
export const normalizePassword = value => String(value ?? '').toLowerCase().replace(/[\s#-]/g, '');
export const isCaptainPassword = value => new RegExp(`^[a-z]{${PASSWORD_LETTERS}}\\d{${PASSWORD_DIGITS}}$`).test(value);
