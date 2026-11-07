// Updating the PPRC list from a file of UTRs (CSV or JSON): read the file, match each name to a PPRC player, show what
// would change, then apply it and re-rate everyone. All pure: the browser uses parse + plan for the preview, the server
// validates and applies the same updates.
import { PPRC_PARAMS, createRegistry, displayName, nameKey, playerIdFor, resolveName } from './pprc.js';
import { deriveMaster } from './pprcMigrate.js';

const MIN = 1, MAX = 16.5;
const clean = h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = {
  name: ['name', 'fullname', 'player', 'playername'], first: ['firstname', 'first', 'givenname'], last: ['lastname', 'last', 'surname', 'familyname'],
  singles: ['singlesutr', 'singles', 'singlesrating', 's', 'utrsingles', 'verifiedsinglesutr'], doubles: ['doublesutr', 'doubles', 'doublesrating', 'd', 'utrdoubles', 'verifiedDoublesUtr'.toLowerCase()]
};

function splitCsv(text, delimiter) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true; else if (ch === delimiter) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

// A UTR typed in a file: "6.5", "6,50", " 7 ". Empty or 0 means "not rated" (null); anything else must be 1.00-16.50.
export function parseUtr(value) {
  if (value == null || value === '') return { value: null };
  const text = String(value).trim().replace(',', '.');
  if (!text) return { value: null };
  const n = Number(text);
  if (!Number.isFinite(n)) return { error: `"${value}" is not a number` };
  if (n === 0) return { value: null };
  if (n < MIN || n > MAX) return { error: `${n} is outside ${MIN.toFixed(2)}–${MAX.toFixed(2)}` };
  return { value: Math.round(n * 100) / 100 };
}

// text: the file's contents. Returns { rows: [{ line, name, singles, doubles }], errors: [{ line, message }] }.
export function parseUtrFile(text, filename = '') {
  const rows = [], errors = [];
  let records;
  const trimmed = String(text ?? '').replace(/^﻿/, '').trim();
  if (!trimmed) return { rows, errors: [{ line: 0, message: 'The file is empty.' }] };
  if (/\.json$/i.test(filename) || /^[[{]/.test(trimmed)) {
    let data;
    try { data = JSON.parse(trimmed); } catch (error) { return { rows, errors: [{ line: 0, message: `The file is not valid JSON: ${error.message}` }] }; }
    const list = Array.isArray(data) ? data : Array.isArray(data?.players) ? data.players : Object.entries(data || {}).map(([name, v]) => (v && typeof v === 'object' ? { name, ...v } : { name, singles: v }));
    records = list.map((obj, i) => ({ line: i + 1, get: keys => { for (const k of Object.keys(obj || {})) if (keys.includes(clean(k)) && obj[k] !== '' && obj[k] != null) return obj[k]; return undefined; } }));
  } else {
    const first = trimmed.split('\n', 1)[0], delimiter = [',', ';', '\t', '|'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const [head, ...body] = splitCsv(trimmed, delimiter), keys = head.map(clean);
    if (!keys.some(k => ALIASES.name.includes(k) || ALIASES.first.includes(k))) return { rows, errors: [{ line: 1, message: 'The first row must name the columns, for example: name, singles, doubles.' }] };
    records = body.map((cells, i) => ({ line: i + 2, get: wanted => { for (const w of wanted) { const at = keys.indexOf(w); if (at >= 0 && String(cells[at] ?? '').trim() !== '') return cells[at]; } return undefined; } }));
  }
  for (const rec of records) {
    const full = rec.get(ALIASES.name), first = rec.get(ALIASES.first), last = rec.get(ALIASES.last);
    const name = String(full ?? [first, last].filter(Boolean).join(' ')).trim().replace(/\s+/g, ' ');
    if (!name) { errors.push({ line: rec.line, message: 'No player name.' }); continue; }
    const s = parseUtr(rec.get(ALIASES.singles)), d = parseUtr(rec.get(ALIASES.doubles));
    if (s.error || d.error) { errors.push({ line: rec.line, message: `${name}: ${s.error || d.error}` }); continue; }
    if (s.value == null && d.value == null) { errors.push({ line: rec.line, message: `${name}: no singles or doubles UTR.` }); continue; }
    rows.push({ line: rec.line, name, singles: s.value, doubles: d.value });
  }
  if (rows.length > 2000) return { rows: [], errors: [{ line: 0, message: 'Too many rows (the limit is 2000 per file).' }] };
  return { rows, errors };
}

// rows: from parseUtrFile. list: the PPRC player list [{ id, name, utr: { singles, doubles } }].
// Every row becomes one item: update (a known player's UTR changes), same, new (a full name nobody has), ambiguous or
// skip. `updates` is what to send to the server.
export function planUtrUpload(rows, list) {
  const registry = createRegistry((list || []).map(p => ({ id: p.id, name: p.name })));
  const byId = new Map((list || []).map(p => [p.id, p])), seen = new Map(), items = [], updates = [];
  for (const row of rows) {
    const found = resolveName(registry, row.name);
    const base = { line: row.line, name: row.name, file: { singles: row.singles, doubles: row.doubles } };
    if (!found.id) {
      const words = nameKey(row.name).split(' ');
      if (found.how === 'ambiguous') { items.push({ ...base, status: 'ambiguous', candidates: found.candidates.map(id => byId.get(id)?.name || id), note: 'Matches more than one player: use the full name.' }); continue; }
      if (words.length < 2 || words.some(w => w.length < 2)) { items.push({ ...base, status: 'skip', note: 'Not in PPRC and needs a full name to be added.' }); continue; }
      const id = playerIdFor(row.name);
      if (seen.has(id)) { items.push({ ...base, status: 'skip', note: `Listed twice in the file (line ${seen.get(id)}).` }); continue; }
      seen.set(id, row.line);
      const singles = row.singles ?? row.doubles, doubles = row.doubles ?? row.singles;
      items.push({ ...base, status: 'new', id: null, after: { singles, doubles } }); updates.push({ id: null, name: displayName(row.name), singles, doubles });
      continue;
    }
    if (seen.has(found.id)) { items.push({ ...base, status: 'skip', id: found.id, note: `The same player is listed twice (line ${seen.get(found.id)}).` }); continue; }
    seen.set(found.id, row.line);
    const player = byId.get(found.id), before = { singles: player?.utr?.singles ?? null, doubles: player?.utr?.doubles ?? null };
    const after = { singles: row.singles ?? before.singles, doubles: row.doubles ?? before.doubles };
    const same = ['singles', 'doubles'].every(k => Math.abs((after[k] ?? 0) - (before[k] ?? 0)) < 0.005);
    items.push({ ...base, status: same ? 'same' : 'update', id: found.id, matched: player?.name, before, after });
    if (!same) updates.push({ id: found.id, name: player?.name, singles: after.singles, doubles: after.doubles });
  }
  const counts = items.reduce((o, i) => ({ ...o, [i.status]: (o[i.status] || 0) + 1 }), { update: 0, new: 0, same: 0, ambiguous: 0, skip: 0 });
  return { items, counts, updates };
}

// What the server accepts: at most 1000 updates, each a known id or a new full name, with UTRs inside the scale.
export function validateUtrUpdates(updates) {
  if (!Array.isArray(updates) || updates.length < 1 || updates.length > 1000) throw new Error('Send between 1 and 1000 updates.');
  const seen = new Set();
  return updates.map(u => {
    if (!u || typeof u !== 'object') throw new Error('Invalid update.');
    const hasId = u.id !== null && u.id !== undefined;
    if (hasId && !/^p_[a-z0-9_]{2,100}$/.test(String(u.id))) throw new Error(`Invalid player id: ${u.id}`);
    const name = String(u.name ?? '').trim().replace(/\s+/g, ' ');
    if (!hasId && (name.length > 80 || nameKey(name).split(' ').filter(w => w.length >= 2).length < 2)) throw new Error(`A new player needs a full name: "${name}"`);
    const out = { id: hasId ? String(u.id) : null, name };
    for (const k of ['singles', 'doubles']) {
      if (u[k] === null || u[k] === undefined) { out[k] = null; continue; }
      if (!Number.isFinite(u[k]) || u[k] < MIN || u[k] > MAX) throw new Error(`${name || u.id}: ${k} UTR must be between ${MIN.toFixed(2)} and ${MAX.toFixed(2)}.`);
      out[k] = Math.round(u[k] * 100) / 100;
    }
    if (out.singles === null && out.doubles === null) throw new Error(`${name || u.id}: give a singles or doubles UTR.`);
    const key = out.id || playerIdFor(name);
    if (seen.has(key)) throw new Error(`${name || u.id} is listed twice.`);
    seen.add(key);
    return out;
  });
}

// tree: { pprcMaster: { players, nameIndex, utrHistory? }, clubs: { [club]: { seasons: { [season]: { matches } } } } } (clubs is
// stored under pprcClubs in the database). Returns what changed and the re-rated derived data; the input is not modified.
export function applyUtrUpdates(tree, updates, { now = Date.now(), params = PPRC_PARAMS } = {}) {
  const valid = validateUtrUpdates(updates);
  const players = structuredClone(tree.pprcMaster?.players || {}), nameIndex = structuredClone(tree.pprcMaster?.nameIndex || {});
  const changedPlayers = {}, newIndex = {}, utrHistory = {}, created = [], updated = [];
  for (const u of valid) {
    let id = u.id;
    if (id) {
      if (!players[id]) throw new Error(`Unknown PPRC player: ${id}`);
    } else {
      id = nameIndex[nameKey(u.name)] || playerIdFor(u.name);
      if (!players[id]) {
        players[id] = { name: displayName(u.name), nameKey: nameKey(u.name), clubs: {}, seed: {}, aliases: undefined };
        delete players[id].aliases; nameIndex[players[id].nameKey] = id; newIndex[players[id].nameKey] = id; created.push(id);
      }
    }
    const seed = { singles: u.singles ?? players[id].seed?.singles ?? u.doubles, doubles: u.doubles ?? players[id].seed?.doubles ?? u.singles };
    players[id] = { ...players[id], seed, seedSource: 'upload', seedUpdatedAt: now };
    changedPlayers[id] = players[id]; utrHistory[id] = { [now]: { singles: seed.singles, doubles: seed.doubles, source: 'upload' } };
    if (!created.includes(id)) updated.push(id);
  }
  const master = Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { id, ...p }]));
  const matches = Object.values(tree.clubs || {}).flatMap(club => Object.values(club.seasons || {}).flatMap(season => Object.values(season.matches || {})));
  const derived = deriveMaster({ master, matches, params });
  const before = tree.pprcMaster?.ratings || {};
  const moved = Object.keys(derived.ratings).filter(id => Math.abs((derived.ratings[id].overall) - (before[id]?.overall ?? derived.ratings[id].seed.singles)) >= 0.01);
  const biggest = moved.reduce((m, id) => Math.max(m, Math.abs(derived.ratings[id].overall - (before[id]?.overall ?? derived.ratings[id].overall))), 0);
  return {
    changedPlayers, newIndex, utrHistory,
    derived: { ratings: derived.ratings, ratingHistory: derived.ratingHistory, recent: derived.recent, historyYears: derived.historyYears, playerList: derived.playerList },
    summary: { updated: updated.length, created: created.length, reRated: moved.length, biggestChange: Math.round(biggest * 100) / 100, skippedCourts: derived.skipped.length }
  };
}
