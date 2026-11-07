// Writes the migration tree (multiclub.json from migrate-pprc.mjs) into the multi-club Realtime Database.
//   node scripts/import-pprc.mjs <multiclub.json> --database-url https://<project>-default-rtdb.firebaseio.com           (plan only)
//   node scripts/import-pprc.mjs <multiclub.json> --database-url … --write [--replace] [--only pprcMaster,clubs]
// Needs a service account: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (the key never goes in the repo).
// Safety: without --write nothing is sent. It refuses to touch a section that already has data unless --replace is
// given, and with --replace it first saves what was there to a local backup file.
import fs from 'node:fs';
import path from 'node:path';
import { planImport, runImport, ImportRefused } from '../functions/lib/pprcImport.js';
import { openDatabase } from './lib/rtdb.mjs';

const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const skip = new Set(['--database-url', '--only', '--backup-dir'].map(f => args.indexOf(f) + 1).filter(i => i > 0));
const file = args.find((a, i) => !a.startsWith('--') && !skip.has(i));
const url = opt('--database-url'), write = args.includes('--write'), replace = args.includes('--replace');
const only = opt('--only')?.split(','), backupDir = opt('--backup-dir') || '.local-migration';
if (!file || !url) { console.error('Usage: node scripts/import-pprc.mjs <multiclub.json> --database-url <url> [--write] [--replace] [--only a,b]'); process.exit(1); }

const tree = JSON.parse(fs.readFileSync(file, 'utf8'));
const plan = planImport(tree, { only });
console.log(`Target: ${url}`);
for (const [section, s] of Object.entries(plan.stats)) console.log(`  ${section}: ${s.paths} paths, ${(s.bytes / 1024).toFixed(0)} KB`);
if (plan.problems.length) { console.error('Problems:\n' + plan.problems.slice(0, 20).join('\n')); process.exit(2); }
if (!write) { console.log('\nPlan only. Nothing was sent. Add --write to import.'); process.exit(0); }

try {
  const db = await openDatabase(url);
  const result = await runImport(db, tree, {
    only, replace, source: path.basename(file),
    saveBackup: existing => {
      fs.mkdirSync(backupDir, { recursive: true });
      const backup = path.join(backupDir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(backup, JSON.stringify(existing)); console.log(`Saved the existing ${Object.keys(existing).join(', ')} to ${backup}`);
      return backup;
    },
    progress: (done, total) => process.stdout.write(`\r${done}/${total} paths written`)
  });
  console.log(`\nDone: ${result.written} paths written.`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof ImportRefused ? error.message : `Import failed: ${error.message}`);
  process.exit(error instanceof ImportRefused ? 3 : 4);
}
