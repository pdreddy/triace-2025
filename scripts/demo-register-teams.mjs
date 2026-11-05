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
  captain: { firstName: t.captain, singlesUtr: t.utr[0], doublesUtr: null }, ace1: { fullName: t.a1, singlesUtr: t.utr[1], doublesUtr: null }, ace2: { fullName: t.a2, singlesUtr: t.utr[2], doublesUtr: null },
  selectedTier: 'higher', consent: true, rulesAccepted: true } }));

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) failed++; };

const visitor = new Client();
console.log(`Demo server: ${base}`);
const session = await visitor.call('session').catch(() => null);
if (!session?.ok) { console.error('Cannot reach the demo. Start it first with ./run-local.sh, then run this again.'); process.exit(2); }

console.log('\nRegistering 5 teams');
const codes = new Map();
for (const team of TEAMS) {
  const result = await visitor.call('register', team.payload);
  const { assignedTier, captainCode } = result.json;
  check(`${team.captain}’s team registered in ${team.tier.toUpperCase()}`, result.ok && assignedTier === team.tier && !!captainCode, `${result.status} ${result.text.slice(0, 120)}`);
  codes.set(team.payload.teamId, captainCode);
}

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
  if (withFixtures) {
    console.log('\nFixtures');
    const result = await admin.call('generate-fixtures', { tierId: 'goat' });
    check('round-robin fixtures can be generated for GOAT', result.ok, `${result.status} ${result.text.slice(0, 160)}`);
  }
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed. Open the Tier list in the browser to see the 5 teams.');
process.exit(failed ? 1 : 0);
