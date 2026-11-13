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

test('Ladder 2026: 96 results read; ties, walkovers and unconfirmed results are left out; winners agree with the sets', () => {
  const { matches, report } = parseLadder(file('ladder-2026.psv'));
  assert.equal(report.read, 96);
  assert.equal(report.counted, 88);
  assert.deepEqual(report.skipped.map(s => s.reason).sort(), ['status "Pending Confirmation"', 'status "Pending Confirmation"', 'status "Pending Confirmation"', 'tie', 'tie', 'walkover', 'walkover', 'walkover']);
  for (const m of Object.values(matches)) {
    const [line] = m.lines, home = line.sets.filter(s => s.team1 > s.team2).length, away = line.sets.filter(s => s.team2 > s.team1).length;
    assert.equal(line.winnerTeamNum, home > away ? 1 : 2, `${m.t1} v ${m.t2}`);
  }
  assert.equal(Object.values(matches).filter(m => m.isPlayoff).length, 2);
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
  assert.equal(report.courts.rated, 88);
  assert.equal(report.decisions.length, 0);
  const names = Object.values(tree.pprcMaster.players).map(p => p.name);
  assert.ok(names.includes('Sridhar Kuppuswamy') && !names.includes('Sridhar Kuppusamy'), 'the ladder spelling joins the KOC player');
  assert.ok(names.includes('Damodhara Palavali') && !names.includes('Damodhara Reddy Palavali') && !names.includes('Damu Palavali'), 'Damu, Damodhara and Damodhara Reddy Palavali are one player: Damodhara Palavali');
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

test('Ladder 2026 for display: every row, PPRC spellings, group records, playoffs and the champion once a final exists', async () => {
  const { ladderSeason } = await import('../../functions/lib/ladder.js');
  const decisions = JSON.parse(file('name-decisions.json')), season = ladderSeason(file('ladder-2026.psv'), decisions);
  assert.deepEqual([season.players, season.matches, season.groups.map(g => g.name).join(), season.playoffs.length, season.champion], [62, 96, 'Group A,Group B,Group C,Group D', 2, null]);
  const names = season.groups.flatMap(g => g.players.map(p => p.name));
  for (const [typed, pprc] of [['Dinesh Timmareddy', 'Dinesh Reddy Timmareddy'], ['Vivekvardhan Mereddy', 'Vivekvardhan Reddy Mereddy'], ['Joel Kodooru', 'Joel Kodoru'], ['Sridhar Kuppusamy', 'Sridhar Kuppuswamy']]) { assert.ok(names.includes(pprc), pprc); assert.ok(!names.includes(typed), typed); }
  const b = season.groups[1], joel = b.players.find(p => p.name === 'Joel Kodoru');
  assert.deepEqual([joel.played, joel.won, joel.lost], [3, 2, 1]);            // the result still waiting for confirmation is listed but not counted
  assert.equal(b.matches.filter(m => !m.confirmed).length, 2);
  const tie = season.groups[3].matches.find(m => m.kind === 'tie');
  assert.deepEqual([tie.winner, tie.sets], [null, '']);
  const done = ladderSeason('Stage|Group|Round|Home|Away|Winner|WinType|Date|Sets|Status\nPlayoffs|—|Final|Ann Lee|Bo Diaz|Bo Diaz|Score|2026-12-01 01:00|4-6, 3-6|Locked\nPlayoffs|—|SF|Ann Lee|Cy Roe|Ann Lee|Score|2026-11-20 01:00|6-1, 6-1|Locked');
  assert.deepEqual([done.champion.name, done.runnerUp.name, done.playoffs.map(m => m.round)], ['Bo Diaz', 'Ann Lee', ['SF', 'Final']]);
});
