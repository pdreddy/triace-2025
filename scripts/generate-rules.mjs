// Rewrites the database root key in database.rules.json for a custom root.
// Usage: TRAICE_DB_ROOT=clubs/triace node scripts/generate-rules.mjs   (a nested root becomes nested rule keys)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveDbPaths, DEFAULT_DB_ROOT } from '../functions/lib/paths.js';

const { root } = resolveDbPaths({ root: process.env.TRAICE_DB_ROOT, season1: process.env.TRAICE_DB_SEASON1_PATH });
const file = new URL('../database.rules.json', import.meta.url), rules = JSON.parse(readFileSync(file, 'utf8'));
const current = Object.keys(rules.rules).find(key => !key.startsWith('.'));
if (current === root) { console.log(`Rules already use “${root}”.`); process.exit(0); }
const body = rules.rules[current];
delete rules.rules[current];
let node = rules.rules; const parts = root.split('/');
parts.slice(0, -1).forEach(part => { node = node[part] ||= {}; });
node[parts.at(-1)] = body;
writeFileSync(file, `${JSON.stringify(rules, null, 2)}\n`);
console.log(`database.rules.json now uses “${root}” (was “${current}”). Merge it into the shared project's rules before deploying.`);
