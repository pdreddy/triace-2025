// Writes the migration tree (multiclub.json from migrate-pprc.mjs) into the multi-club Realtime Database.
//   node scripts/import-pprc.mjs <multiclub.json> --database-url https://<project>-default-rtdb.firebaseio.com           (plan only)
//   node scripts/import-pprc.mjs <multiclub.json> --database-url … --write [--replace] [--only pprcMaster,clubs]
// Needs a service account: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (the key never goes in the repo).
// Safety: without --write nothing is sent. It refuses to touch a section that already has data unless --replace is
// given, and with --replace it first saves what was there to a local backup file.
import fs from 'node:fs';
import path from 'node:path';
import { planImport, batches, clean } from '../functions/lib/pprcImport.js';

const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--database-url' && args[args.indexOf(a) - 1] !== '--only' && args[args.indexOf(a) - 1] !== '--backup-dir');
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const url = opt('--database-url'), write = args.includes('--write'), replace = args.includes('--replace');
const only = opt('--only')?.split(','), backupDir = opt('--backup-dir') || '.local-migration';
if (!file || !url) { console.error('Usage: node scripts/import-pprc.mjs <multiclub.json> --database-url <url> [--write] [--replace] [--only a,b]'); process.exit(1); }

const tree = JSON.parse(fs.readFileSync(file, 'utf8'));
const plan = planImport(tree, { only });
console.log(`Target: ${url}`);
for (const [section, s] of Object.entries(plan.stats)) console.log(`  ${section}: ${s.paths} paths, ${(s.bytes / 1024).toFixed(0)} KB`);
if (plan.problems.length) { console.error('Problems:\n' + plan.problems.slice(0, 20).join('\n')); process.exit(2); }
if (!write) { console.log('\nPlan only. Nothing was sent. Add --write to import.'); process.exit(0); }

const { default: admin } = await import('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), databaseURL: url });
const db = admin.database();

const existing = {};
for (const section of plan.sections) { const snap = await db.ref(section).once('value'); existing[section] = snap.val(); }
const occupied = plan.sections.filter(s => existing[s] != null);
if (occupied.length && !replace) { console.error(`Already has data: ${occupied.join(', ')}. Nothing was written. Use --replace to overwrite (a backup is saved first).`); process.exit(3); }
if (occupied.length) {
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify(Object.fromEntries(occupied.map(s => [s, existing[s]]))));
  console.log(`Saved the existing ${occupied.join(', ')} to ${backup}`);
  for (const s of occupied) await db.ref(s).remove();
}
let done = 0;
for (const batch of batches(plan.paths, 200)) { await db.ref().update(clean(batch)); done += Object.keys(batch).length; process.stdout.write(`\r${done}/${Object.keys(plan.paths).length} paths written`); }
await db.ref(`importLog/${Date.now()}`).set({ at: Date.now(), sections: plan.sections, stats: plan.stats, source: path.basename(file) });
console.log('\nDone.');
process.exit(0);
