// Go-live preflight. Checks everything that can be checked from this repo before you deploy:  npm run preflight
// Things that need your Firebase / Netlify accounts are listed in docs/GO_LIVE.md.
import { readFileSync, existsSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { resolveDbPaths } from '../functions/lib/paths.js';
import { buildRules } from '../functions/lib/rules.js';

let failed = 0, warned = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
const bad = (name, detail = '') => { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failed++; };
const warn = (name, detail = '') => { console.log(`  ! ${name}${detail ? ` — ${detail}` : ''}`); warned++; };
const check = (name, pass, detail) => (pass ? ok(name) : bad(name, detail));
const read = file => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const parseEnv = text => Object.fromEntries(text.split('\n').map(l => l.trim()).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const git = cmd => { try { return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

console.log('Runtime');
check('Node 22.12 or newer', Number(process.versions.node.split('.')[0]) >= 22, `this is ${process.version}`);

console.log('\nFirebase web configuration');
const KEYS = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_DATABASE_URL', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID'];
const dotenv = parseEnv(read('.env')), netlify = parseEnv(read('netlify.toml').replace(/ = /g, '='));
check('.env has all seven Firebase values', KEYS.every(k => dotenv[k]), `missing: ${KEYS.filter(k => !dotenv[k]).join(', ')}`);
check('netlify.toml has the same values as .env', KEYS.every(k => dotenv[k] && dotenv[k] === netlify[k]), `differs: ${KEYS.filter(k => dotenv[k] !== netlify[k]).join(', ')}`);
check('emulators are off for production', dotenv.VITE_USE_EMULATORS !== 'true' && netlify.VITE_USE_EMULATORS === 'false');
check('database URL belongs to the same project', !dotenv.VITE_FIREBASE_DATABASE_URL || dotenv.VITE_FIREBASE_DATABASE_URL.includes(dotenv.VITE_FIREBASE_PROJECT_ID), dotenv.VITE_FIREBASE_DATABASE_URL);
console.log(`    project: ${dotenv.VITE_FIREBASE_PROJECT_ID || '—'}`);

console.log('\nDatabase paths');
const fnEnv = parseEnv(read('functions/.env'));
let paths, fnPaths;
const webEnv = { ...dotenv, ...parseEnv(read('.env.local')), ...process.env };   // same precedence Vite uses
try { paths = resolveDbPaths({ root: webEnv.VITE_DB_ROOT, season1: webEnv.VITE_DB_SEASON1_PATH }); ok(`web app paths valid (${paths.root}, ${paths.season1})`); } catch (e) { bad('web app paths', e.message); }
try { fnPaths = resolveDbPaths({ root: process.env.TRAICE_DB_ROOT || fnEnv.TRAICE_DB_ROOT, season1: process.env.TRAICE_DB_SEASON1_PATH || fnEnv.TRAICE_DB_SEASON1_PATH }); ok(`functions paths valid (${fnPaths.root}, ${fnPaths.season1})`); } catch (e) { bad('functions paths', e.message); }
if (paths && fnPaths) check('web app and functions use the same paths', paths.root === fnPaths.root && paths.season1 === fnPaths.season1, `web ${paths.root} | ${paths.season1} vs functions ${fnPaths.root} | ${fnPaths.season1}`);
if (!existsSync('functions/.env')) warn('functions/.env is missing', 'defaults are used (traice2_0). Copy functions/.env.example if you changed the web paths.');

console.log('\nDatabase rules');
if (paths) {
  try {
    const wanted = `${JSON.stringify(buildRules(JSON.parse(read('database.rules.template.json')), paths), null, 2)}\n`;
    check('database.rules.json is generated for these paths (not edited by hand)', read('database.rules.json') === wanted, 'run npm run rules:generate, then npm run rules:deploy');
  } catch (e) { bad('rules template', e.message); }
}
let rules;
try { rules = JSON.parse(read('database.rules.json')).rules; ok('database.rules.json is valid JSON'); } catch (e) { bad('database.rules.json is valid JSON', e.message); }
if (rules && paths) {
  const node = paths.root.split('/').reduce((n, part) => n?.[part], rules);
  check(`rules exist for the database root “${paths.root}”`, !!node);
  check('nothing above the root grants public read or write', ![rules, ...paths.root.split('/').slice(0, -1).reduce((acc, p) => [...acc, (acc.at(-1) || rules)[p]], [])].some(n => n?.['.read'] === true || n?.['.write'] === true));
  check('private registrations are admin or owner only', node?.registrations?.['.read']?.includes('admin') && !node.registrations['.write']);
  check('Season 1 is publicly readable (inside the root, or add your own rule)', node?.[paths.season1.slice(paths.root.length + 1)]?.['.read'] === true || !paths.season1UnderRoot);
  const writes = []; (function walk(n) { for (const [k, v] of Object.entries(n || {})) { if (k === '.write') writes.push(v); else if (v && typeof v === 'object') walk(v); } })(rules);
  check('clients cannot write anywhere (every .write rule is false)', writes.length > 0 && writes.every(w => w === false), `found: ${JSON.stringify(writes)}`);
}

console.log('\nHosting and functions config');
const firebase = JSON.parse(read('firebase.json') || '{}');
check('firebase.json deploys functions, database rules and hosting', !!firebase.functions && !!firebase.database && !!firebase.hosting);
check('hosting publishes dist and rewrites every route', firebase.hosting?.public === 'dist' && firebase.hosting?.rewrites?.some(r => r.source === '**'));
check('functions run on Node 22', JSON.stringify(firebase.functions).includes('nodejs22'));
check('importSeason1 and bootstrapTournament are exported', /export const importSeason1/.test(read('functions/index.js')) && /export const bootstrapTournament/.test(read('functions/index.js')));

console.log('\nSecrets and demo files');
const tracked = git('ls-files').split('\n');
check('no demo data or local env files are committed', !tracked.some(f => /^\.local-demo\/|\.env\.demo\.local$|\.env\.local$/.test(f)));
check('no service-account keys are committed', !tracked.some(f => /\.json$/.test(f) && /"private_key"/.test(read(f))));
check('the demo server is not part of the production build', !existsSync('dist/index.html') || !read('dist/index.html').includes('demo-plugin'));
if (/Winter#2026!/.test(read('README.md'))) warn('README still lists the temporary admin password', 'create the admin with a unique password in Firebase and delete it from the README before launch');
if (!tracked.includes('functions/package-lock.json')) warn('functions/package-lock.json is not committed');

console.log('\nBuild and PWA');
if (existsSync('dist/index.html')) {
  const pwa = spawnSync(process.execPath, ['scripts/check-pwa.mjs'], { encoding: 'utf8' });
  check('PWA checks pass on dist/', pwa.status === 0, pwa.stdout.split('\n').filter(l => l.includes('✗')).join('; '));
} else warn('dist/ not found', 'run npm run build, then npm run preflight again to include the PWA checks');

console.log(`\n${failed ? `${failed} check(s) failed` : 'Preflight passed'}${warned ? `, ${warned} warning(s)` : ''}. Next: docs/GO_LIVE.md.`);
process.exit(failed ? 1 : 0);
