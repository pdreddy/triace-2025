import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, newUsername, newPassword, newLogin, captainUid, loginEmail, isCaptainEmail, usernameFrom, LOGIN_DOMAIN } from '../../functions/lib/captainLogin.js';

test('the word list is 256 distinct, easy-to-type words', () => {
  assert.equal(WORDS.length, 256);
  assert.equal(new Set(WORDS).size, 256);
  assert.ok(WORDS.every(w => /^[a-z]{3,8}$/.test(w)), WORDS.filter(w => !/^[a-z]{3,8}$/.test(w)).join(','));
});

test('usernames come from the captain’s name and a short random suffix', () => {
  assert.match(newUsername('Arjun'), /^arjun-[a-z2-9]{4}$/);
  assert.match(newUsername('José R.'), /^joser-[a-z2-9]{4}$/);       // accents and punctuation dropped
  assert.match(newUsername('   '), /^captain-[a-z2-9]{4}$/);
  assert.match(newUsername(null), /^captain-[a-z2-9]{4}$/);
  assert.match(newUsername('A'.repeat(40)), /^a{12}-[a-z2-9]{4}$/);
  assert.equal(/[ilo01]/.test(newUsername('x').split('-')[1]), false, 'no look-alike characters');
});

test('passwords are three words and three digits', () => {
  for (let i = 0; i < 50; i++) assert.match(newPassword(), /^[a-z]+-[a-z]+-[a-z]+-\d{3}$/);
  assert.ok(new Set(Array.from({ length: 200 }, () => newPassword())).size > 195, 'passwords do not repeat');
});

test('a login is derived deterministically from the team and the username', () => {
  const { username, password } = newLogin('Arjun');
  assert.ok(username && password);
  assert.equal(captainUid('team_abcdefghijklmnop'), 'cap_team_abcdefghijklmnop');
  assert.equal(loginEmail(' Arjun-K7Q2 '), `arjun-k7q2@${LOGIN_DOMAIN}`);
  assert.equal(usernameFrom(loginEmail('arjun-k7q2')), 'arjun-k7q2');
  assert.ok(isCaptainEmail(loginEmail('x')));
  assert.equal(isCaptainEmail('reddi2026@traice.local'), false, 'the admin address is not a captain');
  assert.equal(isCaptainEmail(undefined), false);
});

test('a fixed random source gives a fixed login (so the generator is the only source of randomness)', () => {
  const rand = max => max - 1;
  assert.equal(newUsername('Bob', rand), 'bob-9999');
  assert.equal(newPassword(rand), `${WORDS[255]}-${WORDS[255]}-${WORDS[255]}-999`);
});
