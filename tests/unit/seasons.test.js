import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonsOf, seasonTiers, tierResult, seasonTeams, bundledSeason1, season1Source } from '../../src/data/seasons.js';
import { resolveDbPaths } from '../../functions/lib/paths.js';
import { validateLegacySeason } from '../../functions/lib/legacy.js';
import { buildRules } from '../../functions/lib/rules.js';
import { readFileSync as readFile } from 'node:fs';

const season1 = seasonsOf({}).s1;

test('Season 1 import keeps every encounter, both groups and every team’s members', () => {
  assert.deepEqual(seasonTiers(season1).map(t => t.name), ['Group A', 'Group B']);
  assert.equal(Object.keys(season1.fixtures.a).length + Object.keys(season1.fixtures.b).length, 73);
  assert.equal(season1.table.a.length, 9);
  assert.equal(season1.table.b.length, 9);
  const teams = seasonTeams(season1);
  assert.equal(teams.size, 18);
  assert.ok([...teams.values()].every(t => t.members.split('/').length === 3));
  assert.equal(season1.grandFinal, undefined);
});

test('published table agrees with the imported results on played, won and lost', () => {
  for (const tier of ['a', 'b']) {
    for (const row of season1.table[tier]) {
      const games = Object.values(season1.fixtures[tier]).filter(f => f.home === row.teamId || f.away === row.teamId);
      const won = games.filter(f => f[f.result.winner] === row.teamId).length;
      assert.deepEqual([games.length, won, games.length - won], [row.m, row.w, row.l], row.teamId);
    }
  }
});

test('Season 1 table rows carry the last five results', () => {
  for (const row of [...season1.table.a, ...season1.table.b]) {
    assert.equal(row.form.length, Math.min(5, row.m), row.teamId);
    assert.ok(row.form.every(r => r === 'W' || r === 'L'));
  }
  assert.equal(season1.table.b.find(r => r.teamId === 'b9').form.join(''), 'LLLLL');
});

test('Season 1 Super Six winners and squads', () => {
  assert.deepEqual(season1.championTiers.map(t => t.name), ['GOAT tier', 'Rising Aces']);
  assert.deepEqual(tierResult(season1, 'goat'), { winner: 'a1', runnerUp: 'a2' });
  assert.deepEqual(tierResult(season1, 'rising'), { winner: 'a5', runnerUp: 'b5' });
  const { tiers, weeks, rosters } = season1.superSix, teams = seasonTeams(season1);
  assert.ok(Object.values(tiers).every(t => t.teams.length === 6));
  assert.equal(weeks.length, 3);
  for (const week of weeks) for (const [tier, matches] of Object.entries(week.matches)) {
    assert.equal(matches.length, 3);
    assert.ok(matches.every(m => tiers[tier].teams.includes(m.home) && tiers[tier].teams.includes(m.away) && rosters[m.home] && rosters[m.away]));
  }
  assert.equal(teams.get('a1').superSixMembers, 'Yogesh / Dinkar / Sudharshan');
});

test('closed seasons use their recorded champions', () => {
  const closed = { champions: { goat: { winner: 'x', runnerUp: 'y' } } };
  assert.deepEqual(tierResult(closed, 'goat'), { winner: 'x', runnerUp: 'y' });
  assert.equal(tierResult(closed, 'rising'), null);
});

test('Season 1 read back from Firebase (JSON round trip) gives the same season', () => {
  const stored = JSON.parse(JSON.stringify(bundledSeason1()));   // what the Realtime Database returns
  const data = { legacySeasons: { s1: stored } };
  assert.equal(season1Source(data), 'firebase');
  assert.equal(season1Source({}), 'bundled');
  const live = seasonsOf(data).s1;
  assert.deepEqual(live.table, season1.table);
  assert.deepEqual(tierResult(live, 'goat'), { winner: 'a1', runnerUp: 'a2' });
});

test('full names appear only where the database spells them out, and only in the champions fields', () => {
  const a5 = seasonTeams(season1).get('a5');
  assert.equal(a5.members, 'Hari/Ram/Satish');
  assert.equal(a5.fullMembers, 'Hari Mothkuri / Ram / Satish');
});

test('database paths: defaults, overrides and validation', () => {
  assert.deepEqual(resolveDbPaths(), { root: 'traice2_0', season1: 'traice2_0/season1', season1UnderRoot: true });
  assert.deepEqual(resolveDbPaths({ root: '/clubs/triace/', season1: 'legacy/s1' }), { root: 'clubs/triace', season1: 'legacy/s1', season1UnderRoot: false });
  assert.equal(resolveDbPaths({ root: 'live' }).season1, 'live/season1');
  assert.throws(() => resolveDbPaths({ root: 'bad.path' }), /not a valid database path/);
  assert.throws(() => resolveDbPaths({ season1: 'a/$b' }), /not a valid database path/);
});

test('Season 1 import validation', () => {
  assert.doesNotThrow(() => validateLegacySeason(bundledSeason1()));
  assert.throws(() => validateLegacySeason({}), /not the Season 1 data/);
  assert.throws(() => validateLegacySeason({ ...bundledSeason1(), fixtures: null }), /missing “fixtures”/);
});

test('Season 1 can never be pointed at live tournament data', () => {
  const refuse = (paths, pattern) => assert.throws(() => resolveDbPaths(paths), pattern, JSON.stringify(paths));
  refuse({ season1: 'traice2_0' }, /cannot be the database root/);
  refuse({ season1: 'traice2_0/' }, /cannot be the database root/);
  refuse({ root: 'clubs/triace', season1: 'clubs' }, /contains the database root/);
  refuse({ root: 'clubs/triace', season1: 'clubs/triace' }, /cannot be the database root/);
  for (const node of ['settings', 'tierConfig', 'tiers', 'registrations', 'teamsByOwner', 'fixtures', 'leagueRules', 'season', 'seasons', 'schedules', 'archive', 'configRevision']) {
    refuse({ season1: `traice2_0/${node}` }, /inside/);
    refuse({ season1: `traice2_0/${node}/s1` }, /inside/);
  }
  assert.doesNotThrow(() => resolveDbPaths({ season1: 'traice2_0/legacy/season1' }));
  assert.doesNotThrow(() => resolveDbPaths({ root: 'clubs/triace', season1: 'clubs/legacy' }));   // a sibling, not an ancestor
  assert.doesNotThrow(() => resolveDbPaths({ season1: 'traice2_0/season10' }));                  // similar name, different node
});

const template = JSON.parse(readFile(new URL('../../database.rules.template.json', import.meta.url), 'utf8'));
test('database.rules.json is exactly what the template generates for the default paths', () => {
  const committed = JSON.parse(readFile(new URL('../../database.rules.json', import.meta.url), 'utf8'));
  assert.deepEqual(buildRules(template, {}), committed);
  assert.equal(committed.rules.traice2_0.season1['.read'], true);
  assert.equal(committed.rules['.write'], false);
});

test('rules follow a custom root and Season 1 path', () => {
  const custom = buildRules(template, { root: 'clubs/triace', season1: 'clubs/triace/legacy/s1' }).rules;
  assert.equal(custom.traice2_0, undefined);                                             // nothing left at the old root
  assert.equal(custom.clubs.triace.registrations['.read'].includes('admin'), true);      // private data stays private
  assert.equal(custom.clubs.triace.legacy.s1['.read'], true);
  const outside = buildRules(template, { root: 'live', season1: 'archive/season1' }).rules;
  assert.equal(outside.live.settings['.read'], true);
  assert.equal(outside.archive.season1['.read'], true);                                  // outside the root: its own rule
  assert.equal(outside.live.season1, undefined);
  for (const rules of [custom, outside]) assert.equal(JSON.stringify(rules).includes('"\\.write": true'), false);
  assert.throws(() => buildRules(template, { season1: 'traice2_0/registrations' }), /inside/);
});
