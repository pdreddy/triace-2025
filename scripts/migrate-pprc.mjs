// Dry run: reads a Realtime Database export and writes the multi-club tree and a report to a local folder.
// It never talks to Firebase. Usage: node scripts/migrate-pprc.mjs <export.json> <out-dir> [overrides.json]
// overrides.json maps a name as written in old matches to an existing player id, or to a new person:
//   { "Vinod A": "p_vinod_aripaka", "Kalam": { "name": "Abdul Kalam", "singles": 4.5 } }
// Empty values are ignored, so overrides.todo.json (written next to the report) can be filled in and passed back as is.
import fs from 'node:fs';
import path from 'node:path';
import { buildMultiClub, reportText } from '../functions/lib/pprcMigrate.js';

const [input, out, overridesFile] = process.argv.slice(2);
if (!input || !out) { console.error('Usage: node scripts/migrate-pprc.mjs <export.json> <out-dir> [overrides.json]'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const overrides = overridesFile ? JSON.parse(fs.readFileSync(overridesFile, 'utf8')) : {};
const { tree, report } = buildMultiClub(data, { overrides });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'multiclub.json'), JSON.stringify(tree));
fs.writeFileSync(path.join(out, 'report.md'), reportText(report));
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
const todo = Object.fromEntries([...Object.keys(report.names.ambiguous), ...Object.keys(report.names.unresolved), ...Object.keys(report.names.similar)].sort().map(n => [n, '']));
fs.writeFileSync(path.join(out, 'overrides.todo.json'), JSON.stringify(todo, null, 1));
console.log(reportText(report).split('\n').slice(0, 30).join('\n'));
console.log(`\nWritten to ${out}: multiclub.json, report.md, report.json, overrides.todo.json (nothing was sent to Firebase).`);
