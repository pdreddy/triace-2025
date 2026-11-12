// Sets up a Singles Ladder season from the REAL Ladder 2026 roster (scripts/migration/ladder-2026.psv), as a DRAFT.
// It reads first and changes nothing unless --write is given.
//
//   node scripts/ladder-setup.mjs                                              the roster in the file (no network)
//   node scripts/ladder-setup.mjs --database-url <url>                         read-only: match everyone to PPRC, show the plan
//   node scripts/ladder-setup.mjs --database-url <url> --write                 create the draft season
//   options: --season-id ladder-2026   --name "Singles Ladder 2026"   --root traice2_0
//
// Players are matched through pprcMaster/nameIndex (the same lookup the rest of the app uses). Anyone it cannot match
// is listed and left out: enroll them from the organizer page once their PPRC record exists. Positions are seeded from
// the PPRC singles UTR; a player with no UTR on file is seeded from the ladder rating when the file has one, and is
// flagged. The season is created with the initial default rules and stays a draft: review the rules, link each
// player's sign-in, then open it from /ladder/organizer. It never writes outside <root>/ladder and refuses to touch a
// season id that already exists.
import fs from 'node:fs';
import { ladderRoster } from '../functions/lib/ladder.js';
import { applyLadder } from '../functions/lib/singlesLadder/engine.js';
import { resolveDbPaths } from '../functions/lib/paths.js';

const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const url = opt('--database-url'), write = args.includes('--write'), seasonId = opt('--season-id') || 'ladder-2026', title = opt('--name') || 'Singles Ladder 2026';
const roster = ladderRoster(fs.readFileSync(new URL('./migration/ladder-2026.psv', import.meta.url), 'utf8'));

// Pure: the season this roster produces. `resolved` = [{ playerId, name, utr, flagged }].
export function planSeason(resolved, { seasonId, title, now, existing = null }) {
  const organizer = { uid: 'ladder_setup_script', admin: true }; let state = existing || {}, n = 0;
  const step = payload => { state = applyLadder(state, { seasonId, ...payload }, organizer, { now, id: `setup_${seasonId.replaceAll('-', '_')}_${String(++n).padStart(3, '0')}` }).state; };
  step({ action: 'createSeason', name: title });
  for (const p of resolved) step({ action: 'enroll', playerId: p.playerId, name: p.name, utr: p.utr });
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
    const { openDatabase } = await import('./lib/rtdb.mjs');
    const db = await openDatabase(url), ladderPath = `${resolveDbPaths({ root: opt('--root') }).root}/ladder`;
    const read = async path => (await db.ref(path).once('value')).val();
    const [index, players, seasons] = await Promise.all([read('pprcMaster/nameIndex'), read('pprcMaster/players'), read(`${ladderPath}/index/seasons`)]);
    if (seasons?.[seasonId]) throw new Error(`Season “${seasonId}” already exists at ${ladderPath}. Nothing was changed. Choose another --season-id.`);
    const resolved = [], missing = [];
    for (const person of roster) {
      const playerId = index?.[person.key], record = playerId && players?.[playerId];
      if (!record?.name || record.mergedInto || record.retired) { missing.push(person.name); continue; }
      const utr = Number.isFinite(record.seed?.singles) ? record.seed.singles : null;
      if (!resolved.some(r => r.playerId === playerId)) resolved.push({ playerId, name: record.name, utr: utr ?? person.rating, flagged: utr === null });
    }
    const plan = season => Object.values(season.public[seasonId].players).sort((a, b) => a.rank - b.rank);
    const preview = planSeason(resolved, { seasonId, title, now: Date.now() });
    console.log(`Season “${title}” (${seasonId}) at ${ladderPath}: ${resolved.length} of ${roster.length} players matched to PPRC records.`);
    for (const p of plan(preview)) console.log(`  ${String(p.rank).padStart(2)}. ${p.name}  ${p.utr ?? '—'}${resolved.find(r => r.name === p.name)?.flagged ? '  (no UTR on file: seeded from the ladder rating)' : ''}`);
    if (missing.length) console.log(`\nNot matched, left out (enroll them from /ladder/organizer once they are in the PPRC list):\n  ${missing.join('\n  ')}`);
    if (!write) { console.log('\nDry run: nothing was written. Add --write to create this draft season.'); process.exit(0); }
    const now = Date.now(), result = await db.ref(ladderPath).transaction(current => (current?.index?.seasons?.[seasonId] ? undefined : planSeason(resolved, { seasonId, title, now, existing: current })));
    if (!result.committed) throw new Error('The season was not created (it may have been created meanwhile). Nothing was changed.');
    console.log(`\nCreated as a draft. Next: open /ladder/organizer, review Rules settings, link each player’s sign-in, then Open season.`);
    process.exit(0);
  } catch (error) { console.error(`Failed: ${error.message}`); process.exit(4); }
}
