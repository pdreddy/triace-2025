import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('deployment reuses separate dependency installs and checks dirty quick deployments in full', () => {
  const root = mkdtempSync(join(tmpdir(), 'traice-deploy-'));
  try {
    for (const directory of ['bin', 'functions']) mkdirSync(join(root, directory));
    copyFileSync(new URL('../../deploy.sh', import.meta.url), join(root, 'deploy.sh'));
    for (const directory of ['', 'functions/']) {
      writeFileSync(join(root, directory, 'package.json'), '{}');
      writeFileSync(join(root, directory, 'package-lock.json'), '{}');
    }
    writeFileSync(join(root, 'functions/index.js'), 'export const registerTeam = {};');
    writeFileSync(join(root, '.env'), 'VITE_FIREBASE_PROJECT_ID=demo-deploy-test\n');
    writeFileSync(join(root, '.gitignore'), '.firebase/\nnode_modules/\nfunctions/node_modules/\nbin/\ncommands.log\n');
    writeFileSync(join(root, 'bin/npm'), `#!/bin/sh
printf '%s\\n' "$*" >> commands.log
if [ "$1" = --version ]; then echo 11; fi
if [ "$1" = --prefix ]; then mkdir -p "$2/node_modules"; fi
`, { mode: 0o755 });
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    git('init'); git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'fixture');
    const run = (...extra) => {
      const result = spawnSync('bash', ['deploy.sh', '--dry-run', '--only-functions', 'registerTeam', '--skip-browser-tests', ...extra], {
        cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` }
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return result.stdout;
    };
    const unsafeRules = spawnSync('bash', ['deploy.sh', '--rules'], { cwd: root, encoding: 'utf8' });
    assert.equal(unsafeRules.status, 1);
    assert.match(unsafeRules.stdout, /reviewed merged file/);
    run();
    assert.match(run(), /web dependencies unchanged/);
    assert.equal(readFileSync(join(root, 'commands.log'), 'utf8').match(/ci --no-audit/g).length, 2);
    writeFileSync(join(root, 'functions/package-lock.json'), '{"changed":true}');
    const output = run('--quick', '--allow-dirty');
    assert.match(output, /Quick mode disabled/);
    assert.match(output, /web dependencies unchanged/);
    assert.equal(readFileSync(join(root, 'commands.log'), 'utf8').match(/ci --no-audit/g).length, 3);
    assert.match(output, /functions:traice:registerTeam/);
    mkdirSync(join(root, 'scripts'));
    copyFileSync(new URL('../../scripts/plan-deploy.mjs', import.meta.url), join(root, 'scripts/plan-deploy.mjs'));
    // Simulate a successful Firebase command; this test never contacts Firebase.
    writeFileSync(join(root, 'bin/npx'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const deployed = spawnSync('bash', ['deploy.sh', '--no-hosting', '--skip-browser-tests', '--allow-dirty'], {
      cwd: root, encoding: 'utf8', input: 'demo-deploy-test\n',
      env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` }
    });
    assert.equal(deployed.status, 0, deployed.stdout + deployed.stderr);
    assert.equal(existsSync(join(root, '.firebase/deployed-functions')), false, 'dirty deploy must not advance a commit marker');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
