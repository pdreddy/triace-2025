// Turns the migration tree into the writes for the multi-club database, in safe batches. Pure: the script
// that holds the credentials does the actual writing, so this can be tested without a database.

// Flattens the tree into { 'a/b/c': value } paths no deeper than `depth`, so one write is never huge.
export function flatten(tree, depth = 3) {
  const out = {};
  const walk = (node, path, level) => {
    const isObject = node && typeof node === 'object' && !Array.isArray(node);
    if (!isObject || level === depth || !Object.keys(node).length) { out[path] = node; return; }
    for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}/${key}` : key, level + 1);
  };
  walk(tree, '', 0);
  return out;
}

// Splits the paths into updates of at most `size` paths.
export function batches(paths, size = 200) {
  const entries = Object.entries(paths), out = [];
  for (let i = 0; i < entries.length; i += size) out.push(Object.fromEntries(entries.slice(i, i + size)));
  return out;
}

const bytes = value => Buffer.byteLength(JSON.stringify(value ?? null));

// What an import would do: which sections, how many paths and bytes, and any key Firebase would reject.
// Depth per section: how many levels down one write stays whole (clubs go down to the individual match).
const DEPTH = { clubs: 6, pprcMaster: 3 };
export function planImport(tree, { only } = {}) {
  const sections = Object.keys(tree).filter(k => !only || only.includes(k));
  const paths = {}, problems = [];
  for (const section of sections) Object.assign(paths, flatten({ [section]: tree[section] }, DEPTH[section] ?? 3));
  for (const path of Object.keys(paths)) {
    if (/[.$#[\]]/.test(path.replace(/\/$/, ''))) problems.push(`path contains a character Firebase does not allow: ${path}`);
    if (path.length > 700) problems.push(`path is too long: ${path.slice(0, 80)}…`);
  }
  const stats = Object.fromEntries(sections.map(section => [section, { paths: Object.keys(paths).filter(p => p.startsWith(`${section}/`)).length, bytes: bytes(tree[section]) }]));
  return { sections, paths, stats, problems };
}

// A value Firebase cannot store (undefined, NaN, functions) is dropped; this is what is actually sent.
export function clean(value) {
  if (value === undefined || typeof value === 'function') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (Array.isArray(value)) return value.map(v => clean(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]));
  return value;
}
