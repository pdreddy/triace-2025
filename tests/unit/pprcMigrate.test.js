import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMultiClub, reportText } from '../../functions/lib/pprcMigrate.js';

const line = (label, type, t1, t2, g1, g2, extra = {}) => ({ label, type, players: { team1: t1, team2: t2 }, g1, g2, ...extra });
const day = n => Date.UTC(2026, 0, n);
function exportData() {
  return {
    koc_users_grades: [
      { name: 'Dinkar Bhardwaj', s: 6.9, d: 6.4 }, { name: 'Krishna Vennapusa', s: 5.2, d: 5.5 }, { name: 'Krishna Pamarthi', s: 4.1, d: 4.3 },
      { name: 'Vinod Aripaka', s: 4.4, d: 5.5 }, { name: 'Vinod Punati', s: 4, d: 4 }, { name: 'Hari Mothukuri', s: 5, d: 5 }, { name: 'Rajesh Mishra', s: 5, d: 5 }
    ],
    ratingsMaster: { 'dinkar bhardwaj': { name: 'Dinkar Bhardwaj', playerId: 'PLYR-OLD-1', phone: '+1555', email: 'x@y.z' } },
    koc_s3: {
      teams: { t1: { id: 't1', name: 'Rudra', abbreviation: 'RR', group: 'A', captain: 'Dinkar Bhardwaj', password: 'secret', players: [{ name: 'Dinkar Bhardwaj' }, { name: 'Krishna Vennapusa' }] } },
      matches: {
        k1: { status: 'APPROVED', ts: day(100), t1: 'Rudra', t2: 'Agni', g1: 8, g2: 3, s1: 1, s2: 0, lines: [line('Singles', 'singles', ['Dinkar Bhardwaj'], ['Rajesh Mishra'], 8, 3, { winnerTeamNum: 1 })] },
        k2: { status: 'PENDING', ts: day(101), t1: 'Rudra', t2: 'Agni', g1: 1, g2: 8, s1: 0, s2: 1, lines: [line('Singles', 'singles', ['Dinkar Bhardwaj'], ['Rajesh Mishra'], 1, 8)] }
      }
    },
    KOC2DB: { a1: { ts: day(5), t1: 'Rudra', t2: 'Agni', g1: 8, g2: 4, s1: 1, s2: 0, lines: [line('Doubles 1', 'doubles', ['Dinkar Bhardwaj', 'Krishna Vennapusa'], ['Rajesh Mishra', 'Hari Mothukuri'], 8, 4, { setWins: { team1: 2, team2: 0 } })] } },
    KOC2DBPONEW: { a1: { ts: day(5), t1: 'Rudra', t2: 'Agni', g1: 8, g2: 4, s1: 1, s2: 0, lines: [line('Doubles 1', 'doubles', ['DINKAR', 'KRISHNA'], ['RAJESH', 'HARI'], 8, 4)] } },
    TriAceDBNEW: {
      x1: { ts: day(20), t1: 'Team A', t2: 'Team B', g1: 8, g2: 2, s1: 1, s2: 0, lines: [line('S1', 'singles', ['Dinkar'], ['Hari Mothkuri'], 8, 2, { winnerTeamNum: 1 })] },
      x2: { ts: day(21), t1: 'Team A', t2: 'Team B', g1: 8, g2: 6, s1: 1, s2: 0, lines: [line('S1', 'singles', ['Vinod'], ['Kalam'], 8, 6, { winnerTeamNum: 1 }), line('D1', 'doubles', ['Dinkar', 'Krishna'], ['Hari', 'Kalam'], 8, 5, { winnerTeamNum: 1 })] }
    }
  };
}

test('one master record per person, ids from the name, contact details never copied', () => {
  const { tree } = buildMultiClub(exportData());
  const m = tree.pprcMaster;
  assert.ok(m.players.p_dinkar_bhardwaj && m.nameIndex['dinkar bhardwaj'] === 'p_dinkar_bhardwaj');
  assert.deepEqual(m.players.p_dinkar_bhardwaj.legacyIds, ['PLYR-OLD-1']);
  assert.equal(new Set(Object.values(m.nameIndex)).size, Object.keys(m.players).length, 'every name key maps to one distinct person');
  const text = JSON.stringify(tree);
  for (const secret of ['secret', '+1555', 'x@y.z', 'password']) assert.ok(!text.includes(secret), `${secret} must not be copied`);
});

test('matches land in club and season, duplicates are dropped, only approved results count', () => {
  const { tree, report } = buildMultiClub(exportData());
  const s1 = tree.clubs.koc.seasons.s1.matches, s3 = tree.clubs.koc.seasons.s3.matches;
  assert.deepEqual(Object.keys(s1), ['koc-s1-a1']);
  assert.equal(s1['koc-s1-a1'].courts[0].names.home[0], 'Dinkar Bhardwaj', 'the full-name copy wins over the abbreviated one');
  assert.deepEqual(Object.keys(s3), ['koc-s3-k1'], 'the pending result is not imported');
  assert.equal(Object.keys(tree.clubs.triace.seasons.s1.matches).length, 2);
  assert.ok(tree.clubs.koc.seasons.s2.meta.note, 'season 2 exists even without data');
  assert.deepEqual(report.sources.filter(s => s.path === 'KOC2DBPONEW').map(s => [s.imported, s.duplicate]), [[0, 1]]);
  assert.equal(report.sources.find(s => s.path === 'koc_s3/matches').notApproved, 1);
  assert.deepEqual(Object.keys(tree.clubs.koc.seasons.s3.teams.t1), ['id', 'name', 'abbreviation', 'group', 'captain', 'players']);
});

test('first names are settled by the team, never guessed, and misspellings are flagged not duplicated', () => {
  const { tree, report } = buildMultiClub(exportData());
  const court = tree.clubs.triace.seasons.s1.matches['triace-s1-x1'].courts[0];
  assert.deepEqual([court.home, court.away], [undefined, undefined], 'a court with a name nobody could place is kept but not rated');
  assert.deepEqual(court.names, { home: ['Dinkar'], away: ['Hari Mothkuri'] }, 'the original names are kept');
  assert.deepEqual(Object.keys(report.names.similar), ['Hari Mothkuri']);
  assert.equal(report.names.similar['Hari Mothkuri'].closeTo, 'hari mothukuri');
  assert.ok(!tree.pprcMaster.players.p_hari_mothkuri, 'no duplicate person for a typo');
  assert.ok(report.names.ambiguous.Vinod.candidates.includes('p_vinod_aripaka'), 'Vinod stays ambiguous');
  assert.ok(report.names.unresolved.Kalam, 'an unknown single name waits for a decision');
});

test('overrides settle names and can introduce a person who is not in the master', () => {
  const { tree, report } = buildMultiClub(exportData(), { overrides: { Vinod: 'p_vinod_aripaka', Kalam: { name: 'Abdul Kalam', singles: 4.5 }, 'Hari Mothkuri': 'p_hari_mothukuri', Empty: '' } });
  const court = tree.clubs.triace.seasons.s1.matches['triace-s1-x2'].courts[0];
  assert.deepEqual([court.home, court.away], [['p_vinod_aripaka'], ['p_abdul_kalam']]);
  assert.equal(tree.pprcMaster.players.p_abdul_kalam.seed.singles, 4.5);
  assert.equal(tree.pprcMaster.ratings.p_abdul_kalam.seed.singles, 4.5);
  assert.deepEqual(Object.keys(report.names.ambiguous), ['Krishna'], 'a first name shared by two players on no known team stays open');
  assert.equal(tree.clubs.triace.seasons.s1.matches['triace-s1-x1'].courts[0].away[0], 'p_hari_mothukuri');
  assert.deepEqual(tree.clubs.triace.seasons.s1.matches['triace-s1-x1'].courts[0].home, ['p_dinkar_bhardwaj'], 'a unique first name resolves');
});

test('one rating run covers every club and season; history is stored by year with the latest ten', () => {
  const { tree } = buildMultiClub(exportData(), { overrides: { Vinod: 'p_vinod_aripaka', Krishna: 'p_krishna_vennapusa', 'Hari Mothkuri': 'p_hari_mothukuri', Kalam: { name: 'Abdul Kalam' } } });
  const m = tree.pprcMaster, id = 'p_dinkar_bhardwaj';
  const clubs = Object.values(m.ratingHistory[id]['2026']).map(e => `${e.club}/${e.season}`).sort();
  assert.deepEqual(clubs, ['koc/s1', 'koc/s3', 'triace/s1', 'triace/s1']);
  assert.equal(m.ratings[id].played.singles + m.ratings[id].played.doubles, 4);
  assert.deepEqual(m.recent[id].map(e => e.ts), [...m.recent[id].map(e => e.ts)].sort((a, b) => b - a), 'newest first');
  assert.ok(m.ratings[id].version >= 1 && m.meta.algorithm.version >= 1);
});

test('the report lists what needs a decision', () => {
  const text = reportText(buildMultiClub(exportData()).report);
  for (const part of ['## Players', '## Matches by source', 'ambiguous names', 'unknown single names', 'Possible misspellings', '"Vinod"']) assert.ok(text.includes(part), part);
});
