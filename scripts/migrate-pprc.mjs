// Dry run: reads a Realtime Database export and writes the multi-club tree and a report to a local folder.
// It never talks to Firebase.
//   node scripts/migrate-pprc.mjs <export.json> <out-dir> [decisions.csv | overrides.json]
//
// Names it cannot settle are written to name-decisions.csv (raw name, team, how often, candidates, decision).
// Type the player's full name in the `decision` column and run again with that file. A decision applies to
// that name for that team only; leave `team` empty for "this name always means this person".
// overrides.json also works: { "Team A4::Vinod": "Vinod Aripaka", "Kalam": { "name": "Kalam Shaik", "singles": 4.5 } }.
import fs from 'node:fs';
import path from 'node:path';
import { buildMultiClub, reportText } from '../functions/lib/pprcMigrate.js';
import { nameKey } from '../functions/lib/pprc.js';
import { renderDecisionPage } from './name-decisions-page.mjs';

const csvLine = cells => cells.map(c => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',');
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function loadDecisions(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return JSON.parse(text);
  const [head, ...rows] = parseCsv(text), col = name => head.indexOf(name), out = {};
  for (const r of rows) { const decision = (r[col('decision')] || '').trim(); if (decision) out[r[col('team')] ? `${r[col('team')]}::${r[col('raw')]}` : r[col('raw')]] = decision; }
  return out;
}

const [input, out, decisionsFile] = process.argv.slice(2);
if (!input || !out) { console.error('Usage: node scripts/migrate-pprc.mjs <export.json> <out-dir> [decisions.csv | overrides.json]'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const { tree, report } = buildMultiClub(data, { overrides: decisionsFile ? loadDecisions(decisionsFile) : {} });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'multiclub.json'), JSON.stringify(tree));
fs.writeFileSync(path.join(out, 'report.md'), reportText(report));
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));

const people = tree.pprcMaster.players, rows = new Map();
// "Durga" and "DURGA" are the same name: one row per team and name, however it was capitalised or spaced.
for (const d of report.decisions) {
  const key = `${nameKey(d.team)}\u0000${nameKey(d.raw)}`, row = rows.get(key) || { ...d, count: 0, examples: [], variants: new Set() };
  row.count++; row.variants.add(String(d.raw).trim()); if (row.examples.length < 3) row.examples.push(d.ctx); rows.set(key, row);
}
const sorted = [...rows.values()].sort((a, b) => a.team.localeCompare(b.team) || b.count - a.count);
fs.writeFileSync(path.join(out, 'name-decisions.csv'), [csvLine(['raw', 'team', 'matches', 'kind', 'candidates', 'decision']), ...sorted.map(d => csvLine([d.raw, d.team, d.count, d.kind, d.candidates.map(id => people[id]?.name || id).join(' | '), '']))].join('\n') + '\n');
const page = renderDecisionPage({
  rows: sorted.map(d => ({ raw: d.raw, label: [...d.variants].join(' / '), team: d.team, count: d.count, kind: d.kind, candidates: d.candidates.map(id => people[id]?.name || id), examples: d.examples })),
  players: Object.values(people).map(p => p.name).sort((a, b) => a.localeCompare(b))
});
fs.writeFileSync(path.join(out, 'name-decisions.html'), page);
console.log(reportText(report).split('\n').slice(0, 30).join('\n'));
console.log(`\n${sorted.length} names need a decision (see name-decisions.csv).\nWritten to ${out}: multiclub.json, report.md, report.json, name-decisions.csv, name-decisions.html (nothing was sent to Firebase).`);
