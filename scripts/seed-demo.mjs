// Puts sample registered teams into the local demo, so it is not empty on the first run.
//   node scripts/seed-demo.mjs [--tree .local-migration/multiclub.json] [--dir .local-demo] [--teams 8] [--reset]
// Fills an empty demo (or, with --reset, replaces what is there). With a PPRC tree the sample players are real PPRC players (with their ratings); without one they are made up.
// Real registrations live in the live Firebase project; export them from the live admin (Private registrations) if you
// want those, they cannot be read from here.
import fs from 'node:fs';
import path from 'node:path';
import { buildDemoState } from '../functions/lib/demoSeed.js';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const treeFile = path.resolve(opt('--tree', '.local-migration/multiclub.json')), dir = path.resolve(opt('--dir', process.env.TRAICE_DEMO_DATA_DIR || '.local-demo')), teams = Number(opt('--teams', 8)), reset = args.includes('--reset');
const file = path.join(dir, 'state.json');
// A demo that already has registered teams is left alone; one that is empty (e.g. started once before) is filled.
const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const have = Object.keys(existing?.registrations || {}).length;
if (have && !reset) { console.log(`The demo already has ${have} registered teams (${file}). Use --reset to replace them with the sample teams.`); process.exit(0); }
const tree = fs.existsSync(treeFile) ? JSON.parse(fs.readFileSync(treeFile, 'utf8')) : null;
const { state, summary } = buildDemoState(tree, { teams, base: reset ? null : existing });
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
console.log(`Seeded ${summary.teams} registered teams${tree ? ` from the PPRC data (${summary.linked} players linked to PPRC)` : ' with made-up players (no PPRC data found, so no links)'}.`);
