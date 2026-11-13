import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildRules } from '../../functions/lib/rules.js';
import { validateMergedRules } from '../../scripts/deploy-rules.mjs';
const template = JSON.parse(readFileSync(new URL('../../database.rules.template.json', import.meta.url)));
const expected = buildRules(template, {});
test('reviewed rules preserve other applications and require the complete private tournament subtree', () => {
  const merged = structuredClone(expected);
  merged.rules.otherApp = { '.read': 'auth != null', '.write': false };
  assert.doesNotThrow(() => validateMergedRules(merged, expected, 'traice2_0', 'traice2_0/season1'));
  assert.deepEqual(merged.rules.otherApp, { '.read': 'auth != null', '.write': false });
  delete merged.rules.traice2_0.registrations;
  assert.throws(() => validateMergedRules(merged, expected, 'traice2_0', 'traice2_0/season1'), /does not match/);
});
test('inherited public access and client writes cannot bypass private child rules', () => {
  const nested = buildRules(template, { root: 'clubs/tournament' });
  for (const permission of ['.read', '.write']) {
    for (const parent of [[], ['clubs']]) {
      const merged = structuredClone(nested);
      let node = merged.rules;
      for (const key of parent) node = node[key];
      node[permission] = true;
      assert.throws(() => validateMergedRules(merged, nested, 'clubs/tournament', 'clubs/tournament/season1'), /ancestor/);
    }
  }
});
test('rules deployment without an explicit reviewed file and project refuses before invoking Firebase', () => {
  const result = spawnSync(process.execPath, ['scripts/deploy-rules.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--confirm-merged/);
});

test('rules deployment passes a validated snapshot to Firebase and preserves its exit status', () => {
  const root = mkdtempSync(join(tmpdir(), 'triace-rules-test-'));
  try {
    writeFileSync(join(root, 'database.rules.json'), JSON.stringify(expected));
    writeFileSync(join(root, 'database.rules.template.json'), JSON.stringify(template));
    const merged = structuredClone(expected);
    merged.rules.otherApp = { '.read': 'auth != null', '.write': false };
    const reviewed = JSON.stringify(merged);
    writeFileSync(join(root, 'reviewed.json'), reviewed);
    mkdirSync(join(root, 'node_modules/firebase-tools/lib/bin'), { recursive: true });
    // Fake only the external CLI boundary. No deployment or network access occurs.
    writeFileSync(join(root, 'node_modules/firebase-tools/lib/bin/firebase.js'), `
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      const config = JSON.parse(fs.readFileSync(args[args.indexOf('--config') + 1]));
      fs.writeFileSync('captured.json', JSON.stringify({ args, rules: JSON.parse(fs.readFileSync(config.database.rules)) }));
      process.exit(7);
    `);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/deploy-rules.mjs', import.meta.url)),
      '--project', 'demo-rules-test', '--rules', 'reviewed.json', '--confirm-merged'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 7, result.stderr);
    const captured = JSON.parse(readFileSync(join(root, 'captured.json')));
    assert.deepEqual(captured.rules, merged);
    assert.equal(captured.args[captured.args.indexOf('--only') + 1], 'database');
    assert.equal(captured.args[captured.args.indexOf('--project') + 1], 'demo-rules-test');
    assert.equal(readFileSync(join(root, 'reviewed.json'), 'utf8'), reviewed);
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'database.rules.json'))), expected);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('merge-rules replaces only this app’s subtree and keeps every other app’s live rules', async () => {
  const { mergeRules } = await import('../../scripts/merge-rules.mjs'), { validateMergedRules } = await import('../../scripts/deploy-rules.mjs');
  const { readFileSync } = await import('node:fs');
  const generated = JSON.parse(readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'));
  const live = { rules: { '.read': false, '.write': false, clubs: { koc: { '.read': 'auth != null', secret: { '.read': false } } }, importLog: { '.read': false }, traice2_0: { settings: { '.read': true }, singlesLadder: { '.read': true } }, pprcMaster: { '.read': true } } };
  const copy = structuredClone(live), { merged, report } = mergeRules(live, generated, 'traice2_0');
  assert.deepEqual(live, copy);
  assert.deepEqual(merged.rules.clubs, live.rules.clubs);
  assert.deepEqual(merged.rules.importLog, live.rules.importLog);
  assert.deepEqual(merged.rules.traice2_0, generated.rules.traice2_0);
  assert.deepEqual(merged.rules.pprcMaster, live.rules.pprcMaster);
  assert.deepEqual(report.added, ['pprcClubs']);
  assert.deepEqual(report.kept.sort(), ['clubs', 'importLog', 'pprcMaster']);
  assert.ok(report.newUnderRoot.includes('ladder'));
  assert.deepEqual(report.removedUnderRoot, ['singlesLadder']);
  validateMergedRules(merged, generated, 'traice2_0', 'traice2_0/season1');   // the deploy script accepts it
  assert.throws(() => mergeRules({}, generated, 'traice2_0'), /live rules/);
  assert.throws(() => mergeRules(live, generated, 'nowhere'), /no rules for/);
});
