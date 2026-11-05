// Decides what a deploy needs, from the files that changed since the last successful deploy.
//   node scripts/plan-deploy.mjs <base-commit> [--no-hosting]     prints a JSON plan
// Used by `./deploy.sh --quick`. The rules are deliberately cautious: anything it does not recognise runs everything.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Files under functions/lib that the web app also imports (a change there needs a new site build as well as new functions).
const SHARED_WITH_BROWSER = ['tournament', 'league', 'earlyBird', 'partners', 'paths', 'captainAccount'];
// Files whose change can affect any screen: run every browser test.
const EVERYTHING = [/^vite\.config\.js$/, /^package(-lock)?\.json$/, /^playwright(\.pwa)?\.config\.js$/, /^src\/(App|main)\.jsx$/, /^src\/(hooks|services)\//, /^src\/components\/UI\.jsx$/, /^functions\/(index\.js|lib\/(tournament|league)\.js)$/, /^scripts\/demo-plugin\.mjs$/, /^\.env/];

// [pattern, browser spec files it affects]
const SPECS = [
  [/^src\/pages\/Partners\.jsx$|^functions\/lib\/partners\.js$/, ['partners']],
  [/^src\/rules\/|^src\/pages\/Rules\.jsx$|^src\/audio\//, ['rules-fit', 'rules-sound', 'registration']],
  [/captain|^src\/components\/(LoginCard|AuthCard|TeamTools)\.jsx$|^src\/pages\/(CaptainLogin|Login|Team|Register)\.jsx$/i, ['registration']],
  [/earlyBird|EarlyBird/, ['seasons', 'registration']],
  [/^src\/pages\/Admin\.jsx$|^src\/components\/(AdminLeague|FirebasePanel)\.jsx$/, ['registration', 'seasons']],
  [/^src\/pages\/(History|Champions)\.jsx$|^src\/components\/Winners\.jsx$|^src\/data\/|^functions\/lib\/(legacy|paths|rules)\.js$/, ['seasons']],
  [/^src\/pages\/League\.jsx$|^src\/components\/League\.jsx$/, ['registration', 'seasons']],
  [/^src\/pages\/(Players|Player|Tiers)\.jsx$/, ['registration']],
  [/^src\/styles\//, ['rules-fit', 'pwa-ui']],
  [/^src\/components\/(Icons|EarlyBird)\.jsx$/, ['pwa-ui']],
  [/^public\/|^index\.html$/, ['pwa-ui']],
  [/^tests\/browser\/([\w-]+)\.spec\.js$/, null]                    // a changed test file runs itself
];

const isHosting = f => /^(src|public)\//.test(f) || ['index.html', 'vite.config.js', 'package.json', 'package-lock.json', 'firebase.json', 'netlify.toml'].includes(f)
  || SHARED_WITH_BROWSER.some(name => f === `functions/lib/${name}.js`);
const isFunctions = f => f.startsWith('functions/') && !f.startsWith('functions/node_modules/') && !/\.(test|spec)\./.test(f);
const isRules = f => /^database\.rules(\.template)?\.json$/.test(f) || ['functions/lib/paths.js', 'functions/lib/rules.js', 'scripts/generate-rules.mjs'].includes(f);
const isDocsOnly = f => /\.md$|^docs\//.test(f);

export function plan(files, { hosting = true } = {}) {
  const changed = files.filter(Boolean);
  const reasons = [];
  const functions = changed.some(isFunctions);
  const site = hosting && changed.some(isHosting);
  const siteChanged = changed.some(isHosting);           // the site changed even if Netlify (not this script) publishes it
  const rules = changed.some(isRules);
  let specs = new Set(), all = false;
  for (const file of changed) {
    if (isDocsOnly(file)) continue;
    const own = /^tests\/browser\/([\w-]+)\.spec\.js$/.exec(file);
    if (own) { specs.add(own[1]); continue; }
    if (/^tests\/(unit|firebase|pwa)\//.test(file) || /^scripts\/(?!demo-plugin)/.test(file) || /^(deploy|run-all|run-local)\.sh$/.test(file)) continue;   // covered by the unit tests and checks
    if (EVERYTHING.some(re => re.test(file))) { all = true; reasons.push(`${file} can affect every screen`); continue; }
    const hit = SPECS.find(([re, list]) => list && re.test(file));
    if (hit) hit[1].forEach(name => specs.add(name));
    else if (isFunctions(file) || isHosting(file) || isRules(file)) {
      if (!isRules(file) && !/^functions\/lib\/(captainLogin|legacy)\.js$/.test(file)) { all = true; reasons.push(`${file} is not mapped to specific tests`); }
    }
  }
  return {
    changed: changed.length,
    functions, hosting: site, siteChanged, rules,
    specs: all ? 'all' : [...specs].sort(),
    offlineTest: siteChanged || all,                       // the offline test needs a fresh build
    build: siteChanged || all,
    nothingToDeploy: !functions && !siteChanged && !rules,
    reasons
  };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const changedSince = base => git('diff', '--name-only', `${base}..HEAD`).split('\n').map(line => line.trim()).filter(Boolean);
const isAncestor = (older, newer) => { try { git('merge-base', '--is-ancestor', older, newer); return true; } catch { return false; } };

// Markers: the commit that was last deployed to this project, one for the functions and one for the site.
const markerFile = kind => new URL(`../.firebase/deployed-${kind}`, import.meta.url);
export function readMarker(kind, project) {
  try { const [sha, saved] = readFileSync(markerFile(kind), 'utf8').trim().split(/\s+/); return saved === project ? sha : null; } catch { return null; }
}
export function writeMarker(kind, project, sha = git('rev-parse', 'HEAD')) {
  mkdirSync(new URL('../.firebase/', import.meta.url), { recursive: true });
  writeFileSync(markerFile(kind), `${sha} ${project}\n`);
}

// Combines the markers with the changes since them. Anything doubtful returns { full: true }.
export function quickPlan({ fnBase, siteBase, hosting = true }, deps = { diff: changedSince, isAncestor, head: () => git('rev-parse', 'HEAD') }) {
  if (!fnBase || (hosting && !siteBase)) return { full: true, why: 'no earlier deploy is recorded for this project on this machine' };
  const head = deps.head();
  for (const base of [fnBase, hosting ? siteBase : fnBase]) if (!deps.isAncestor(base, head)) return { full: true, why: 'the last deployed commit is not part of this branch' };
  const oldest = hosting && !deps.isAncestor(fnBase, siteBase) ? siteBase : fnBase;     // tests cover everything since the older deploy
  const forFunctions = plan(deps.diff(fnBase), { hosting }), forSite = hosting ? plan(deps.diff(siteBase), { hosting }) : null, forTests = plan(deps.diff(oldest), { hosting });
  const deployFunctions = forFunctions.functions, deploySite = !!forSite?.hosting;
  return {
    full: false, deployFunctions, deploySite, rulesChanged: forFunctions.rules || !!forSite?.rules,
    specs: forTests.specs, build: forTests.build || deploySite, offlineTest: forTests.offlineTest || deploySite,
    nothing: !deployFunctions && !deploySite, reasons: forTests.reasons
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === '--quick') {
    const project = rest[0], hosting = !rest.includes('--no-hosting'), shell = rest.includes('--shell');
    const result = quickPlan({ fnBase: readMarker('functions', project), siteBase: readMarker('site', project), hosting });
    if (!shell) console.log(JSON.stringify(result));
    else {   // shell assignments for deploy.sh (values are fixed words, numbers and known test names)
      const specs = result.specs === 'all' || result.full ? 'all' : result.specs.filter(name => /^[a-z-]+$/.test(name)).join(' ');
      const b = value => (value ? 1 : 0);
      console.log([`Q_FULL=${b(result.full)}`, `Q_WHY='${(result.why || '').replace(/'/g, '')}'`, `Q_FUNCTIONS=${b(result.deployFunctions)}`, `Q_SITE=${b(result.deploySite)}`, `Q_RULES=${b(result.rulesChanged)}`, `Q_BUILD=${b(result.build)}`, `Q_OFFLINE=${b(result.offlineTest)}`, `Q_NOTHING=${b(result.nothing)}`, `Q_SPECS='${specs}'`].join('\n'));
    }
  } else if (command === '--mark') {
    const [kind, project] = rest;
    if (!['functions', 'site'].includes(kind) || !project) { console.error('Usage: node scripts/plan-deploy.mjs --mark functions|site <project>'); process.exit(2); }
    writeMarker(kind, project);
  } else {
    const base = command, hosting = !rest.includes('--no-hosting');
    if (!base) { console.error('Usage: node scripts/plan-deploy.mjs <base-commit> [--no-hosting] | --quick <project> [--no-hosting] [--shell] | --mark functions|site <project>'); process.exit(2); }
    try { console.log(JSON.stringify(plan(changedSince(base), { hosting }))); } catch { console.error('Cannot compare with that commit.'); process.exit(1); }
  }
}
