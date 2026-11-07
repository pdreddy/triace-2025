import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, quickPlan } from '../../scripts/plan-deploy.mjs';

test('docs, scripts and tests-only changes deploy nothing and run no browser tests', () => {
  for (const files of [['README.md', 'docs/GO_LIVE.md'], ['deploy.sh', 'scripts/check-pwa.mjs'], ['tests/unit/partners.test.js'], ['tests/firebase/functions.test.js']]) {
    const result = plan(files);
    assert.equal(result.nothingToDeploy, true, files.join());
    assert.deepEqual(result.specs, [], files.join());
    assert.equal(result.build, false);
  }
});

test('a changed browser test runs itself and deploys nothing', () => {
  const result = plan(['tests/browser/seasons.spec.js']);
  assert.deepEqual(result.specs, ['seasons']);
  assert.equal(result.nothingToDeploy, true);
});

test('a page change rebuilds the site, not the functions, and runs that page’s tests', () => {
  const result = plan(['src/pages/Partners.jsx']);
  assert.deepEqual([result.functions, result.hosting, result.build, result.offlineTest], [false, true, true, true]);
  assert.deepEqual(result.specs, ['partners']);
});

test('a server-only function file deploys functions but not the site', () => {
  const result = plan(['functions/lib/captainLogin.js']);
  assert.deepEqual([result.functions, result.hosting, result.siteChanged, result.build], [true, false, false, false]);
  assert.deepEqual(result.specs, ['registration']);
});

test('a library the web app also imports needs both', () => {
  const result = plan(['functions/lib/partners.js']);
  assert.deepEqual([result.functions, result.hosting], [true, true]);
  assert.deepEqual(result.specs, ['partners']);
  const early = plan(['functions/lib/earlyBird.js']);
  assert.deepEqual(early.specs, ['registration', 'seasons']);
});

test('styles run the layout tests only', () => {
  assert.deepEqual(plan(['src/styles/app.css']).specs, ['pwa-ui', 'rules-fit']);
});

test('rules changes are flagged, never deployed silently', () => {
  const result = plan(['database.rules.template.json', 'database.rules.json']);
  assert.equal(result.rules, true);
  assert.equal(result.functions, false);
  assert.equal(result.hosting, false);
});

test('anything that can affect every screen, or that is not recognised, runs every browser test', () => {
  for (const file of ['tests/browser/fixtures.js', 'functions/index.js', 'functions/lib/tournament.js', 'src/App.jsx', 'src/services/firebase.js', 'src/hooks/useTournament.jsx', 'src/components/UI.jsx', 'vite.config.js', 'package-lock.json', 'scripts/demo-plugin.mjs', 'src/pages/BrandNewPage.jsx']) {
    assert.equal(plan([file]).specs, 'all', file);
  }
});

test('with Netlify (no hosting from this script) a site change is noted but not deployed here', () => {
  const result = plan(['src/pages/Partners.jsx'], { hosting: false });
  assert.deepEqual([result.hosting, result.siteChanged, result.build], [false, true, true]);
});

test('several changes combine', () => {
  const result = plan(['src/pages/Partners.jsx', 'src/rules/cards.jsx', 'README.md']);
  assert.deepEqual(result.specs, ['partners', 'registration', 'rules-fit', 'rules-sound']);
});

const deps = (changes, { head = 'HEAD1', ancestors = () => true } = {}) => ({ diff: base => changes[base] || [], isAncestor: ancestors, head: () => head });

test('quick plan falls back to everything when nothing is recorded or history changed', () => {
  assert.equal(quickPlan({ fnBase: null, siteBase: null, hosting: true }, deps({})).full, true);
  assert.equal(quickPlan({ fnBase: 'a', siteBase: null, hosting: true }, deps({})).full, true);                      // site never deployed from here
  assert.equal(quickPlan({ fnBase: 'a', siteBase: null, hosting: false }, deps({})).full, false);                    // Netlify: only functions matter
  assert.match(quickPlan({ fnBase: 'a', siteBase: 'b', hosting: true }, deps({}, { ancestors: () => false })).why, /not part of this branch/);
});

test('quick plan deploys only what changed since each target’s own last deploy', () => {
  const changes = { f: ['functions/lib/captainLogin.js'], s: ['src/pages/Partners.jsx'] };
  const result = quickPlan({ fnBase: 'f', siteBase: 's', hosting: true }, deps(changes, { ancestors: (older, newer) => newer === 'HEAD1' || (older === 'f' && newer === 's') }));   // 'f' is older than 's'
  assert.equal(result.full, false);
  assert.equal(result.deployFunctions, true);
  assert.equal(result.deploySite, true);
  assert.deepEqual(result.specs, ['registration']);                                // tests cover everything since the older deploy ('f')
  const none = quickPlan({ fnBase: 'f', siteBase: 'f', hosting: true }, deps({}));
  assert.deepEqual([none.nothing, none.deployFunctions, none.deploySite, none.build], [true, false, false, false]);
  const netlify = quickPlan({ fnBase: 'f', siteBase: null, hosting: false }, deps({ f: ['src/pages/Partners.jsx', 'functions/lib/captainLogin.js'] }));
  assert.deepEqual([netlify.deployFunctions, netlify.deploySite, netlify.build], [true, false, true]);
});
