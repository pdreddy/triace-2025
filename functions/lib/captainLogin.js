// Server-side helpers for captain logins. The pattern is simple on purpose, so a captain can work it out and the admin can help:
//   username  = first 4 letters of the captain's first name + first 3 letters of Ace 2's name          Arjun / Raj Mehta  ->  arjuraj
//   password  = first 3 letters of the captain's last name + first 3 of the first name + 4 random digits   Arjun Rana  ->  ranarj4172
// A taken username gets a number (arjuraj2, arjuraj3 ...). Behind the scenes a login is a Firebase Email/Password account with a
// made-up address, so nobody has to give an email.
import { randomInt } from 'node:crypto';
import { PASSWORD_DIGITS } from './captainAccount.js';

export { LOGIN_DOMAIN, PASSWORD_LENGTH, captainUid, loginEmail, isCaptainEmail, usernameFrom, normalizePassword, isCaptainPassword } from './captainAccount.js';

// Lowercase ASCII letters of a name, accents folded; the first `count` of them, padded with x when the name is too short.
export const letters = (name, count) => String(name ?? '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z]/g, '').slice(0, count).padEnd(count, 'x');
// The first word of a full name (an Ace is entered as "Raj Mehta"; the pattern uses "Raj").
const firstWord = name => String(name ?? '').trim().split(/\s+/)[0];

export function usernameBase({ firstName, ace2Name } = {}) {
  return `${letters(firstName, 4)}${letters(firstWord(ace2Name), 3)}`;
}
// attempt 0 is the plain name; later attempts add a number when the name is already taken.
export const usernameAttempt = (names, attempt) => `${usernameBase(names)}${attempt === 0 ? '' : attempt + 1}`;

export function newPassword({ firstName, lastName } = {}, rand = randomInt) {
  const digits = Array.from({ length: PASSWORD_DIGITS }, () => rand(10)).join('');
  return `${letters(lastName || 'tri', 3)}${letters(firstName, 3)}${digits}`;
}
export const newLogin = (names = {}, rand = randomInt, attempt = 0) => ({ username: usernameAttempt(names, attempt), password: newPassword(names, rand) });

// The three names a login is built from, from a registration payload or a saved registration.
export const loginNames = registration => ({ firstName: registration?.captain?.firstName, lastName: registration?.captain?.lastName, ace2Name: registration?.ace2?.fullName });
