// Deploy an explicitly reviewed, merged rules file. Never regenerate it here:
// generation would discard rules belonging to other apps in a shared database.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildRules } from '../functions/lib/rules.js';

const at = (rules, path) => path.split('/').reduce((node, key) => node?.[key], rules);
const canonical = value => value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export function validateMergedRules(merged, expected, root, season1) {
  if (!merged?.rules || typeof merged.rules !== 'object') throw new Error('The merged file must contain a rules object.');
  let node = merged.rules;
  for (const part of root.split('/')) {
    for (const permission of ['.read', '.write']) {
      if (node?.[permission] !== undefined && node[permission] !== false) throw new Error(`An ancestor of ${root} grants ${permission}; it would bypass tournament privacy.`);
    }
    node = node?.[part];
  }
  if (JSON.stringify(canonical(node)) !== JSON.stringify(canonical(at(expected.rules, root)))) {
    throw new Error('The merged tournament subtree does not match the generated rules. Regenerate separately, then merge it into the shared rules.');
  }
  if (at(merged.rules, season1)?.['.read'] !== true) throw new Error('The merged file is missing the public Season 1 rule.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const args = process.argv.slice(2);
    const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
    const project = option('--project'), file = option('--rules');
    if (!project || project.startsWith('--') || !file || file.startsWith('--') || !args.includes('--confirm-merged')) {
      throw new Error('Usage: npm run rules:deploy -- --project <project-id> --rules <reviewed-merged.json> --confirm-merged. Merge the generated tournament rules with the project’s existing rules first.');
    }
    // Check against the already generated file; do not overwrite reviewed input.
    const generated = JSON.parse(readFileSync('database.rules.json', 'utf8'));
    const template = JSON.parse(readFileSync('database.rules.template.json', 'utf8'));
    const { resolveDbPaths } = await import('../functions/lib/paths.js');
    // Require explicit paths when deploying a non-default root, avoiding implicit dotenv parsing.
    const paths = resolveDbPaths({ root: option('--root'), season1: option('--season1') });
    const expected = buildRules(template, paths);
    if (JSON.stringify(canonical(generated)) !== JSON.stringify(canonical(expected))) throw new Error('Generated rules do not match the selected paths. Run rules:generate with matching paths first.');
    const absolute = resolve(file), merged = JSON.parse(readFileSync(absolute, 'utf8'));
    validateMergedRules(merged, expected, paths.root, paths.season1);
    const temporary = mkdtempSync(join(tmpdir(), 'traice-rules-'));
    try {
      const config = join(temporary, 'firebase.json'), snapshot = join(temporary, 'reviewed-rules.json');
      writeFileSync(snapshot, JSON.stringify(merged), { mode: 0o600 });
      writeFileSync(config, JSON.stringify({ database: { rules: snapshot } }));
      const result = spawnSync(process.execPath, [resolve('node_modules/firebase-tools/lib/bin/firebase.js'), 'deploy', '--project', project, '--only', 'database', '--config', config], { stdio: 'inherit' });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
