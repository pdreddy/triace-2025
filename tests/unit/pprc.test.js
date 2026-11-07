import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PPRC_PARAMS, matchPlayers, displayName, nameKey, playerIdFor, createRegistry, resolveName, computePprc, splitHistory } from '../../functions/lib/pprc.js';

test('name keys ignore case, accents, punctuation and spacing', () => {
  assert.equal(nameKey('  José  O’Neil-Smith '), 'jose o neil smith');
  assert.equal(nameKey('DINKAR   Bhardwaj'), 'dinkar bhardwaj');
  assert.equal(nameKey(null), '');
  assert.equal(playerIdFor('Dinkar Bhardwaj'), 'p_dinkar_bhardwaj');
  assert.equal(playerIdFor('dinkar  BHARDWAJ'), playerIdFor('Dinkar Bhardwaj'), 'the same person always gets the same id');
});

const registry = overrides => createRegistry([
  { id: 'p_sashi_raju', name: 'Sashi Raju' }, { id: 'p_vinod_a', name: 'Vinod Aripaka' }, { id: 'p_vinod_m', name: 'Vinod Marakoosham' },
  { id: 'p_krishna_v', name: 'Krishna Vennapusa', aliases: ['KV'] }, { id: 'p_dinkar', name: 'Dinkar Bhardwaj' }, { id: 'p_satish_o', name: 'Satish Ogirala' }, { id: 'p_satish_k', name: 'Satish Kumar' }
], overrides);

test('names resolve exactly, by alias, by unique tokens, and never by guessing', () => {
  const r = registry();
  assert.deepEqual(resolveName(r, 'DINKAR BHARDWAJ'), { id: 'p_dinkar', how: 'exact', candidates: [] });
  assert.equal(resolveName(r, 'kv').how, 'exact');
  assert.equal(resolveName(r, 'kv').id, 'p_krishna_v');
  assert.deepEqual(resolveName(r, 'Sashi R'), { id: 'p_sashi_raju', how: 'tokens', candidates: [] });
  assert.equal(resolveName(r, 'Dinkar').id, 'p_dinkar');
  assert.deepEqual(resolveName(r, 'Vinod'), { id: null, how: 'ambiguous', candidates: ['p_vinod_a', 'p_vinod_m'] });
  assert.equal(resolveName(r, 'Vinod A').id, 'p_vinod_a');
  assert.equal(resolveName(r, 'Satish O').id, 'p_satish_o');
  assert.deepEqual(resolveName(r, 'Nobody'), { id: null, how: 'unknown', candidates: [] });
  assert.equal(resolveName(r, '').how, 'unknown');
});

test('admin overrides win, and a roster can settle an ambiguous first name', () => {
  assert.deepEqual(resolveName(registry({ Vinod: 'p_vinod_m' }), 'vinod'), { id: 'p_vinod_m', how: 'override', candidates: [] });
  assert.deepEqual(resolveName(registry(), 'Vinod', { roster: ['p_vinod_a', 'p_dinkar'] }), { id: 'p_vinod_a', how: 'roster', candidates: [] });
  assert.equal(resolveName(registry(), 'Vinod', { roster: ['p_vinod_a', 'p_vinod_m'] }).how, 'ambiguous');
});

const court = (home, away, winner, hg = 8, ag = 3, type = 'singles') => ({ label: 'c', type, home, away, homeGames: hg, awayGames: ag, winner });
const DAY = 86400000;
const match = (id, ts, courts, extra = {}) => ({ id, club: 'koc', season: 's3', ts, courts, ...extra });
const seeds = { a: { singles: 6, doubles: 6 }, b: { singles: 6, doubles: 6 }, c: { singles: 5, doubles: 5 }, d: { singles: 5, doubles: 5 }, e: { singles: 6, doubles: 6 } };
const weekly = (n, makeCourt) => Array.from({ length: n }, (_, i) => match(`m${i}`, i * 7 * DAY, [makeCourt(i)]));

test('winning games against an equal player raises the rating, losing them lowers it; evidence builds reliability', () => {
  const six = computePprc({ players: seeds, matches: weekly(6, () => court(['a'], ['b'], 'home', 8, 3)) }).ratings;
  assert.ok(six.a.singles > 6 && six.b.singles < 6, 'a rose and b fell from their seed of 6');
  assert.ok(Math.abs((six.a.singles - 6) + (six.b.singles - 6)) < 0.05, 'what one gains the other loses, for equal opponents');
  const twelve = computePprc({ players: seeds, matches: weekly(12, () => court(['a'], ['b'], 'home', 8, 3)) }).ratings;
  assert.ok(six.a.reliability.singles > 0.4 && six.a.reliability.singles < 1);
  assert.ok(twelve.a.reliability.singles > six.a.reliability.singles, 'more courts, more reliable');
  assert.equal(six.a.reliability.doubles, 0, 'doubles has no evidence yet');
  assert.equal(six.a.doubles, 6, 'the doubles rating is untouched by singles');
});

test('a bigger share of games moves the rating more, and a win is never rated below the opponents', () => {
  const close = computePprc({ players: seeds, matches: weekly(4, () => court(['a'], ['b'], 'home', 8, 7)) }).ratings.a.singles;
  const wide = computePprc({ players: seeds, matches: weekly(4, () => court(['a'], ['b'], 'home', 8, 0)) }).ratings.a.singles;
  assert.ok(wide > close, '8-0 says more than 8-7');
  const tight = computePprc({ players: { top: { singles: 12 }, low: { singles: 3 } }, matches: [match('m', 1, [court(['top'], ['low'], 'home', 8, 7)])] }).ratings;
  assert.ok(tight.top.singles < 12 && tight.top.singles > 3 && tight.low.singles > 3, 'a narrow win over a much weaker player does not impress, but is still not a loss');
});

test('an upset moves ratings more than an expected result', () => {
  const expected = computePprc({ players: seeds, matches: [match('m', 1, [court(['a'], ['c'], 'home', 8, 3)])] }).ratings.a.singles - 6;
  const upset = computePprc({ players: seeds, matches: [match('m', 1, [court(['c'], ['a'], 'home', 8, 3)])] }).ratings.c.singles - 5;
  assert.ok(upset > expected);
});

test('doubles: all four players move the right way, in doubles only, and the partner is not credited twice', () => {
  const { ratings, history } = computePprc({ players: seeds, matches: [match('m', 1, [court(['a', 'c'], ['b', 'd'], 'home', 8, 4, 'doubles')])] });
  assert.ok(ratings.a.doubles > 6 && ratings.c.doubles > 5 && ratings.b.doubles < 6 && ratings.d.doubles < 5);
  assert.equal(ratings.a.singles, 6, 'singles rating untouched');
  assert.equal(history.a[0].partner, 'c'); assert.deepEqual(history.a[0].opponents, ['b', 'd']); assert.equal(history.a[0].type, 'doubles');
  assert.deepEqual([ratings.a.record.doubles, ratings.b.record.doubles], [{ wins: 1, losses: 0 }, { wins: 0, losses: 1 }]);
  assert.ok(Math.abs((ratings.c.doubles - 5) - (ratings.a.doubles - 6)) < 0.02, 'partners share a result equally: the pair\'s level is split, not credited twice');
});

test('a new player moves more than an established one for the same result', () => {
  const warmup = weekly(12, i => court(['a'], ['b'], i % 2 ? 'home' : 'away', 8, 4));
  const last = match('x', 100 * DAY, [court(['e'], ['a'], 'home', 8, 3)]);
  const fresh = 6 - computePprc({ players: seeds, matches: [last] }).ratings.a.singles;
  const before = computePprc({ players: seeds, matches: warmup }).ratings.a, after = computePprc({ players: seeds, matches: [...warmup, last] }).ratings.a;
  assert.ok(fresh > 0.1, 'one loss moves a player with no history');
  assert.ok(before.singles - after.singles < fresh, 'the same loss moves a player with a record less');
  assert.ok(after.reliability.singles > 0.5, 'the veteran has real evidence behind their rating');
});

test('order of input does not matter, every club feeds the same player, and history is chronological', () => {
  const ms = [match('m3', 30 * DAY, [court(['c'], ['a'], 'home')], { club: 'triace', season: 's1' }), match('m1', 10 * DAY, [court(['a'], ['b'], 'home')]), match('m2', 20 * DAY, [court(['b'], ['c'], 'away', 5, 8)])];
  const forward = computePprc({ players: seeds, matches: ms }), reversed = computePprc({ players: seeds, matches: [...ms].reverse() });
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward.history.a.map(h => h.matchId), ['m1', 'm3']);
  assert.deepEqual(forward.history.a.map(h => [h.club, h.season]), [['koc', 's3'], ['triace', 's1']]);
  assert.equal(forward.ratings.a.played.singles, 2);
  assert.ok(forward.history.a.every(h => Number.isFinite(h.after) && Number.isFinite(h.change) && Number.isFinite(h.overall)));
});

test('older results count less: with no new matches a rating drifts back toward the seed', () => {
  const ms = weekly(4, i => court(['a'], ['c'], i % 2 ? 'away' : 'home', 8, i % 2 ? 6 : 2));
  const now = computePprc({ players: seeds, matches: ms }).ratings.a.singles;
  const later = computePprc({ players: seeds, matches: ms, asOf: ms[3].ts + 400 * DAY }).ratings.a.singles;
  assert.ok(Math.abs(later - 6) < Math.abs(now - 6), 'a year on, the same courts say less');
});

test('bad courts are skipped and reported, not guessed', () => {
  const { skipped, ratings } = computePprc({ players: seeds, matches: [match('m', 1, [
    court(['a'], [], 'home'), court(['a'], ['zzz'], 'home'), { ...court(['a'], ['b'], 'home'), type: 'mixed' }, { ...court(['a'], ['b'], 'draw') }
  ])] });
  assert.deepEqual(skipped.map(s => s.reason), ['players', 'unknown player', 'type', 'winner']);
  assert.equal(ratings.a.played.singles, 0);
  assert.equal(ratings.a.singles, 6);
});

test('seeds fall back across disciplines, are clamped, and overall blends both', () => {
  const r = computePprc({ players: { x: { singles: 6 }, y: {}, z: { singles: 99, doubles: -4 } }, matches: [] }).ratings;
  assert.deepEqual([r.x.doubles, r.y.singles, r.z.singles, r.z.doubles], [6, PPRC_PARAMS.defaultSeed, PPRC_PARAMS.max, PPRC_PARAMS.min]);
  assert.equal(computePprc({ players: { p: { singles: 6, doubles: 4 } }, matches: [] }).ratings.p.overall, 5);
  assert.equal(computePprc({ players: { p: { singles: 6 } }, matches: [] }).ratings.p.version, PPRC_PARAMS.version);
});

test('ratings stay within the scale however many one-sided courts there are', () => {
  const ms = weekly(40, () => court(['a'], ['b'], 'home', 8, 0));
  const { ratings } = computePprc({ players: { a: { singles: 16 }, b: { singles: 1.2 } }, matches: ms });
  for (const id of ['a', 'b']) assert.ok(ratings[id].singles >= PPRC_PARAMS.min && ratings[id].singles <= PPRC_PARAMS.max);
});

test('history view: latest ten, then older matches grouped by year', () => {
  const at = (y, m, i) => ({ matchId: `m${y}${m}${i}`, ts: Date.UTC(y, m, 1 + i) });
  const entries = [...Array.from({ length: 4 }, (_, i) => at(2024, 3, i)), ...Array.from({ length: 5 }, (_, i) => at(2025, 5, i)), ...Array.from({ length: 12 }, (_, i) => at(2026, 2, i))];
  const view = splitHistory(entries);
  assert.equal(view.recent.length, 10);
  assert.ok(view.recent.every((e, i, a) => !i || a[i - 1].ts >= e.ts), 'newest first');
  assert.deepEqual(view.years.map(y => [y.year, y.count]), [[2026, 2], [2025, 5], [2024, 4]]);
  assert.equal(view.years.reduce((n, y) => n + y.count, 0) + view.recent.length, entries.length, 'nothing lost or repeated');
  assert.deepEqual(splitHistory(entries.slice(0, 3)), { recent: splitHistory(entries.slice(0, 3)).recent, years: [] });
  assert.deepEqual(splitHistory(undefined), { recent: [], years: [] });
});

test('a preferred list settles a name only when exactly one preferred player fits', () => {
  const r = registry();
  assert.equal(resolveName(r, 'Vinod', { preferred: new Set(['p_vinod_a']) }).id, 'p_vinod_a');
  assert.equal(resolveName(r, 'Vinod', { preferred: new Set(['p_vinod_a']) }).how, 'preferred');
  assert.equal(resolveName(r, 'Vinod', { preferred: new Set(['p_vinod_a', 'p_vinod_m']) }).how, 'ambiguous');
  assert.equal(resolveName(r, 'Vinod', { preferred: new Set(['p_dinkar']) }).how, 'ambiguous');
  assert.equal(resolveName(r, 'Vinod', { roster: ['p_vinod_m'], preferred: new Set(['p_vinod_a']) }).id, 'p_vinod_m', 'the team beats the preferred list');
});

test('every name is written like "Vivekvardhan Reddy Mereddy"', () => {
  assert.equal(displayName('VIVEKVARDHAN reddy   MEREDDY'), 'Vivekvardhan Reddy Mereddy');
  assert.equal(displayName('  dinkar bhardwaj '), 'Dinkar Bhardwaj');
  assert.equal(displayName('Satish K'), 'Satish K', 'initials stay');
  assert.equal(displayName('KP Krishna'), 'KP Krishna');
  assert.equal(displayName('vijay v'), 'Vijay V');
  assert.equal(displayName("mary-anne o'neil"), "Mary-Anne O'Neil");
  assert.equal(displayName(null), '');
  assert.equal(nameKey(displayName('DINKAR  bhardwaj')), nameKey('Dinkar Bhardwaj'), 'the same person either way');
});

test('typing part of a name finds players, most experienced first', () => {
  const list = [{ id: 'a', name: 'Vivekvardhan Reddy Mereddy', played: 20 }, { id: 'b', name: 'Vivek Tiku', played: 35 }, { id: 'c', name: 'Dinkar Bhardwaj', played: 5 }, { id: 'd', name: 'Reddy Vivek', played: 1 }];
  assert.deepEqual(matchPlayers(list, 'viv').map(p => p.id), ['b', 'a', 'd']);
  assert.deepEqual(matchPlayers(list, 'viv red').map(p => p.id), ['a', 'd']);
  assert.deepEqual(matchPlayers(list, 'VIVEKVARDHAN').map(p => p.id), ['a']);
  assert.deepEqual(matchPlayers(list, 'v'), [], 'one letter is too little to search');
  assert.deepEqual(matchPlayers(list, ''), []);
  assert.deepEqual(matchPlayers(list, 'zzz'), []);
  assert.equal(matchPlayers(list, 'vi', 2).length, 2);
  assert.deepEqual(matchPlayers(undefined, 'viv'), []);
});
