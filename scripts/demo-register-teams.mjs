// Registers 5 sample teams in the running local demo and checks the results — no typing needed.
//   Terminal 1:  ./run-local.sh            (or: TRAICE_ADMIN_PASSWORD=... npm run demo)
//   Terminal 2:  npm run demo:register     (add --fixtures to also generate round-robin fixtures)
// Options via environment: DEMO_URL (default http://127.0.0.1:3000), TRAICE_ADMIN_PASSWORD (default demo-admin-1234),
// TRAICE_ADMIN_USERNAME (default reddi2026).
import { randomUUID } from 'node:crypto';

const base = (process.env.DEMO_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const adminPassword = process.env.TRAICE_ADMIN_PASSWORD || 'demo-admin-1234', adminUser = process.env.TRAICE_ADMIN_USERNAME || 'reddi2026';
const withFixtures = process.argv.includes('--fixtures');

class Client {
  constructor() { this.cookie = ''; }
  async call(path, body) {
    const response = await fetch(`${base}/api/${path}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const set = response.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
    const text = await response.text(); let json; try { json = JSON.parse(text); } catch { json = {}; }
    return { status: response.status, ok: response.ok, json, text };
  }
}

// [captain, ace1, ace2, ace1 UTR…] — ratings are hundredths (6.00 = 600). Combined 17.50+ is GOAT, 11.50–17.50 is Rising.
const TEAMS = [
  { captain: 'Arjun', a1: 'Arjun Alpha Rao', a2: 'Arjun Beta Rao', utr: [600, 600, 600], tier: 'goat' },
  { captain: 'Bala', a1: 'Bala Alpha Nair', a2: 'Bala Beta Nair', utr: [650, 600, 600], tier: 'goat' },
  { captain: 'Chetan', a1: 'Chetan Alpha Iyer', a2: 'Chetan Beta Iyer', utr: [700, 650, 600], tier: 'goat' },
  { captain: 'Deepak', a1: 'Deepak Alpha Shah', a2: 'Deepak Beta Shah', utr: [400, 400, 450], tier: 'rising' },
  { captain: 'Esha', a1: 'Esha Alpha Menon', a2: 'Esha Beta Menon', utr: [500, 450, 500], tier: 'rising' }
].map((t, i) => ({ ...t, payload: {
  teamId: `demo-${randomUUID()}`, whatsappPhone: `+1555000${1000 + i}`, ace1Phone: `+1555000${2000 + i}`, ace2Phone: `+1555000${3000 + i}`,
  captain: { firstName: t.captain, lastName: `${t.captain}son`, singlesUtr: t.utr[0], doublesUtr: null }, ace1: { fullName: t.a1, singlesUtr: t.utr[1], doublesUtr: null }, ace2: { fullName: t.a2, singlesUtr: t.utr[2], doublesUtr: null },
  selectedTier: 'higher', consent: true, rulesAccepted: true } }));

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) failed++; };

const visitor = new Client();
console.log(`Demo server: ${base}`);
const session = await visitor.call('session').catch(() => null);
if (!session?.ok) { console.error('Cannot reach the demo. Start it first with ./run-local.sh, then run this again.'); process.exit(2); }

console.log('\nRegistering 5 teams');
const logins = new Map();
for (const team of TEAMS) {
  const browser = new Client(); await browser.call('session');                 // each team from its own browser: one browser may register only a few
  const result = await browser.call('register', team.payload);
  const { assignedTier, login } = result.json;
  check(`${team.captain}’s team registered in ${team.tier.toUpperCase()} with a login`, result.ok && assignedTier === team.tier && /^[a-z]{7}\d?$/.test(login?.username || '') && /^[a-z]{6}\d{4}$/.test(login?.password || ''), `${result.status} ${result.text.slice(0, 120)}`);
  logins.set(team.payload.teamId, login);
}

console.log('\nOne browser cannot register unlimited teams');
const greedy = new Client(); await greedy.call('session');
const attempts = [];
for (let i = 0; i < 4; i++) attempts.push(await greedy.call('register', { ...structuredClone(TEAMS[0].payload), teamId: `demo-${randomUUID()}` }));
check('the first three teams from one browser are accepted', attempts.slice(0, 3).every(r => r.ok), attempts.map(r => r.status).join());
check('a fourth team from the same browser is refused', !attempts[3].ok && /already registered 3 teams/.test(attempts[3].text), `${attempts[3].status} ${attempts[3].text.slice(0, 100)}`);

console.log('\nRules that must reject');
const bad = async (name, mutate, expected) => {
  const payload = structuredClone(TEAMS[0].payload); payload.teamId = `demo-${randomUUID()}`; mutate(payload);
  const result = await visitor.call('register', payload);
  check(name, !result.ok && expected.test(result.text), `${result.status} ${result.text.slice(0, 120)}`);
};
await bad('combined UTR below the lowest tier is refused', p => { p.captain.singlesUtr = 300; p.ace1.singlesUtr = 300; p.ace2.singlesUtr = 300; }, /qualify|tier/i);
await bad('registering without consent is refused', p => { p.consent = false; }, /consent/i);
await bad('registering without accepting the rules is refused', p => { p.rulesAccepted = false; }, /rules/i);
await bad('a missing WhatsApp number is refused', p => { delete p.ace2Phone; }, /whatsapp/i);
const duplicate = structuredClone(TEAMS[0].payload); duplicate.captain.firstName = 'Different';
const dup = await visitor.call('register', duplicate);
check('re-using a team ID with different details is refused', !dup.ok, `${dup.status} ${dup.text.slice(0, 120)}`);

console.log('\nPublic view');
const pub = await visitor.call('public');
const publicTeams = Object.entries(pub.json.tiers || {}).flatMap(([tier, value]) => Object.values(value.teams || {}).map(t => ({ ...t, tier })));
for (const team of TEAMS) {
  const found = publicTeams.find(t => t.teamId === team.payload.teamId);
  check(`${team.captain}’s team is listed under ${team.tier.toUpperCase()}`, found?.tier === team.tier && found.captainFirstName === team.captain, found ? `listed under ${found.tier}` : 'not listed');
}
const leaked = ['Alpha', 'Beta', '+1555000', '15550001', '15550002'].filter(secret => pub.text.includes(secret));
check('public data contains no ace names or phone numbers', leaked.length === 0, `found: ${leaked.join(', ')}`);
const anonPrivate = await visitor.call('registrations');
check('anonymous visitors cannot read private registrations', anonPrivate.status === 403);

console.log('\nCaptain logins');
const [first] = TEAMS, firstLogin = logins.get(first.payload.teamId);
const wrong = await new Client().call('captain-login', { username: firstLogin.username, password: 'wrongpwd' });
check('a wrong password is refused', wrong.status === 401, `${wrong.status}`);
const captain = new Client(); await captain.call('session');
const signedIn = await captain.call('captain-login', { username: firstLogin.username, password: firstLogin.password });
check('the captain signs in with the generated login', signedIn.ok && signedIn.json.captain === true && signedIn.json.admin === false, `${signedIn.status} ${signedIn.text.slice(0, 100)}`);
const mine = await captain.call('my-teams');
check('the captain sees only their own team', Object.keys(mine.json).length === 1 && mine.json[first.payload.teamId] === true, JSON.stringify(mine.json));
const privateRead = await captain.call('registrations');
check('a captain cannot read all private registrations', privateRead.status === 403);
const other = TEAMS[1].payload.teamId;
const stolen = await captain.call('update-team', { ...TEAMS[1].payload, teamId: other, captain: { firstName: 'Hacker', singlesUtr: 600, doublesUtr: null } });
check('a captain cannot edit another team', !stolen.ok, `${stolen.status} ${stolen.text.slice(0, 100)}`);

console.log('\nAdmin view');
const admin = new Client(); await admin.call('session');
const login = await admin.call('login', { username: adminUser, password: adminPassword });
check('admin signs in', login.ok, `${login.status} ${login.text.slice(0, 100)} (set TRAICE_ADMIN_PASSWORD to the demo's password)`);
if (login.ok) {
  const regs = (await admin.call('registrations')).json;
  for (const team of TEAMS) {
    const reg = regs[team.payload.teamId];
    check(`${team.captain}’s private record has names and phones`, reg?.ace1?.fullName === team.a1 && reg.whatsappPhone === team.payload.whatsappPhone && reg.combinedUtr === team.utr.reduce((a, b) => a + b, 0));
  }
  check('the admin sees each captain username but never a password', TEAMS.every(t => regs[t.payload.teamId].captainUsername === logins.get(t.payload.teamId).username) && !JSON.stringify(regs).includes(firstLogin.password));
  const reset = await admin.call('reset-captain-login', { teamId: first.payload.teamId });
  check('the admin can reset a login (same username, new password)', reset.ok && reset.json.username === firstLogin.username && reset.json.password && reset.json.password !== firstLogin.password, `${reset.status} ${reset.text.slice(0, 100)}`);
  const oldPassword = await new Client().call('captain-login', { username: firstLogin.username, password: firstLogin.password });
  check('the old password stops working after a reset', oldPassword.status === 401);
  const newPassword = await new Client().call('captain-login', { username: firstLogin.username, password: reset.json.password });
  check('the new password works', newPassword.ok);
  const notAdmin = await visitor.call('reset-captain-login', { teamId: first.payload.teamId });
  check('only the admin can reset a login', notAdmin.status === 403, `${notAdmin.status}`);
  if (withFixtures) {
    console.log('\nFixtures');
    const result = await admin.call('generate-fixtures', { tierId: 'goat' });
    check('round-robin fixtures can be generated for GOAT', result.ok, `${result.status} ${result.text.slice(0, 160)}`);
  }
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed. Open the Tier list in the browser to see the 5 teams.');
process.exit(failed ? 1 : 0);
