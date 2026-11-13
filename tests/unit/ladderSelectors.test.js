import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standings, challengeOption, ladderSummary, nextStep, pointsBreakdown, exportCsv, toCsv, playerStatus, resultHighlights } from '../../src/features/ladder/selectors.js';
import { seedDemoLadder, DEMO_ROSTER } from '../../scripts/ladder-dev-fixtures.mjs';
import { T0, HOUR, DAY, admin, act, season, lastChallenge, ladder, play } from './ladderHarness.js';

test('standings rows carry position, points, UTR, status and recent results', () => {
  let state = play(ladder(), 5, 3);
  state = act(state, admin, { action: 'grant', type: 'exemption', playerId: 'p1', until: T0 + 5 * DAY, reason: 'away' });
  state = act(state, admin, { action: 'adjust', playerId: 'p8', eligible: false, reason: 'injured' });
  const rows = standings(season(state), T0 + DAY);
  assert.deepEqual(rows.map(r => r.id), ['p1', 'p2', 'p5', 'p4', 'p3', 'p6', 'p7', 'p8']);
  assert.deepEqual(rows.map(r => r.status.label), ['Exempt', 'Active', 'Active', 'Active', 'Active', 'Active', 'Active', 'Not eligible']);
  assert.deepEqual([rows[2].recent, rows[4].recent, rows[2].points, rows[2].utr], [['W'], ['L'], 5, 6.75]);
  assert.equal(playerStatus({ eligible: true, streak: 2 }, season(state).rules.values, T0).label, '2-win streak');
  assert.equal(playerStatus({ eligible: true, joinedAt: T0 }, season(state).rules.values, T0 + 14 * DAY).label, 'Inactive');
});
test('challenge buttons follow the same season rules the server enforces', () => {
  let state = ladder();
  assert.equal(challengeOption(season(state), 'p8', 'p5', T0).ok, true);
  assert.equal(challengeOption(season(state), 'p8', 'p4', T0).ok, false);
  assert.equal(challengeOption(season(state), 'p2', 'p5', T0).ok, true);
  state = act(state, 5, { action: 'challenge', opponentId: 'p3' });
  assert.deepEqual(challengeOption(season(state), 'p6', 'p3', T0), { ok: false, why: 'Busy' });
  assert.equal(challengeOption(season(state), 'p5', 'p4', T0).ok, false);
  const played = play(ladder(), 5, 4);
  assert.deepEqual(challengeOption(season(played), 'p4', 'p5', T0 + DAY), { ok: false, why: 'Rematch cooldown' });
  const custom = ladder({ rules: { challenge: { maxUp: 6 } } });
  assert.equal(challengeOption(season(custom), 'p8', 'p2', T0).ok, true);
});
test('Player Home summary: rank, points, UTR, pending challenges and the next deadline', () => {
  let state = play(ladder(), 5, 3);
  assert.deepEqual(ladderSummary(season(state), 'p5'), { rank: 3, points: 5, utr: 6.75, players: 8, pending: 0, nextDeadline: null });
  state = act(state, 6, { action: 'challenge', opponentId: 'p5' }, T0 + DAY);
  const [id, c] = lastChallenge(state);
  assert.deepEqual([ladderSummary(season(state), 'p5').pending, ladderSummary(season(state), 'p5').nextDeadline], [1, c.respondBy]);
  assert.equal(nextStep(c, 'p5'), 'respond'); assert.equal(nextStep(c, 'p6'), 'waiting'); assert.equal(nextStep(c, 'p1'), null);
  state = act(state, 5, { action: 'respond', challengeId: id, accept: true }, T0 + DAY);
  assert.equal(ladderSummary(season(state), 'p5').nextDeadline, season(state).challenges[id].deadline);
  assert.equal(nextStep(season(state).challenges[id], 'p6'), 'report');
  assert.equal(ladderSummary(season(state), 'nobody'), null);
  assert.equal(ladderSummary(null, 'p5'), null);
});
test('points breakdown adds up to the player’s total', () => {
  let state = play(ladder(), 5, 3);
  state = act(state, admin, { action: 'adjust', playerId: 'p5', pointsDelta: -1, reason: 'late fee' }, T0 + DAY);
  const breakdown = pointsBreakdown(season(state), 'p5');
  assert.equal(breakdown.total, season(state).players.p5.points);
  assert.deepEqual(breakdown.totals.map(t => [t.label, t.amount]).sort(), [['Organizer adjustment', -1], ['Successful challenge', 1], ['Upset bonus', 1], ['Win', 3]]);
});
test('CSV exports: standings, players, matches and points, safely quoted, with no private data', () => {
  let state = play(ladder({ count: 4 }), 4, 2);
  state = act(state, 3, { action: 'request', type: 'exemption', category: 'injury', until: T0 + 9 * DAY, reason: 'Private medical reason' });
  const s = season(state);
  assert.equal(exportCsv('standings', s, T0 + HOUR).split('\r\n')[0], 'Position,Player,Points,UTR,Wins,Losses,Streak,Status,Verified');
  assert.equal(exportCsv('standings', s, T0 + HOUR).split('\r\n')[2], '2,Player 4,5,7,1,0,1,Active,yes');
  assert.match(exportCsv('players', s), /p4,Player 4,2,7,yes,2026-11-09T18:00:00.000Z,2026-11-09T19:00:00.000Z,/);
  assert.match(exportCsv('matches', s), /,Player 4,Player 2,completed,.*,Player 4,6-4 6-3,played,.*,no,yes,1\r\n/);
  assert.equal(exportCsv('points', s).trim().split('\r\n').length, 5);
  for (const kind of ['standings', 'players', 'matches', 'points']) { const csv = exportCsv(kind, s); assert.ok(!csv.includes('Private medical')); assert.ok(!/\bu[1-4]\b/.test(csv), 'no account ids'); }
  assert.equal(toCsv(['a'], [['x,y'], ['say "hi"'], ['=SUM(A1)'], [null]]), 'a\r\n"x,y"\r\n"say ""hi"""\r\n"\'=SUM(A1)"\r\n\r\n');
  // The audit log export is built from the admin-only log: organizer reasons yes, players' private reasons never.
  const audit = exportCsv('audit', s, T0, state.audit).trim().split('\r\n');
  assert.equal(audit[0], 'Time (UTC),Action,By,Player,Reason,Position changes,Target');
  assert.equal(audit.length, Object.keys(state.audit).length + 1);
  assert.ok(audit.some(line => /,confirm,player,Player 2,,Player 4 4>2; Player 2 2>4,/.test(line)));
  assert.ok(audit.some(line => line.includes(',enroll,organizer,,test roster,')));
  assert.ok(!audit.join().includes('Private medical'));
  assert.throws(() => exportCsv('secrets', s));
});
test('the development seed builds a valid season through the engine and never replaces an existing one', () => {
  const state = seedDemoLadder({}, T0), s = state.public.demo;
  assert.equal(Object.keys(s.players).length, Object.keys(DEMO_ROSTER).length);
  assert.deepEqual(Object.values(s.players).map(p => p.rank).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.equal(state.index.seasons.demo.status, 'active');
  assert.throws(() => seedDemoLadder(state, T0), /never replaces/);
});
test('real-roster setup: every player in the Ladder 2026 file once, seeded by UTR, created as a draft without touching other seasons', async () => {
  const { ladderRoster } = await import('../../functions/lib/ladder.js'), { planSeason } = await import('../../scripts/ladder-setup.mjs');
  const roster = ladderRoster('Stage|Group|Round|Home|Away|Winner|WinType|Date|Sets|Status\nRound Robin|A|W1|Ann Lee [4.5000]|Bo Diaz [5.25]|Bo Diaz [5.25]|Score|2026-10-01 01:00|1-6, 2-6|Locked\nRound Robin|A|W2|Bo  Diaz [5.25]|Cy Roe|Cy Roe|Score|2026-10-02 01:00|1-6, 2-6|Locked');
  assert.deepEqual(roster, [{ name: 'Ann Lee', key: 'ann lee', rating: 4.5 }, { name: 'Bo Diaz', key: 'bo diaz', rating: 5.25 }, { name: 'Cy Roe', key: 'cy roe', rating: null }]);
  const existing = ladder({ count: 2 });
  const state = planSeason([{ playerId: 'p_ann_lee', name: 'Ann Lee', utr: 4.1 }, { playerId: 'p_bo_diaz', name: 'Bo Diaz', utr: 5.6 }], { seasonId: 'ladder-2026', title: 'Singles Ladder 2026', now: T0, existing });
  assert.deepEqual(Object.values(state.public['ladder-2026'].players).map(p => [p.name, p.rank, p.points]), [['Ann Lee', 2, 0], ['Bo Diaz', 1, 0]]);
  assert.equal(state.index.seasons['ladder-2026'].status, 'draft');
  assert.deepEqual(state.public.s1, JSON.parse(JSON.stringify(existing.public.s1)));
  assert.equal(state.index.current, 's1');
  assert.throws(() => planSeason([], { seasonId: 's1', title: 'Again', now: T0, existing }), /already in use/);
});
test('roster names are matched like the PPRC migration: settled spellings, exact names, unique name parts, never a guess', async () => {
  const { matchRoster } = await import('../../scripts/ladder-setup.mjs'), { nameKey } = await import('../../functions/lib/pprc.js');
  const players = { p_dinesh_reddy_timmareddy: { name: 'Dinesh Reddy Timmareddy', seed: { singles: 5.46 } }, p_joel_kodoru: { name: 'Joel Kodoru', seed: { singles: 4.4 } }, p_raj_chava: { name: 'Raj Chava' },
    p_krishna_vennapusa: { name: 'Krishna Vennapusa' }, p_krishna_pamarthi: { name: 'Krishna Pamarthi' }, p_old: { name: 'Old Name', mergedInto: 'p_raj_chava' } };
  const index = Object.fromEntries(Object.entries(players).map(([id, p]) => [nameKey(p.name), id]));
  const roster = ['Dinesh Timmareddy', 'Joel Kodooru', 'Raj Chava', 'Krishna', 'Old Name', 'Nobody Here'].map(name => ({ name, key: nameKey(name), rating: 4 }));
  const { resolved, missing } = matchRoster(roster, { index, players, decisions: { 'Joel Kodooru': 'Joel Kodoru', 'Team A1::Krishna': 'Krishna Pamarthi' } });
  assert.deepEqual(resolved.map(r => [r.from, r.playerId, r.how, r.utr, r.flagged]), [['Dinesh Timmareddy', 'p_dinesh_reddy_timmareddy', 'tokens', 5.46, false], ['Joel Kodooru', 'p_joel_kodoru', 'name decision', 4.4, false], ['Raj Chava', 'p_raj_chava', 'exact', 4, true]]);
  assert.deepEqual(missing, [{ name: 'Krishna', candidates: ['Krishna Vennapusa', 'Krishna Pamarthi'] }, { name: 'Old Name', candidates: [] }, { name: 'Nobody Here', candidates: [] }]);
});


test('demo history stays on time and keeps its sample ranks on every weekday', () => {
  for (let day = 0; day < 7; day++) for (const hour of [4, 18]) {
    const now = Date.UTC(2026, 10, 9 + day, hour, 30);
    const state = seedDemoLadder({}, now), s = state.public.demo;
    assert.equal(s.players.ladder_demo_3.rank, 2, new Date(now).toISOString());
    assert.equal(s.players.ladder_demo_5.rank, 5);
    assert.ok(Object.values(s.challenges).filter(c => c.status === 'completed').every(c => !c.outcome.late));
  }
});


test('every blocked opponent has an explanation while allowed challenges stay actionable', () => {
  let state = ladder();
  assert.deepEqual(challengeOption(season(state), 'p8', 'p4', T0), { ok: false, why: 'Outside your range' });
  state = act(state, admin, { action: 'adjust', playerId: 'p5', eligible: false, reason: 'injury recovery' });
  assert.deepEqual(challengeOption(season(state), 'p8', 'p5', T0), { ok: false, why: 'Not eligible' });
  state = act(state, admin, { action: 'grant', type: 'exemption', playerId: 'p6', until: T0 + DAY, reason: 'away for work' });
  assert.deepEqual(challengeOption(season(state), 'p8', 'p6', T0), { ok: false, why: 'Approved exemption' });
  assert.deepEqual(challengeOption(season(state), 'p8', 'p7', T0), { ok: true });
  state = act(state, 8, { action: 'challenge', opponentId: 'p7' });
  assert.deepEqual(challengeOption(season(state), 'p8', 'p6', T0 + 2 * DAY), { ok: false, why: 'Your active limit' });
});


test('table highlights use the confirmed match’s own ranks and points', () => {
  let state = play(ladder(), 5, 3);
  const match = { ...lastChallenge(state)[1], id: lastChallenge(state)[0] };
  assert.deepEqual(resultHighlights(match), {
    p5: { role: 'winner', from: 5, to: 3, change: 2, points: 5 },
    p3: { role: 'loser', from: 3, to: 5, change: -2, points: 1 }
  });
  state = act(state, admin, { action: 'adjust', playerId: 'p5', rank: 1, reason: 'organizer correction' });
  assert.equal(resultHighlights(match).p5.to, 3, 'the match record is not rewritten by a later position change');
  assert.deepEqual(resultHighlights({ ...match, status: 'voided' }), {});
  assert.deepEqual(resultHighlights({ status: 'pending' }), {});
});
test('a win without position changes never gets a ladder or snake delta', () => {
  const state = play(ladder({ rules: { swap: { enabled: false }, extension: { allowSwap: false } } }), 5, 3);
  const highlights = resultHighlights(lastChallenge(state)[1]);
  assert.equal(highlights.p5.role, 'winner');
  assert.equal(highlights.p3.role, 'loser');
  assert.equal(highlights.p5.change, 0);
  assert.equal(highlights.p3.change, 0);
});
