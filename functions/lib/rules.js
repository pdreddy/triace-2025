// Builds database.rules.json for the configured database paths, so the rules can never drift from
// the app. The template holds the root node once under "__DB_ROOT__"; this places it at the real root
// (nested roots become nested rule keys) and makes the Season 1 node publicly readable.
import { resolveDbPaths } from './paths.js';

export const ROOT_KEY = '__DB_ROOT__';

function nest(target, parts, leaf) {
  let node = target;
  for (const part of parts.slice(0, -1)) node = node[part] ||= {};
  node[parts.at(-1)] = { ...(node[parts.at(-1)] || {}), ...leaf };
}

export function buildRules(template, paths) {
  const { root, season1, season1UnderRoot } = resolveDbPaths(paths);
  const body = structuredClone(template.rules?.[ROOT_KEY]);
  if (!body) throw new Error(`The rules template needs a “${ROOT_KEY}” node.`);
  const rules = Object.fromEntries(Object.entries(template.rules).filter(([key]) => key !== ROOT_KEY));
  const season1Rule = { '.read': true };
  if (season1UnderRoot) nest(body, season1.slice(root.length + 1).split('/'), season1Rule);
  nest(rules, root.split('/'), body);
  if (!season1UnderRoot) nest(rules, season1.split('/'), season1Rule);
  return { rules };
}
