// Read-only: shows the SHAPE of part of the Realtime Database (key names and how many children), never the values,
// so nothing private is printed. It writes nothing.
//   node scripts/inspect-db.mjs <path> --database-url <url> [--depth 3]      e.g. path "clubs" or "pprcMaster"
import { openDatabase } from './lib/rtdb.mjs';

const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const urlAt = args.indexOf('--database-url') + 1, depthAt = args.indexOf('--depth') + 1;
const path = args.find((a, i) => !a.startsWith('--') && i !== urlAt && i !== depthAt), url = opt('--database-url'), maxDepth = Number(opt('--depth')) || 3;
if (!path || !url) { console.error('Usage: node scripts/inspect-db.mjs <path> --database-url <url> [--depth 3]'); process.exit(1); }

const kind = v => (v === null ? 'empty' : Array.isArray(v) ? `list of ${v.length}` : typeof v === 'object' ? `${Object.keys(v).length} keys` : typeof v);
function show(value, name, depth, indent = '') {
  console.log(`${indent}${name}  (${kind(value)})`);
  if (value && typeof value === 'object' && depth < maxDepth) {
    const entries = Object.entries(value);
    for (const [key, child] of entries.slice(0, 12)) show(child, key, depth + 1, indent + '  ');
    if (entries.length > 12) console.log(`${indent}  … and ${entries.length - 12} more`);
  }
}
try {
  const db = await openDatabase(url);
  const value = (await db.ref(path).once('value')).val();
  if (value === null) console.log(`${path} is empty.`); else show(value, path, 0);
  process.exit(0);
} catch (error) { console.error(`Failed: ${error.message}`); process.exit(4); }
