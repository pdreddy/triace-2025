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
const match = (id, ts, courts, extra = {}) => ({ id, club: 'koc', season: 's3', ts, courts, ...extra });
const seeds = { a: { singles: 6, doubles: 6 }, b: { singles: 6, doubles: 6 }, c: { singles: 5, doubles: 5 }, d: { singles: 5, doubles: 5 }, e: { singles: 6, doubles: 6 } };

test('equal players: the winner gains exactly what the loser loses; a bigger margin moves more', () => {
  const close = computePprc({ players: seeds, matches: [match('m1', 1, [court(['a'], ['b'], 'home', 8, 7)])] }).ratings;
  assert.ok(close.a.singles > 6 && close.b.singles < 6);
  assert.equal(Number((close.a.singles + close.b.singles).toFixed(2)), 12);
  const blowout = computePprc({ players: seeds, matches: [match('m1', 1, [court(['a'], ['b'], 'home', 8, 0)])] }).ratings;
  assert.ok(blowout.a.singles - 6 > close.a.singles - 6);
});

test('a win never lowers a rating and a loss never raises it, even against much weaker players', () => {
  const players = { top: { singles: 12 }, low: { singles: 3 } };
  const win = computePprc({ players, matches: [match('m', 1, [court(['top'], ['low'], 'home', 8, 7)])] }).ratings;
  assert.ok(win.top.singles >= 12 && win.low.singles <= 3);
  const upset = computePprc({ players, matches: [match('m', 1, [court(['low'], ['top'], 'home', 8, 7)])] }).ratings;
  assert.ok(upset.low.singles > 3 && upset.top.singles < 12);
});

test('upsets move ratings more than expected results', () => {
  const expected = computePprc({ players: seeds, matches: [match('m', 1, [court(['a'], ['c'], 'home', 8, 3)])] }).ratings.a.singles - 6;
  const upset = computePprc({ players: seeds, matches: [match('m', 1, [court(['c'], ['a'], 'home', 8, 3)])] }).ratings.c.singles - 5;
  assert.ok(upset > expected);
});

test('doubles use the pair average and move both partners equally, in doubles only', () => {
  const { ratings, history } = computePprc({ players: seeds, matches: [match('m', 1, [court(['a', 'c'], ['b', 'd'], 'home', 8, 4, 'doubles')])] });
  assert.equal(ratings.a.doubles - 6, ratings.c.doubles - 5);
  assert.equal(ratings.a.singles, 6, 'singles rating untouched');
  assert.equal(history.a[0].partner, 'c'); assert.deepEqual(history.a[0].opponents, ['b', 'd']);
  assert.deepEqual([ratings.a.record.doubles, ratings.b.record.doubles], [{ wins: 1, losses: 0 }, { wins: 0, losses: 1 }]);
});

test('new players move faster than established ones', () => {
  const warmup = Array.from({ length: 12 }, (_, i) => match(`v${i}`, i, [court(['a'], ['b'], i % 2 ? 'home' : 'away', 8, 4)]));
  const last = match('x', 100, [court(['a'], ['e'], 'home', 8, 3)]);
  const fresh = computePprc({ players: seeds, matches: [last] }).history.a[0];
  const seasoned = computePprc({ players: seeds, matches: [...warmup, last] }).history.a.at(-1);
  assert.ok(Math.abs(seasoned.after - seasoned.change - 6) < 0.5, 'warm-up left the rating near its seed');
  assert.ok(fresh.change > seasoned.change, `${fresh.change} should exceed ${seasoned.change}`);
});

test('order of input does not matter, history is chronological, and new matches extend the same result', () => {
  const ms = [match('m3', 30, [court(['c'], ['a'], 'home')]), match('m1', 10, [court(['a'], ['b'], 'home')]), match('m2', 20, [court(['b'], ['c'], 'away', 5, 8)])];
  const forward = computePprc({ players: seeds, matches: ms }), reversed = computePprc({ players: seeds, matches: [...ms].reverse() });
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward.history.a.map(h => h.matchId), ['m1', 'm3']);
  const extra = match('m4', 40, [court(['a'], ['b'], 'away')]);
  const all = computePprc({ players: seeds, matches: [...ms, extra] });
  assert.equal(all.history.a.at(-1).matchId, 'm4');
  assert.deepEqual(all.history.a.slice(0, 2), forward.history.a, 'earlier history is unchanged by a later match');
});

test('matches from different clubs feed the same player', () => {
  const { history, ratings } = computePprc({ players: seeds, matches: [match('k1', 1, [court(['a'], ['b'], 'home')], { club: 'koc' }), match('t1', 2, [court(['a'], ['c'], 'home')], { club: 'triace', season: 's1' })] });
  assert.deepEqual(history.a.map(h => [h.club, h.season]), [['koc', 's3'], ['triace', 's1']]);
  assert.equal(ratings.a.played.singles, 2);
});

test('bad courts are skipped and reported, not guessed', () => {
  const { skipped, ratings } = computePprc({ players: seeds, matches: [match('m', 1, [
    court(['a'], [], 'home'), court(['a'], ['zzz'], 'home'), { ...court(['a'], ['b'], 'home'), type: 'mixed' }, { ...court(['a'], ['b'], 'draw') }
  ])] });
  assert.deepEqual(skipped.map(s => s.reason), ['players', 'unknown player', 'type', 'winner']);
  assert.equal(ratings.a.played.singles, 0);
});

test('seeds fall back across disciplines, are clamped, and overall blends both', () => {
  const r = computePprc({ players: { x: { singles: 6 }, y: {}, z: { singles: 99, doubles: -4 } }, matches: [] }).ratings;
  assert.deepEqual([r.x.doubles, r.y.singles, r.z.singles, r.z.doubles], [6, PPRC_PARAMS.defaultSeed, PPRC_PARAMS.max, PPRC_PARAMS.min]);
  assert.equal(computePprc({ players: { p: { singles: 6, doubles: 4 } }, matches: [] }).ratings.p.overall, 5);
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
