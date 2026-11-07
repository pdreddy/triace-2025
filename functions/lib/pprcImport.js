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
// The migration tree's "clubs" section is written under its own name, never under the project's existing `clubs` node
// (the KOC app keeps its live season data and admin settings there).
export const TARGET = { clubs: 'pprcClubs' };
const target = section => TARGET[section] || section;
// Depth per section: how many levels down one write stays whole (the club history goes down to the individual match).
const DEPTH = { clubs: 6, pprcMaster: 3 };
export function planImport(tree, { only } = {}) {
  const names = Object.keys(tree).filter(k => !only || only.includes(k) || only.includes(target(k)));
  const sections = names.map(target);
  const paths = {}, problems = [];
  for (const name of names) Object.assign(paths, flatten({ [target(name)]: tree[name] }, DEPTH[name] ?? 3));
  for (const path of Object.keys(paths)) {
    if (/[.$#[\]]/.test(path.replace(/\/$/, ''))) problems.push(`path contains a character Firebase does not allow: ${path}`);
    if (path.length > 700) problems.push(`path is too long: ${path.slice(0, 80)}…`);
  }
  const stats = Object.fromEntries(names.map(name => [target(name), { paths: Object.keys(paths).filter(p => p.startsWith(`${target(name)}/`)).length, bytes: bytes(tree[name]) }]));
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
    writes[`pprcMaster/playerList/${id}`] = { name: displayName(entry.name), overall, singles, doubles, utr: { singles, doubles }, played: 0, clubs: ['triace'] };
    summary.created.push({ id, name: displayName(entry.name), label });
  }
  return { writes, summary };
}

// ---------- Writing (works with any object that has the Realtime Database admin shape: ref(path).once/update/set/remove) ----------
export class ImportRefused extends Error {}

// Imports the migration tree. Refuses to touch a section that already has data unless `replace`, and before replacing
// hands what is there to `saveBackup(existing)` (which returns where it was saved). Returns what was done.
export async function runImport(db, tree, { only, replace = false, now = Date.now(), source = 'multiclub.json', saveBackup = () => null, progress = () => {} } = {}) {
  const plan = planImport(tree, { only });
  if (plan.problems.length) throw new ImportRefused(`Problems:\n${plan.problems.slice(0, 20).join('\n')}`);
  const existing = {};
  for (const section of plan.sections) existing[section] = (await db.ref(section).once('value')).val();
  const occupied = plan.sections.filter(s => existing[s] != null);
  if (occupied.length && !replace) throw new ImportRefused(`Already has data: ${occupied.join(', ')}. Nothing was written. Use --replace to overwrite (a backup is saved first).`);
  let backup = null;
  if (occupied.length) {
    backup = saveBackup(Object.fromEntries(occupied.map(s => [s, existing[s]])));
    for (const s of occupied) await db.ref(s).remove();
  }
  let written = 0;
  const total = Object.keys(plan.paths).length;
  for (const batch of batches(plan.paths, 200)) { await db.ref().update(clean(batch)); written += Object.keys(batch).length; progress(written, total); }
  await db.ref(`importLog/${now}`).set({ at: now, sections: plan.sections, stats: plan.stats, source });
  return { plan, written, replaced: occupied, backup };
}

// Adds the Triace registrations to the shared player list (see planTriacePlayers).
export async function runTriaceImport(db, entries, { now = Date.now() } = {}) {
  const [nameIndex, playerList] = await Promise.all([db.ref('pprcMaster/nameIndex').once('value'), db.ref('pprcMaster/playerList').once('value')]);
  const { writes, summary } = planTriacePlayers(entries, { nameIndex: nameIndex.val() || {}, playerList: playerList.val() || {} });
  if (Object.keys(writes).length) await db.ref().update(clean(writes));
  await db.ref(`importLog/${now}`).set({ at: now, source: 'triace registrations', created: summary.created.length, marked: summary.marked.length, skipped: summary.skipped.length });
  return { writes, summary };
}
