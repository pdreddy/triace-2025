// Builds the merged rules file that `npm run rules:deploy` needs, without editing JSON by hand.
// It downloads the LIVE rules of the shared project (read-only, with the service-account key), replaces only this
// app's own subtree (the database root, e.g. traice2_0) with the generated rules in database.rules.json, and writes the
// result to a file for you to review. Every other app's rules are kept exactly as they are. It deploys nothing.
//
//   export GOOGLE_APPLICATION_CREDENTIALS=~/Desktop/<key>.json
//   node scripts/merge-rules.mjs --database-url <url> --out ~/Desktop/merged-rules.json
//   npm run rules:deploy -- --project <project-id> --rules ~/Desktop/merged-rules.json --confirm-merged
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolveDbPaths } from '../functions/lib/paths.js';

const SHARED_PUBLIC = ['pprcMaster', 'pprcClubs'];   // public PPRC data: added only when the live rules do not have them yet
// Pure. Returns { merged, report: { kept, replaced, added, ladderWasLive } }.
export function mergeRules(live, generated, root) {
  if (!live?.rules || typeof live.rules !== 'object') throw new Error('The live rules could not be read as a rules object.');
  const parts = root.split('/'), ours = parts.reduce((node, key) => node?.[key], generated.rules);
  if (!ours) throw new Error(`database.rules.json has no rules for “${root}”. Run npm run rules:generate first.`);
  const merged = structuredClone(live);
  let node = merged.rules;
  for (const part of parts.slice(0, -1)) node = node[part] ||= {};
  const before = node[parts.at(-1)];
  node[parts.at(-1)] = structuredClone(ours);
  const added = [];
  for (const key of SHARED_PUBLIC) if (merged.rules[key] === undefined && generated.rules[key] !== undefined) { merged.rules[key] = structuredClone(generated.rules[key]); added.push(key); }
  const kept = Object.keys(live.rules).filter(key => key !== parts[0] && !key.startsWith('.'));
  const children = value => Object.keys(value || {}).filter(key => !key.startsWith('.'));
  return { merged, report: { kept, replaced: root, added, newUnderRoot: children(ours).filter(key => !children(before).includes(key)), removedUnderRoot: children(before).filter(key => !children(ours).includes(key)) } };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const url = opt('--database-url'), out = (opt('--out') || '').replace(/^~(?=\/)/, os.homedir());
  if (!url || !out) { console.error('Usage: node scripts/merge-rules.mjs --database-url <url> --out <file outside the repo> [--root traice2_0]'); process.exit(1); }
  try {
    const { openDatabase } = await import('./lib/rtdb.mjs');
    const db = await openDatabase(url), root = resolveDbPaths({ root: opt('--root') }).root;
    const generated = JSON.parse(fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'));
    const { merged, report } = mergeRules(await db.getRulesJSON(), generated, root);
    fs.writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
    console.log(`Written: ${out}  (nothing was deployed)`);
    console.log(`  Replaced with this app's rules:  ${report.replaced}`);
    console.log(`  New under ${root}:               ${report.newUnderRoot.join(', ') || 'nothing'}`);
    if (report.removedUnderRoot.length) console.log(`  No longer under ${root}:         ${report.removedUnderRoot.join(', ')}   <- check these were not in use`);
    if (report.added.length) console.log(`  Added (public PPRC data):        ${report.added.join(', ')}`);
    console.log(`  Kept exactly as live:            ${report.kept.join(', ') || 'nothing else'}`);
    console.log('\nReview the file, then deploy it:\n  npm run rules:deploy -- --project <project-id> --rules ' + out + ' --confirm-merged');
    process.exit(0);
  } catch (error) { console.error(`Failed: ${error.message}`); process.exit(4); }
}
