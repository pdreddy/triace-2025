// Writes database.rules.json from database.rules.template.json for the configured paths.
//   node scripts/generate-rules.mjs            (reads VITE_DB_ROOT / VITE_DB_SEASON1_PATH from .env, .env.local, then the shell)
//   node scripts/generate-rules.mjs --check    (exit 1 if database.rules.json does not match; used by npm run preflight)
// Re-run it, then deploy (npm run rules:deploy), whenever you change a database path.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildRules } from '../functions/lib/rules.js';

const parseEnv = text => Object.fromEntries(text.split('\n').map(l => l.trim()).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const file = name => new URL(`../${name}`, import.meta.url);
const read = name => (existsSync(file(name)) ? readFileSync(file(name), 'utf8') : '');
export const configuredPaths = (env = process.env) => {
  const merged = { ...parseEnv(read('.env')), ...parseEnv(read('.env.local')), ...env };
  return { root: merged.VITE_DB_ROOT || merged.TRAICE_DB_ROOT, season1: merged.VITE_DB_SEASON1_PATH || merged.TRAICE_DB_SEASON1_PATH };
};

const paths = configuredPaths();
const wanted = `${JSON.stringify(buildRules(JSON.parse(read('database.rules.template.json')), paths), null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (read('database.rules.json') === wanted) { console.log('database.rules.json matches the configured paths.'); process.exit(0); }
  console.error('database.rules.json does not match the configured database paths. Run: npm run rules:generate');
  process.exit(1);
}
writeFileSync(file('database.rules.json'), wanted);
console.log(`database.rules.json written for root “${paths.root || 'traice2_0'}”. Merge it into the shared project's rules, then deploy: npm run rules:deploy`);
