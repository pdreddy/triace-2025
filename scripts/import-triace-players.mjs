// Adds the players registered in Triace to the shared PPRC list: players already there are marked as playing in Triace,
// new players with a full name are created (seeded from their UTR). Export the file from Triace admin > PPRC players.
//   node scripts/import-triace-players.mjs <triace-players.json> --database-url <url>            (plan only)
//   node scripts/import-triace-players.mjs <triace-players.json> --database-url <url> --write    (needs GOOGLE_APPLICATION_CREDENTIALS)
import fs from 'node:fs';
import { planTriacePlayers, clean } from '../functions/lib/pprcImport.js';

const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--database-url'), url = opt('--database-url'), write = args.includes('--write');
if (!file || !url) { console.error('Usage: node scripts/import-triace-players.mjs <triace-players.json> --database-url <url> [--write]'); process.exit(1); }
const entries = JSON.parse(fs.readFileSync(file, 'utf8')).players;

const { default: admin } = await import('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), databaseURL: url });
const db = admin.database();
const [nameIndex, playerList] = await Promise.all([db.ref('pprcMaster/nameIndex').once('value'), db.ref('pprcMaster/playerList').once('value')]);
const { writes, summary } = planTriacePlayers(entries, { nameIndex: nameIndex.val() || {}, playerList: playerList.val() || {} });

console.log(`${entries.length} registered players: ${summary.marked.length} already in PPRC, ${summary.created.length} to create, ${summary.skipped.length} skipped`);
for (const c of summary.created) console.log(`  create  ${c.name}`);
for (const s of summary.skipped) console.log(`  skip    ${s.label}: ${s.reason}`);
if (!write) { console.log('\nPlan only. Nothing was sent. Add --write to apply.'); process.exit(0); }
await db.ref().update(clean(writes));
await db.ref(`importLog/${Date.now()}`).set({ at: Date.now(), source: 'triace registrations', created: summary.created.length, marked: summary.marked.length, skipped: summary.skipped.length });
console.log('\nDone.');
process.exit(0);
