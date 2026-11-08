import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseLadder, parseSets, LADDER } from '../../functions/lib/ladder.js';
import { buildMultiClub, applySeeds } from '../../functions/lib/pprcMigrate.js';
import { parseUtrFile } from '../../functions/lib/pprcSync.js';
import { playerBadges, seasonLabel } from '../../functions/lib/pprcBadges.js';

const file = name => fs.readFileSync(new URL(`../../scripts/migration/${name}`, import.meta.url), 'utf8');

test('sets are read from the home side; a match tiebreak counts one game', () => {
  assert.deepEqual(parseSets('7-6 (TB 8-6), 3-6, 1-0 (TB 12-10)'), [{ team1: 7, team2: 6 }, { team1: 3, team2: 6 }, { team1: 1, team2: 0 }]);
  assert.deepEqual(parseSets('—'), []);
});

test('Ladder 2026: 92 results read; ties, walkovers and the unconfirmed bye are left out; winners agree with the sets', () => {
  const { matches, report } = parseLadder(file('ladder-2026.psv'));
  assert.equal(report.read, 92);
  assert.equal(report.counted, 86);
  assert.deepEqual(report.skipped.map(s => s.reason).sort(), ['status "Pending Confirmation"', 'tie', 'tie', 'walkover', 'walkover', 'walkover']);
  for (const m of Object.values(matches)) {
    const [line] = m.lines, home = line.sets.filter(s => s.team1 > s.team2).length, away = line.sets.filter(s => s.team2 > s.team1).length;
    assert.equal(line.winnerTeamNum, home > away ? 1 : 2, `${m.t1} v ${m.t2}`);
  }
  assert.equal(Object.values(matches).filter(m => m.isPlayoff).length, 1);
  assert.ok(Object.values(matches).every(m => m.lines.length === 1 && m.lines[0].type === 'singles'), 'a singles ladder');
});

test('two meetings with the same score are both kept (the duplicate check includes the date)', () => {
  const { matches } = parseLadder(file('ladder-2026.psv'));
  const meetings = Object.values(matches).filter(m => m.t1 === 'Malla Reddy Cheerke' && m.t2 === 'Usman Jehangiri');
  assert.equal(meetings.length, 2);
});

test('the ladder is rated with the UTR file as the starting point, under one name per person', () => {
  const seeds = parseUtrFile(file('utr-seeds.csv'), 'utr-seeds.csv').rows;
  const overrides = JSON.parse(file('name-decisions.json'));
  const { tree, report } = buildMultiClub({ [LADDER.path]: parseLadder(file('ladder-2026.psv')).matches }, { seeds, overrides });
  assert.equal(report.courts.rated, 86);
  assert.equal(report.decisions.length, 0);
  const names = Object.values(tree.pprcMaster.players).map(p => p.name);
  assert.ok(names.includes('Sridhar Kuppuswamy') && !names.includes('Sridhar Kuppusamy'), 'the ladder spelling joins the KOC player');
  assert.ok(names.includes('Damu Palavali') && !names.includes('Damodhara Palavali'));
  const id = Object.entries(tree.pprcMaster.players).find(([, p]) => p.name === 'Prashanth Gourineni')[0];
  const rating = tree.pprcMaster.ratings[id];
  assert.deepEqual(rating.seasons.ladder_y2026, { club: 'ladder', season: 'y2026', courts: 5, wins: 5, losses: 0 });
  assert.ok(tree.pprcMaster.playerList[id].clubs.includes('ladder'));
  assert.ok(rating.seed.singles > 1, 'the UTR file seeded the player');
});

test('a UTR file replaces the old starting rating and adds full names; ambiguous names are reported', () => {
  const master = {
    p_a_b: { id: 'p_a_b', name: 'Asha Rao', nameKey: 'asha rao', clubs: {}, seed: { singles: 5, doubles: 5 } },
    p_c_d: { id: 'p_c_d', name: 'Krishna Anand', nameKey: 'krishna anand', clubs: {}, seed: {} },
    p_e_f: { id: 'p_e_f', name: 'Krishna Bhat', nameKey: 'krishna bhat', clubs: {}, seed: {} }
  };
  const out = applySeeds(master, [{ name: 'Asha Rao', singles: 6.5 }, { name: 'New Person', singles: 4, doubles: 4.2 }, { name: 'Krishna', singles: 5 }, { name: 'Solo' , singles: 5 }]);
  assert.deepEqual(master.p_a_b.seed, { singles: 6.5, doubles: 5 }, 'only the given fields change');
  assert.equal(out.created, 1);
  assert.equal(out.ambiguous.length, 1);
  assert.ok(master.p_new_person);
});

test('the Ladder badge reads "Ladder 2026" with a ladder icon', () => {
  assert.equal(seasonLabel('ladder', 'y2026'), 'Ladder 2026');
  const badges = playerBadges({ rating: { played: { singles: 5, doubles: 0 }, seasons: { ladder_y2026: { club: 'ladder', season: 'y2026' } }, doubles: 5, singles: 5, record: {} }, info: { clubs: { ladder: true } } });
  const ladder = badges.find(b => b.label === 'Ladder 2026');
  assert.equal(ladder.icon, 'ladder');
  assert.equal(ladder.club, 'ladder');
});
