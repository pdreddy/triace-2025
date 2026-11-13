// Sets up a Singles Ladder season from the REAL Ladder 2026 roster (scripts/migration/ladder-2026.psv), as a DRAFT.
// It reads first and changes nothing unless --write is given.
//
//   node scripts/ladder-setup.mjs                                              the roster in the file (no network)
//   node scripts/ladder-setup.mjs --database-url <url>                         read-only, no key needed: match everyone to PPRC, show the plan
//   node scripts/ladder-setup.mjs --database-url <url> --write                 create the draft season (needs GOOGLE_APPLICATION_CREDENTIALS)
//   options: --season-id ladder-2026   --name "Singles Ladder 2026"   --root traice2_0
//
// Players are matched through pprcMaster/nameIndex (the same lookup the rest of the app uses). Anyone it cannot match
// is listed and left out: enroll them from the organizer page once their PPRC record exists. Positions are seeded from
// the PPRC singles UTR; a player with no UTR on file is seeded from the ladder rating when the file has one, and is
// flagged. The season is created with the initial default rules and stays a draft: review the rules, link each
// player's sign-in, then open it from /ladder/admin. It never writes outside <root>/ladder and refuses to touch a
// season id that already exists.
import fs from 'node:fs';
import { ladderRoster } from '../functions/lib/ladder.js';
import { nameKey, createRegistry, resolveName } from '../functions/lib/pprc.js';
import { applyLadder } from '../functions/lib/singlesLadder/engine.js';
import { resolveDbPaths } from '../functions/lib/paths.js';

const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const url = opt('--database-url'), write = args.includes('--write'), seasonId = opt('--season-id') || 'ladder-2026', title = opt('--name') || 'Singles Ladder 2026';
const roster = ladderRoster(fs.readFileSync(new URL('./migration/ladder-2026.psv', import.meta.url), 'utf8'));

// Who a roster name is, decided the same way the PPRC migration decides it: (1) a spelling settled in
// scripts/migration/name-decisions.json, (2) the exact name in pprcMaster/nameIndex, (3) name parts that fit exactly one
// PPRC player ("Dinesh Timmareddy" -> "Dinesh Reddy Timmareddy"). Two or more candidates is never a guess: left out.
export function matchRoster(roster, { index, players, decisions }) {
  const settled = new Map(Object.entries(decisions || {}).filter(([k, v]) => typeof v === 'string' && !k.includes('::')).map(([k, v]) => [nameKey(k), v]));
  const usable = id => { const r = id && players?.[id]; return r?.name && !r.mergedInto && !r.retired ? r : null; };
  const registry = createRegistry(Object.entries(players || {}).filter(([id]) => usable(id)).map(([id, r]) => ({ id, name: r.name })));
  const resolved = [], missing = [];
  for (const person of roster) {
    const name = settled.get(person.key) || person.name;
    let playerId = usable(index?.[nameKey(name)]) ? index[nameKey(name)] : null, how = name === person.name ? 'exact' : 'name decision', candidates = [];
    if (!playerId) { const found = resolveName(registry, name); playerId = found.id; how = found.how; candidates = found.candidates; }
    if (!playerId) { missing.push({ name: person.name, candidates: candidates.map(id => players[id].name) }); continue; }
    const record = players[playerId], utr = Number.isFinite(record.seed?.singles) ? record.seed.singles : null;
    if (!resolved.some(r => r.playerId === playerId)) resolved.push({ playerId, name: record.name, utr: utr ?? person.rating, flagged: utr === null, from: person.name, how, verified: true });   // everyone in the results file has played the Ladder
  }
  return { resolved, missing };
}

// Pure: the season this roster produces. `resolved` = [{ playerId, name, utr, flagged }].
export function planSeason(resolved, { seasonId, title, now, existing = null }) {
  const organizer = { uid: 'ladder_setup_script', admin: true }; let state = existing || {}, n = 0;
  const step = payload => { state = applyLadder(state, { seasonId, ...payload }, organizer, { now, id: `setup_${seasonId.replaceAll('-', '_')}_${String(++n).padStart(3, '0')}` }).state; };
  step({ action: 'createSeason', name: title, reason: 'Season created from the Ladder 2026 roster (setup script)' });
  for (const p of resolved) step({ action: 'enroll', playerId: p.playerId, name: p.name, utr: p.utr, verified: p.verified === true, reason: 'Ladder 2026 roster (setup script)' });
  step({ action: 'seed', reason: 'Initial seeding from UTR (setup script)' });
  return JSON.parse(JSON.stringify(state));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!url) {
    console.log(`${roster.length} players in scripts/migration/ladder-2026.psv:`);
    for (const p of roster) console.log(`  ${p.name}${p.rating ? `  (ladder rating ${p.rating})` : ''}`);
    console.log('\nNothing was read from or written to Firebase. Add --database-url <url> to match them to PPRC records.');
    process.exit(0);
  }
  try {
    const ladderPath = `${resolveDbPaths({ root: opt('--root') }).root}/ladder`;
    // The plan only needs data that is already public (the PPRC list), so it reads over plain HTTPS with no key.
    // Only --write needs the service-account key: nobody can write ladder data from outside the server.
    let db = null;
    if (write) db = await (await import('./lib/rtdb.mjs')).openDatabase(url);
    const read = async path => {
      if (db) return (await db.ref(path).once('value')).val();
      const response = await fetch(`${url.replace(/\/+$/, '')}/${path}.json`);
      if (response.status === 401 || response.status === 403) { if (path.startsWith(ladderPath)) return null; throw new Error(`“${path}” is not publicly readable in this database.`); }   // ladder rules not deployed yet: no season can exist
      if (!response.ok) throw new Error(`Could not read “${path}” (HTTP ${response.status}). Check the database URL.`);
      return response.json();
    };
    const [index, players, seasons] = await Promise.all([read('pprcMaster/nameIndex'), read('pprcMaster/players'), read(`${ladderPath}/index/seasons`)]);
    if (seasons?.[seasonId]) throw new Error(`Season “${seasonId}” already exists at ${ladderPath}. Nothing was changed. Choose another --season-id.`);
    const decisions = JSON.parse(fs.readFileSync(new URL('./migration/name-decisions.json', import.meta.url), 'utf8'));
    const { resolved, missing } = matchRoster(roster, { index, players, decisions });
    const plan = season => Object.values(season.public[seasonId].players).sort((a, b) => a.rank - b.rank);
    const preview = planSeason(resolved, { seasonId, title, now: Date.now() });
    console.log(`Season “${title}” (${seasonId}) at ${ladderPath}: ${resolved.length} of ${roster.length} players matched to PPRC records.`);
    for (const p of plan(preview)) console.log(`  ${String(p.rank).padStart(2)}. ${p.name}  ${p.utr ?? '—'}${resolved.find(r => r.name === p.name)?.flagged ? '  (no UTR on file: seeded from the ladder rating)' : ''}`);
    const renamed = resolved.filter(r => nameKey(r.from) !== nameKey(r.name));
    if (renamed.length) console.log(`\nMatched under a different spelling (please check these are the same people):\n  ${renamed.map(r => `${r.from}  ->  ${r.name}  (${r.how === 'tokens' ? 'only PPRC player these name parts fit' : r.how})`).join('\n  ')}`);
    if (missing.length) console.log(`\nNot matched, left out (enroll them from /ladder/admin once they are in the PPRC list):\n  ${missing.map(m => `${m.name}${m.candidates.length ? `  (could be: ${m.candidates.join(' / ')})` : ''}`).join('\n  ')}`);
    if (!write) { console.log('\nDry run: nothing was written. Add --write to create this draft season.'); process.exit(0); }
    const now = Date.now(), result = await db.ref(ladderPath).transaction(current => (current?.index?.seasons?.[seasonId] ? undefined : planSeason(resolved, { seasonId, title, now, existing: current })));
    if (!result.committed) throw new Error('The season was not created (it may have been created meanwhile). Nothing was changed.');
    console.log(`\nCreated as a draft. Next: open /ladder/admin, review Rules settings, link each player’s sign-in, then Open season.`);
    process.exit(0);
  } catch (error) { console.error(`Failed: ${error.message}`); process.exit(4); }
}
