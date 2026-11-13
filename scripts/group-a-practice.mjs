// LOCAL ONLY: actual Group A names, UTR seeds and reference matches; fresh practice results.
import fs from 'node:fs';
import { ladderSeason, parseLadder, LADDER } from '../functions/lib/ladder.js';
import { buildMultiClub } from '../functions/lib/pprcMigrate.js';
import { parseUtrFile } from '../functions/lib/pprcSync.js';
import { nameKey } from '../functions/lib/pprc.js';
import { applyLadder } from '../functions/lib/singlesLadder/engine.js';
import { DEFAULT_RULES } from '../functions/lib/singlesLadder/config.js';
import { matchRoster } from './ladder-setup.mjs';

export const GROUP_A_SEASON = 'group-a-practice';
export const GROUP_A_PASSWORD = 'groupa2026'; // Public, loopback-only test password. Never provisioned in Firebase.
const PAIRS = [
  ['Usman Jehangiri', 'Vinod Marakoosham', 'groupa.usman', 'groupa.vinod'],
  ['Mahidhar Penigi', 'Nagarjuna Saladi', 'groupa.mahidhar', 'groupa.nagarjuna'],
  ['Mohamed Noufal', 'Malla Reddy Cheerke', 'groupa.noufal', 'groupa.malla']
];
export function groupAPractice(now = Date.now()) {
  const read = name => fs.readFileSync(new URL(`migration/${name}`, import.meta.url), 'utf8');
  const source = read('ladder-2026.psv'), decisions = JSON.parse(read('name-decisions.json'));
  const group = ladderSeason(source, decisions).groups.find(g => g.name === 'Group A');
  const { tree } = buildMultiClub({ [LADDER.path]: parseLadder(source).matches }, { seeds: parseUtrFile(read('utr-seeds.csv'), 'utr-seeds.csv').rows, overrides: decisions });
  const { resolved, missing } = matchRoster(group.players.map(p => ({ name: p.name, key: p.key, rating: null })), { index: tree.pprcMaster.nameIndex, players: tree.pprcMaster.players, decisions });
  if (missing.length) throw new Error(`Cannot resolve Group A players: ${missing.map(p => p.name).join(', ')}`);
  const records = new Map(resolved.map(p => [nameKey(p.from), p]));
  const organizer = { uid: 'local_group_a_setup', admin: true }; let ladder = {}, n = 0, clock = now - 120000;
  const step = (payload, actor = organizer) => {
    const out = applyLadder(ladder, { seasonId: GROUP_A_SEASON, ...payload }, actor, { now: clock++, id: `groupa_${++n}` });
    ladder = out.state; return out.result;
  };
  step({ action: 'createSeason', name: 'Group A · Local practice', reason: 'Practice with the actual Group A roster' });
  for (const player of resolved) step({ action: 'enroll', playerId: player.playerId, name: player.name, utr: player.utr, verified: true, reason: 'Actual Group A roster and recorded UTR seeds' });
  step({ action: 'seed', reason: 'Practice positions seeded from recorded singles UTRs' });
  const values = structuredClone(DEFAULT_RULES);
  values.match.thirdSet = 'either'; values.deadline.minDays = 3;
  step({ action: 'saveRules', values, baseVersion: 1, reason: 'Local practice: three places up, five after two wins, top three may challenge three down' });
  const accounts = [], fixtures = [];
  for (const [home, away, homeUsername, awayUsername] of PAIRS) {
    const match = group.matches.find(m => m.home.key === nameKey(home) && m.away.key === nameKey(away) && m.kind === 'played' && m.confirmed);
    if (!match) throw new Error(`Missing actual Group A match: ${home} v ${away}`);
    for (const [name, username] of [[home, homeUsername], [away, awayUsername]]) {
      const p = records.get(nameKey(name)), uid = `local_group_a_${p.playerId}`;
      accounts.push({ username, uid, playerId: p.playerId, name: p.name });
      step({ action: 'link', uid, playerId: p.playerId, reason: 'Local practice account representing a Group A player' });
    }
    fixtures.push({ match, home: records.get(nameKey(home)), away: records.get(nameKey(away)) });
  }
  step({ action: 'setStatus', status: 'active', reason: 'Open the isolated local Group A practice season' });
  // These six results are SAMPLE practice outcomes, never imported official results.
  // Every challenge goes through the real range, acceptance, scoring and confirmation checks.
  const rounds = [
    [['Mohamed Noufal', 'Abhishek Kadavil Venugopalan'], ['Brian Chong', 'Durga Kalavakolanu'], ['Hari Mothukuri', 'Saket Raizada']],
    [['Mohamed Noufal', 'Damodhara Palavali'], ['Brian Chong', 'Uday Katikala'], ['Hari Mothukuri', 'Durga Kalavakolanu']]
  ].map((pairs, index) => ({ round: index + 1, matches: pairs.map(([homeName, awayName]) => {
    const home = records.get(nameKey(homeName)), away = records.get(nameKey(awayName));
    const actor = player => {
      const uid = `local_group_a_${player.playerId}`;
      if (!ladder.accounts[uid]) step({ action: 'link', uid, playerId: player.playerId, reason: 'Local-only sample round participant' });
      return { uid };
    };
    const homeActor = actor(home), awayActor = actor(away);
    const { challengeId } = step({ action: 'challenge', opponentId: away.playerId }, homeActor);
    step({ action: 'respond', challengeId, accept: true }, awayActor);
    step({ action: 'submit', challengeId, score: '6-4 6-3', winnerId: home.playerId }, homeActor);
    step({ action: 'confirm', challengeId }, awayActor);
    return { challengeId, home: home.name, away: away.name, winner: home.name, score: '6-4 6-3' };
  }) }));
  clock = now;
  const matches = fixtures.map(({ match, home, away }) => {
    const uid = accounts.find(a => a.playerId === home.playerId).uid;
    const { challengeId } = step({ action: 'challenge', opponentId: away.playerId }, { uid });
    const score = match.sets.split(',').map(part => {
      const tb = part.match(/^\s*[01]-[01]\s*\(TB\s+(\d+-\d+)\)/i);
      return tb ? tb[1] : part.match(/\d+-\d+/)?.[0];
    }).join(' ');
    return { challengeId, home: home.name, away: away.name, homeId: home.playerId, awayId: away.playerId, round: match.round, sourceDate: match.date, originalScore: match.sets, score, winnerId: match.winner === 'home' ? home.playerId : away.playerId, winner: match.winner === 'home' ? home.name : away.name };
  });
  return {
    ladder: JSON.parse(JSON.stringify(ladder)), accounts,
    practice: { seasonId: GROUP_A_SEASON, version: 2, name: 'Group A local practice', players: resolved.length, rounds, matches, source: 'scripts/migration/ladder-2026.psv', utrSource: 'scripts/migration/utr-seeds.csv' },
    pprc: { pprcMaster: tree.pprcMaster, pprcClubs: tree.clubs }
  };
}
