// Server-side helpers for captain logins: every team gets a username and a generated 8-character password.
// Behind the scenes a login is a Firebase Email/Password account with a made-up address, so nobody has to give an email.
import { randomInt } from 'node:crypto';
import { PASSWORD_LENGTH, ALPHABET } from './captainAccount.js';

export { LOGIN_DOMAIN, PASSWORD_LENGTH, ALPHABET, captainUid, loginEmail, isCaptainEmail, usernameFrom, normalizePassword, isCaptainPassword } from './captainAccount.js';

const slug = name => String(name ?? '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'captain';
const pick = (length, rand) => Array.from({ length }, () => ALPHABET[rand(ALPHABET.length)]).join('');

export const newUsername = (firstName, rand = randomInt) => `${slug(firstName)}-${pick(4, rand)}`;
// 8 characters from 31 look-alike-free letters and digits: about 40 bits, on top of Firebase's sign-in rate limits.
export const newPassword = (rand = randomInt) => pick(PASSWORD_LENGTH, rand);
export const newLogin = (firstName, rand = randomInt) => ({ username: newUsername(firstName, rand), password: newPassword(rand) });
