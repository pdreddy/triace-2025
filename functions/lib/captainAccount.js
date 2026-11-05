// Browser-safe parts of captain logins (no Node crypto): the made-up email behind a username and the password rules.
export const LOGIN_DOMAIN = 'captain.traice.local';
export const PASSWORD_LENGTH = 8;
export const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes: i l o 0 1
export const captainUid = teamId => `cap_${teamId}`;
export const loginEmail = username => `${String(username).trim().toLowerCase()}@${LOGIN_DOMAIN}`;
export const isCaptainEmail = email => typeof email === 'string' && email.toLowerCase().endsWith(`@${LOGIN_DOMAIN}`);
export const usernameFrom = email => String(email || '').split('@')[0];
// Phones capitalise the first letter and add spaces: passwords are all lowercase, so forgive both.
export const normalizePassword = value => String(value ?? '').toLowerCase().replace(/[\s-]/g, '');
export const isCaptainPassword = value => new RegExp(`^[${ALPHABET}]{${PASSWORD_LENGTH}}$`).test(value);
