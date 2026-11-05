import test from 'node:test';
import assert from 'node:assert/strict';
import { ALPHABET, PASSWORD_LENGTH, newUsername, newPassword, newLogin, captainUid, loginEmail, isCaptainEmail, usernameFrom, normalizePassword, isCaptainPassword, LOGIN_DOMAIN } from '../../functions/lib/captainLogin.js';

test('usernames come from the captain’s name and a short random suffix', () => {
  assert.match(newUsername('Arjun'), /^arjun-[a-z2-9]{4}$/);
  assert.match(newUsername('José R.'), /^joser-[a-z2-9]{4}$/);       // accents and punctuation dropped
  assert.match(newUsername('   '), /^captain-[a-z2-9]{4}$/);
  assert.match(newUsername(null), /^captain-[a-z2-9]{4}$/);
  assert.match(newUsername('A'.repeat(40)), /^a{12}-[a-z2-9]{4}$/);
  assert.equal(/[ilo01]/.test(newUsername('x').split('-')[1]), false, 'no look-alike characters');
});

test('passwords are exactly 8 characters from an alphabet without look-alikes', () => {
  assert.equal(PASSWORD_LENGTH, 8);
  assert.equal(ALPHABET.length, 31);
  assert.equal(/[ilo01]/.test(ALPHABET), false);
  for (let i = 0; i < 200; i++) { const password = newPassword(); assert.equal(password.length, 8); assert.match(password, /^[a-z2-9]{8}$/); assert.ok(isCaptainPassword(password)); }
  assert.ok(new Set(Array.from({ length: 300 }, () => newPassword())).size > 295, 'passwords do not repeat');
  assert.ok(newPassword().length >= 6, 'long enough for Firebase Authentication (minimum 6)');
});

test('the password check rejects anything that is not 8 look-alike-free characters', () => {
  for (const bad of ['', 'short', 'toolongpassword', 'k7q2m9x', 'k7q2m9xpp', 'K7Q2M9XP', 'k7q2-m9x', 'k7q2m9x0', 'k7q2m9xl', null, undefined]) assert.equal(isCaptainPassword(bad), false, String(bad));
  assert.equal(isCaptainPassword('k7q2m9xp'), true);
});

test('typing is forgiven: capitals, spaces and hyphens do not matter', () => {
  assert.equal(normalizePassword('K7q2 M9xp'), 'k7q2m9xp');          // a phone capitalises the first letter
  assert.equal(normalizePassword(' k7q2-m9xp '), 'k7q2m9xp');
  assert.equal(normalizePassword(undefined), '');
  assert.ok(isCaptainPassword(normalizePassword('K7Q2 M9XP')));
});

test('a login is derived deterministically from the team and the username', () => {
  const { username, password } = newLogin('Arjun');
  assert.ok(username && password.length === 8);
  assert.equal(captainUid('team_abcdefghijklmnop'), 'cap_team_abcdefghijklmnop');
  assert.equal(loginEmail(' Arjun-K7Q2 '), `arjun-k7q2@${LOGIN_DOMAIN}`);
  assert.equal(usernameFrom(loginEmail('arjun-k7q2')), 'arjun-k7q2');
  assert.ok(isCaptainEmail(loginEmail('x')));
  assert.equal(isCaptainEmail('reddi2026@traice.local'), false, 'the admin address is not a captain');
  assert.equal(isCaptainEmail(undefined), false);
});

test('a fixed random source gives a fixed login (the generator is the only source of randomness)', () => {
  const rand = max => max - 1;
  assert.equal(newUsername('Bob', rand), 'bob-9999');
  assert.equal(newPassword(rand), '99999999');
});
