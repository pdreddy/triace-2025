// Adds the players registered in Triace to the shared PPRC list: players already there are marked as playing in Triace,
// new players with a full name are created (seeded from their UTR). Export the file from Triace admin > PPRC players.
//   node scripts/import-triace-players.mjs <triace-players.json> --database-url <url>            (plan only)
//   node scripts/import-triace-players.mjs <triace-players.json> --database-url <url> --write    (needs GOOGLE_APPLICATION_CREDENTIALS)
import fs from 'node:fs';
import { planTriacePlayers, runTriaceImport } from '../functions/lib/pprcImport.js';
import { openDatabase } from './lib/rtdb.mjs';

const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const urlAt = args.indexOf('--database-url') + 1;
const file = args.find((a, i) => !a.startsWith('--') && i !== urlAt), url = opt('--database-url'), write = args.includes('--write');
if (!file || !url) { console.error('Usage: node scripts/import-triace-players.mjs <triace-players.json> --database-url <url> [--write]'); process.exit(1); }
const entries = JSON.parse(fs.readFileSync(file, 'utf8')).players;

try {
  const db = await openDatabase(url);
  let summary;
  if (write) ({ summary } = await runTriaceImport(db, entries));
  else {
    const [nameIndex, playerList] = await Promise.all([db.ref('pprcMaster/nameIndex').once('value'), db.ref('pprcMaster/playerList').once('value')]);
    ({ summary } = planTriacePlayers(entries, { nameIndex: nameIndex.val() || {}, playerList: playerList.val() || {} }));
  }
  console.log(`${entries.length} registered players: ${summary.marked.length} already in PPRC, ${summary.created.length} to create, ${summary.skipped.length} skipped`);
  for (const c of summary.created) console.log(`  create  ${c.name}`);
  for (const s of summary.skipped) console.log(`  skip    ${s.label}: ${s.reason}`);
  console.log(write ? '\nDone.' : '\nPlan only (this only read the database). Add --write to apply.');
  process.exit(0);
} catch (error) { console.error(`Failed: ${error.message}`); process.exit(4); }
