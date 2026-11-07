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

// ---------- Triace registrations -> the shared player list ----------
import { PPRC_PARAMS, displayName, nameKey, playerIdFor } from './pprc.js';

// entries: the admin's export of registered players [{ teamId, role, name, firstName?, singlesUtr, doublesUtr, pprcId }].
// master: { nameIndex: { key: id }, playerList: { id: { clubs: [...] ... } } } as it is today.
// Players already in the list are only marked as playing in Triace; new players with a full name are created and
// seeded from their UTR; anyone with just a first name is skipped until the admin gives a full name.
export function planTriacePlayers(entries, master = {}) {
  const nameIndex = master.nameIndex || {}, list = master.playerList || {};
  const writes = {}, summary = { created: [], marked: [], skipped: [] };
  const seen = new Set();
  const mark = id => {
    if (seen.has(`mark:${id}`)) return; seen.add(`mark:${id}`);
    const clubs = [...new Set([...(list[id]?.clubs || []), 'triace'])];
    writes[`pprcMaster/players/${id}/clubs/triace`] = true;
    writes[`pprcMaster/playerList/${id}/clubs`] = clubs;
  };
  for (const entry of entries || []) {
    const label = `${entry.name || entry.firstName || '?'} (${entry.teamId}:${entry.role})`;
    if (entry.pprcId) {
      if (list[entry.pprcId] || Object.values(nameIndex).includes(entry.pprcId)) { mark(entry.pprcId); summary.marked.push({ id: entry.pprcId, label }); }
      else summary.skipped.push({ label, reason: `unknown PPRC id ${entry.pprcId}` });
      continue;
    }
    const key = nameKey(entry.name);
    if (!key || key.split(' ').length < 2) { summary.skipped.push({ label, reason: 'needs a full name' }); continue; }
    if (nameIndex[key]) { mark(nameIndex[key]); summary.marked.push({ id: nameIndex[key], label }); continue; }
    const id = playerIdFor(key);
    if (seen.has(`new:${id}`)) continue; seen.add(`new:${id}`);
    const singles = Number(entry.singlesUtr) || PPRC_PARAMS.defaultSeed, doubles = Number(entry.doublesUtr) || singles;
    const overall = Number(((singles + doubles) / 2).toFixed(2));
    writes[`pprcMaster/players/${id}`] = { name: displayName(entry.name), nameKey: key, clubs: { triace: true }, seed: { singles, doubles }, seedSource: 'triace registration' };
    writes[`pprcMaster/nameIndex/${key}`] = id;
    writes[`pprcMaster/ratings/${id}`] = { singles, doubles, overall, seed: { singles, doubles }, played: { singles: 0, doubles: 0 }, wins: 0, losses: 0, record: { singles: { wins: 0, losses: 0 }, doubles: { wins: 0, losses: 0 } }, lastPlayed: null, version: PPRC_PARAMS.version };
    writes[`pprcMaster/playerList/${id}`] = { name: displayName(entry.name), overall, played: 0, clubs: ['triace'] };
    summary.created.push({ id, name: displayName(entry.name), label });
  }
  return { writes, summary };
}
