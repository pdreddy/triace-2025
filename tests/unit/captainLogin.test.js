import test from 'node:test';
import assert from 'node:assert/strict';
import { letters, usernameBase, usernameAttempt, newPassword, newLogin, loginNames, captainUid, loginEmail, isCaptainEmail, usernameFrom, normalizePassword, isCaptainPassword, PASSWORD_LENGTH, LOGIN_DOMAIN } from '../../functions/lib/captainLogin.js';
import { validateRegistration, DEFAULT_SETTINGS, DEFAULT_TIERS } from '../../functions/lib/tournament.js';

const arjun = { firstName: 'Arjun', lastName: 'Rana', ace2Name: 'Raj Mehta' };

test('the username is the first 4 letters of the captain’s first name plus the first 3 letters of Ace 2', () => {
  assert.equal(usernameBase(arjun), 'arjuraj');
  assert.equal(usernameBase({ firstName: 'Bala', ace2Name: 'Chetan Iyer' }), 'balache');
  assert.equal(usernameBase({ firstName: 'Anna-Marie', ace2Name: 'Sam' }), 'annasam');       // punctuation dropped
  assert.equal(usernameBase({ firstName: 'José', ace2Name: 'Zoë Kim' }), 'josezoe');          // accents folded
});

test('short or missing names are padded so a username always exists', () => {
  assert.equal(usernameBase({ firstName: 'Al', ace2Name: 'Bo' }), 'alxxbox');
  assert.equal(usernameBase({ firstName: '', ace2Name: '' }), 'xxxxxxx');
  assert.equal(usernameBase({}), 'xxxxxxx');
  assert.equal(usernameBase(undefined), 'xxxxxxx');
  assert.equal(letters('  O’Neil ', 3), 'one');
  assert.equal(letters('李', 3), 'xxx');
});

test('a taken username gets a number', () => {
  assert.deepEqual([0, 1, 2, 3].map(attempt => usernameAttempt(arjun, attempt)), ['arjuraj', 'arjuraj2', 'arjuraj3', 'arjuraj4']);
});

test('the password is the first 3 letters of the last name, the first 3 of the first name, and 4 random digits', () => {
  assert.equal(PASSWORD_LENGTH, 10);
  for (let i = 0; i < 100; i++) { const password = newPassword(arjun); assert.match(password, /^ranarj\d{4}$/); assert.ok(isCaptainPassword(password)); }
  assert.equal(newPassword(arjun, () => 4), 'ranarj4444');
  assert.equal(newPassword({ firstName: 'José', lastName: 'Núñez' }, () => 7), 'nunjos7777');
  assert.equal(newPassword({ firstName: 'Al', lastName: 'Li' }, () => 0), 'lixalx0000');         // padded
  assert.equal(newPassword({ firstName: 'Arjun' }, () => 1), 'triarj1111', 'no last name given (an older page): a fixed prefix');
  const digits = new Set(Array.from({ length: 300 }, () => newPassword(arjun).slice(6)));
  assert.ok(digits.size > 250, 'the digits are random');
});

test('the password check accepts only the pattern: 6 letters then 4 digits', () => {
  for (const good of ['ranarj4172', 'abcdef0000']) assert.equal(isCaptainPassword(good), true, good);
  for (const bad of ['', 'ranarj417', 'ranarj41722', 'RANARJ4172', 'ranar4172', 'ranarj#4172', 'ranarj41a2', null, undefined]) assert.equal(isCaptainPassword(bad), false, String(bad));
});

test('typing is forgiven: capitals, spaces, hyphens and a #', () => {
  assert.equal(normalizePassword('Ranarj4172'), 'ranarj4172');          // a phone capitalises the first letter
  assert.equal(normalizePassword(' ranarj #4172 '), 'ranarj4172');
  assert.equal(normalizePassword('RAN-ARJ-4172'), 'ranarj4172');
  assert.equal(normalizePassword(undefined), '');
  assert.ok(isCaptainPassword(normalizePassword('Ran Arj 4172')));
});

test('a login is derived deterministically from the team and the username', () => {
  const { username, password } = newLogin(arjun);
  assert.equal(username, 'arjuraj');
  assert.match(password, /^ranarj\d{4}$/);
  assert.equal(newLogin(arjun, undefined, 1).username, 'arjuraj2');
  assert.equal(captainUid('team_abcdefghijklmnop'), 'cap_team_abcdefghijklmnop');
  assert.equal(loginEmail(' ArjuRaj '), `arjuraj@${LOGIN_DOMAIN}`);
  assert.equal(usernameFrom(loginEmail('arjuraj')), 'arjuraj');
  assert.ok(isCaptainEmail(loginEmail('x')));
  assert.equal(isCaptainEmail('reddi2026@traice.local'), false, 'the admin address is not a captain');
  assert.equal(isCaptainEmail(undefined), false);
});

test('the names come from a registration payload or a saved registration', () => {
  assert.deepEqual(loginNames({ captain: { firstName: 'Arjun', lastName: 'Rana' }, ace2: { fullName: 'Raj Mehta' } }), arjun);
  assert.deepEqual(loginNames({ captain: { firstName: 'Arjun' } }), { firstName: 'Arjun', lastName: undefined, ace2Name: undefined });
  assert.deepEqual(loginNames(undefined), { firstName: undefined, lastName: undefined, ace2Name: undefined });
});

const payload = captain => ({ teamId: 'team_abcdefghijklmnop', whatsappPhone: '+15550000001', ace1Phone: '+15550000002', ace2Phone: '+15550000003',
  captain, ace1: { fullName: 'Ace One', singlesUtr: 600, doublesUtr: null }, ace2: { fullName: 'Raj Mehta', singlesUtr: 600, doublesUtr: null }, selectedTier: 'higher', consent: true, rulesAccepted: true });
const check = captain => validateRegistration(payload(captain), DEFAULT_SETTINGS, DEFAULT_TIERS);

test('registration takes an optional private captain last name', () => {
  const withLast = check({ firstName: 'Arjun', lastName: ' Rana ', singlesUtr: 600, doublesUtr: null });
  assert.equal(withLast.captain.lastName, 'Rana');
  assert.equal(check({ firstName: 'Arjun', singlesUtr: 600, doublesUtr: null }).captain.lastName, undefined, 'older pages that send no last name still register');
  assert.equal(check({ firstName: 'Arjun', lastName: "O'Neil-Smith", singlesUtr: 600, doublesUtr: null }).captain.lastName, "O'Neil-Smith");
  for (const bad of ['', '   ', 'R4na', '<b>', 'x'.repeat(41), 5]) assert.throws(() => check({ firstName: 'Arjun', lastName: bad, singlesUtr: 600, doublesUtr: null }), /last name/i, String(bad));
  assert.throws(() => check({ firstName: 'Arjun', surname: 'Rana', singlesUtr: 600, doublesUtr: null }), /Invalid player fields/);
});
