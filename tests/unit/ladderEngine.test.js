import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLadder, validateScore } from '../../functions/lib/singlesLadder/engine.js';
import { DEFAULT_RULES, completeRules, validateRules } from '../../functions/lib/singlesLadder/config.js';
import { T0, HOUR, DAY, admin, run, act, season, lastChallenge, challengeIds, custom, ladder, play, ranks, points } from './ladderHarness.js';

const refuses = (fn, pattern) => assert.throws(fn, error => error.name === 'ValidationError' && pattern.test(error.message), String(pattern));
const audits = state => Object.values(state.audit);

// ---------- authorization and ownership (never configurable) ----------
test('organizer actions need the verified admin role', () => {
  const state = ladder();
  for (const payload of [{ action: 'createSeason', seasonId: 's2', name: 'Forged' }, { action: 'setStatus', status: 'frozen', reason: 'no' }, { action: 'saveRules', values: DEFAULT_RULES, baseVersion: 1, reason: 'no' },
    { action: 'enroll', playerId: 'px', name: 'X' }, { action: 'adjust', playerId: 'p1', rank: 8, reason: 'no' }, { action: 'link', uid: 'u1', playerId: 'p2' }, { action: 'seed', reason: 'no' },
    { action: 'resolve', challengeId: 'c', winnerId: 'p1', reason: 'no' }, { action: 'grant', type: 'exemption', playerId: 'p1', until: T0 + DAY, reason: 'no' }, { action: 'sweep' }])
    refuses(() => run(state, 5, payload), /Organizer access is required/);
  refuses(() => run(state, { uid: 'u5', admin: 'true' }, { action: 'seed', reason: 'forged' }), /Organizer access/);   // only a real boolean from the server counts
});
test('a player acts only as the player an organizer linked to their sign-in', () => {
  let state = ladder();
  refuses(() => run(state, { uid: 'stranger' }, { action: 'challenge', opponentId: 'p3' }), /not linked to a player/);
  // The request cannot name another player as the challenger: identity comes from the sign-in.
  state = act(state, 5, { action: 'challenge', opponentId: 'p3', challengerId: 'p4', playerId: 'p4' });
  const [id, c] = lastChallenge(state);
  assert.equal(c.challengerId, 'p5');
  refuses(() => run(state, 4, { action: 'respond', challengeId: id, accept: true }), /Only the two players/);
  refuses(() => run(state, 5, { action: 'respond', challengeId: id, accept: true }), /Only the challenged player/);
  refuses(() => run(state, 4, { action: 'withdraw', challengeId: id }), /Only the two players/);
  state = act(state, 3, { action: 'respond', challengeId: id, accept: true });
  refuses(() => run(state, 6, { action: 'submit', challengeId: id, winnerId: 'p6', score: '6-0 6-0' }), /Only the two players/);
  refuses(() => run(state, 5, { action: 'submit', challengeId: id, winnerId: 'p6', score: '6-0 6-0' }), /one of the two players/);
});
test('one sign-in per player; links are explicit and audited', () => {
  let state = ladder();
  refuses(() => run(state, admin, { action: 'link', uid: 'other', playerId: 'p1', reason: 'verified in person' }), /already linked/);
  refuses(() => run(state, admin, { action: 'link', uid: 'other', playerId: 'nobody', reason: 'verified in person' }), /Enroll the player/);
  refuses(() => run(state, admin, { action: 'unlink', uid: 'u1' }), /Give a reason/);
  state = act(state, admin, { action: 'unlink', uid: 'u1', reason: 'wrong account' });
  assert.equal(state.accounts.u1, undefined);
  refuses(() => run(state, 1, { action: 'challenge', opponentId: 'p2' }), /not linked/);
  const entry = audits(state).at(-1);
  assert.deepEqual([entry.action, entry.before.playerId, entry.after.playerId, entry.actor.role], ['unlink', 'p1', null, 'organizer']);
});

// ---------- eligibility, limits, cooldowns, streaks ----------
test('default range: three up, top three also three down, no self-challenge', () => {
  const state = ladder();
  refuses(() => run(state, 8, { action: 'challenge', opponentId: 'p4' }), /outside your challenge range/);
  refuses(() => run(state, 5, { action: 'challenge', opponentId: 'p6' }), /outside your challenge range/);   // not a top player: no downward
  refuses(() => run(state, 5, { action: 'challenge', opponentId: 'p5' }), /cannot challenge yourself/);
  assert.equal(lastChallenge(act(state, 8, { action: 'challenge', opponentId: 'p5' }))[1].status, 'pending');
  assert.equal(lastChallenge(act(state, 2, { action: 'challenge', opponentId: 'p5' }))[1].ranks.opponent, 5);
  refuses(() => run(state, 2, { action: 'challenge', opponentId: 'p6' }), /outside/);
});
test('custom range rules are enforced from the season configuration', () => {
  const state = ladder({ rules: { challenge: { maxUp: 1 }, top: { enabled: false } } });
  refuses(() => run(state, 8, { action: 'challenge', opponentId: 'p6' }), /outside/);
  refuses(() => run(state, 1, { action: 'challenge', opponentId: 'p2' }), /outside/);
  assert.equal(challengeIds(act(state, 8, { action: 'challenge', opponentId: 'p7' })).length, 1);
});
test('one active challenge per player by default; the limit is configurable', () => {
  let state = act(ladder(), 5, { action: 'challenge', opponentId: 'p3' });
  refuses(() => run(state, 5, { action: 'challenge', opponentId: 'p4' }), /already have an active challenge/);
  refuses(() => run(state, 6, { action: 'challenge', opponentId: 'p3' }), /Player 3 already has an active challenge/);
  refuses(() => run(state, 3, { action: 'challenge', opponentId: 'p2' }), /already have an active challenge/);   // being challenged counts too
  let two = act(ladder({ rules: { challenge: { activeLimit: 2 } } }), 5, { action: 'challenge', opponentId: 'p3' });
  two = act(two, 5, { action: 'challenge', opponentId: 'p4' });
  refuses(() => run(two, 5, { action: 'challenge', opponentId: 'p2' }), /already have 2 active challenges/);
  refuses(() => run(two, 3, { action: 'challenge', opponentId: 'p5' }), /Player 5 already has 2 active challenges/);
});
test('concurrent challenge requests: the transaction applies them one after another, so only one is created', () => {
  // The database transaction re-runs the second request on top of the first one's result.
  const start = ladder(), first = run(start, 5, { action: 'challenge', opponentId: 'p3' }).state;
  refuses(() => run(first, 5, { action: 'challenge', opponentId: 'p4' }), /already have an active challenge/);
  refuses(() => run(first, 6, { action: 'challenge', opponentId: 'p3' }), /already has an active challenge/);
  assert.equal(challengeIds(first).length, 1);
});
test('a retried request with the same id is applied once', () => {
  const start = ladder();
  const first = run(start, 5, { action: 'challenge', opponentId: 'p3', opId: 'op-1' });
  const again = run(first.state, 5, { action: 'challenge', opponentId: 'p3', opId: 'op-1' });
  assert.equal(again.result.duplicate, true);
  assert.deepEqual(again.state, first.state);
  let state = act(start, admin, { action: 'adjust', playerId: 'p1', pointsDelta: 5, reason: 'bonus', opId: 'op-2' });
  state = act(state, admin, { action: 'adjust', playerId: 'p1', pointsDelta: 5, reason: 'bonus', opId: 'op-2' });
  assert.equal(season(state).players.p1.points, 5);
});
test('rematch cooldown: 14 days by default, configurable, optional after unplayed challenges', () => {
  let state = play(ladder(), 5, 3);
  refuses(() => run(state, 3, { action: 'challenge', opponentId: 'p5' }, T0 + 13 * DAY), /again 14 days after/);
  assert.equal(challengeIds(act(state, 3, { action: 'challenge', opponentId: 'p5' }, T0 + 14 * DAY + HOUR)).length, 2);
  let short = play(ladder({ rules: { rematch: { days: 2 } } }), 5, 3);
  assert.equal(challengeIds(act(short, 3, { action: 'challenge', opponentId: 'p5' }, T0 + 2 * DAY + HOUR)).length, 2);
  let off = play(ladder({ rules: { rematch: { enabled: false } } }), 5, 3);
  assert.equal(challengeIds(act(off, 3, { action: 'challenge', opponentId: 'p5' }, T0 + 2 * HOUR)).length, 2);
  // After a decline: blocked by default, allowed when the rule only counts played matches.
  const declined = rules => { let s = act(ladder({ rules }), 5, { action: 'challenge', opponentId: 'p3' }); return act(s, 3, { action: 'respond', challengeId: lastChallenge(s)[0], accept: false }); };
  refuses(() => run(declined(), 5, { action: 'challenge', opponentId: 'p3' }, T0 + DAY), /again 14 days/);
  assert.equal(challengeIds(act(declined({ rematch: { afterUnplayed: false } }), 5, { action: 'challenge', opponentId: 'p3' }, T0 + DAY)).length, 2);
});
test('two consecutive wins unlock any higher position; a loss resets the streak; thresholds are configurable', () => {
  let state = play(ladder(), 8, 7);                          // p8 and p7 swap
  refuses(() => run(state, 8, { action: 'challenge', opponentId: 'p2' }, T0 + DAY), /outside/);
  state = play(state, 8, 5, { at: T0 + DAY });               // p8 now #5, streak 2
  assert.equal(season(state).players.p8.streak, 2);
  state = act(state, 8, { action: 'challenge', opponentId: 'p1' }, T0 + 2 * DAY);
  assert.equal(lastChallenge(state)[1].ranks.opponent, 1);
  state = act(state, 1, { action: 'respond', challengeId: lastChallenge(state)[0], accept: true }, T0 + 2 * DAY);
  state = act(state, 1, { action: 'submit', challengeId: lastChallenge(state)[0], winnerId: 'p1', score: '2-6 1-6' }, T0 + 2 * DAY);
  state = act(state, 8, { action: 'confirm', challengeId: lastChallenge(state)[0] }, T0 + 2 * DAY);
  assert.equal(season(state).players.p8.streak, 0);
  assert.equal(season(state).players.p1.streak, 1);
  let capped = play(ladder({ rules: { streak: { wins: 1, maxUp: 4 } } }), 8, 7);
  refuses(() => run(capped, 8, { action: 'challenge', opponentId: 'p2' }, T0 + DAY), /outside/);
  assert.equal(challengeIds(act(capped, 8, { action: 'challenge', opponentId: 'p3' }, T0 + DAY)).length, 2);
});
test('ineligible and exempt players cannot challenge or be challenged', () => {
  let state = act(ladder(), admin, { action: 'adjust', playerId: 'p3', eligible: false, reason: 'injured' });
  refuses(() => run(state, 5, { action: 'challenge', opponentId: 'p3' }), /not eligible/);
  refuses(() => run(state, 3, { action: 'challenge', opponentId: 'p2' }), /not eligible/);
  state = act(state, admin, { action: 'grant', type: 'exemption', playerId: 'p4', until: T0 + 5 * DAY, reason: 'travel' });
  refuses(() => run(state, 5, { action: 'challenge', opponentId: 'p4' }), /approved exemption/);
  refuses(() => run(state, 4, { action: 'challenge', opponentId: 'p2' }), /approved exemption/);
  assert.equal(challengeIds(act(state, 5, { action: 'challenge', opponentId: 'p4' }, T0 + 6 * DAY)).length, 1);
  const open = act(ladder({ rules: { challenge: { blockExempt: false } } }), admin, { action: 'grant', type: 'exemption', playerId: 'p4', until: T0 + 5 * DAY, reason: 'travel' });
  assert.equal(challengeIds(act(open, 5, { action: 'challenge', opponentId: 'p4' })).length, 1);
});

// ---------- responding ----------
test('response window: 48 hours by default; unanswered challenges lapse without penalty', () => {
  let state = act(ladder(), 5, { action: 'challenge', opponentId: 'p3' });
  const [id, c] = lastChallenge(state);
  assert.equal(c.respondBy, T0 + 48 * HOUR);
  assert.equal(act(state, 3, { action: 'respond', challengeId: id, accept: true }, T0 + 48 * HOUR).public.s1.challenges[id].status, 'accepted');   // the boundary is inclusive
  refuses(() => run(state, 3, { action: 'respond', challengeId: id, accept: true }, T0 + 48 * HOUR + 1), /time to answer this challenge has passed/);
  state = act(state, { uid: 'system', system: true }, { action: 'sweep' }, T0 + 49 * HOUR);
  assert.equal(season(state).challenges[id].status, 'expired');
  assert.deepEqual(points(state), points(ladder()));
  assert.equal(audits(state).at(-1).action, 'system.unanswered');
  assert.equal(audits(state).at(-1).actor.role, 'system');
});
test('unanswered challenges can count as a decline or a walkover when configured', () => {
  const unanswered = rules => { let s = act(ladder({ rules }), 5, { action: 'challenge', opponentId: 'p3' }); return act(s, admin, { action: 'sweep' }, T0 + 73 * HOUR); };
  let state = unanswered({ response: { onExpire: 'decline', hours: 72 } });
  let c = lastChallenge(state)[1];
  assert.deepEqual([c.status, c.validDecline, c.unanswered], ['declined', true, true]);
  state = unanswered({ response: { onExpire: 'walkover', hours: 72 } });
  c = lastChallenge(state)[1];
  assert.deepEqual([c.status, c.result.kind, c.result.winnerId], ['completed', 'walkover', 'p5']);
  assert.equal(season(state).players.p5.points, 3);
  assert.equal(season(state).players.p3.points, 0);
  assert.deepEqual([season(state).players.p5.rank, season(state).players.p3.rank], [3, 5]);
});
test('the challenger can withdraw before an answer', () => {
  let state = act(ladder(), 5, { action: 'challenge', opponentId: 'p3' });
  const [id] = lastChallenge(state);
  state = act(state, 5, { action: 'withdraw', challengeId: id });
  assert.equal(season(state).challenges[id].status, 'withdrawn');
  assert.equal(challengeIds(act(state, 5, { action: 'challenge', opponentId: 'p4' })).length, 2);
});

// ---------- scores, points, positions ----------
test('score validation', () => {
  validateScore('6-4 6-3', true); validateScore('6-4, 3-6, 10-8', true); validateScore('4-6 7-6 11-13', false); validateScore('7-5 6-7 10-0', true);
  // At one set all the default is a 10-point match tiebreak; a full third set only when the season says so.
  assert.throws(() => validateScore('4-6 7-6 5-7', false), /10-point match tiebreak/);
  validateScore('4-6 7-6 5-7', false, 'fullSet'); validateScore('4-6 7-6 5-7', false, 'either'); validateScore('4-6 7-6 8-10', false, 'either');
  assert.throws(() => validateScore('4-6 7-6 8-10', false, 'fullSet'), /full third set/);
  for (const bad of ['6-4 4-6 10-9', '6-4 4-6 12-11', '8-6 6-4', '6-6 6-4']) assert.throws(() => validateScore(bad, true), { name: 'ValidationError' });
  for (const [score, challengerWon] of [['6-4', true], ['6-5 6-3', true], ['6-4 6-3 6-2', true], ['6-4 6-3', false], ['abc', true], [null, true]]) assert.throws(() => validateScore(score, challengerWon), { name: 'ValidationError' });
});
test('an on-time challenger win: 3 + challenge bonus + upset bonus, and the players swap', () => {
  const state = play(ladder(), 5, 3);
  const [id, c] = lastChallenge(state);
  assert.deepEqual([points(state).p5, points(state).p3], [5, 1]);                // gap of 2 positions: upset
  assert.deepEqual([ranks(state).p5, ranks(state).p3, ranks(state).p4], [3, 5, 4]);
  assert.deepEqual(c.outcome.bonuses, ['challengeBonus', 'upsetBonus']);
  assert.deepEqual([c.outcome.late, c.outcome.moved, c.status], [false, true, 'completed']);
  const ledger = Object.values(season(state).points).filter(e => e.challengeId === id).map(e => [e.playerId, e.type, e.amount, e.rulesVersion]);
  assert.deepEqual(ledger, [['p5', 'win', 3, 1], ['p3', 'loss', 1, 1], ['p5', 'challengeBonus', 1, 1], ['p5', 'upsetBonus', 1, 1]]);
  const audit = audits(state).at(-1);
  assert.deepEqual(audit.rankChanges, [{ playerId: 'p5', from: 5, to: 3 }, { playerId: 'p3', from: 3, to: 5 }]);
});
test('a one-position win earns no upset bonus; a successful defense earns the defense bonus and no move', () => {
  let state = play(ladder(), 5, 4);
  assert.deepEqual([points(state).p5, points(state).p4], [4, 1]);
  state = play(ladder(), 5, 3, { winner: 3 });
  assert.deepEqual([points(state).p3, points(state).p5], [4, 1]);
  assert.deepEqual(ranks(state), ranks(ladder()));
  assert.deepEqual(lastChallenge(state)[1].outcome.bonuses, ['defenseBonus']);
});
test('downward challenges: a top player winning keeps position; the lower player winning moves only when configured', () => {
  let state = play(ladder(), 2, 5);
  assert.deepEqual([points(state).p2, ranks(state).p2, ranks(state).p5], [4, 2, 5]);
  state = play(ladder(), 2, 5, { winner: 5 });
  assert.deepEqual([points(state).p5, ranks(state).p5], [5, 5]);                 // defense + upset, no move by default
  state = play(ladder({ rules: { swap: { lowerDefenderWin: 'move' } } }), 2, 5, { winner: 5 });
  assert.deepEqual([ranks(state).p5, ranks(state).p2], [2, 5]);
});
test('custom points, upset range and position mode', () => {
  const state = play(ladder({ rules: { points: { win: 10, loss: 2, challengeBonus: 0, upsetBonus: 4, upsetMinGap: 1, upsetMaxGap: 1 }, swap: { mode: 'takePlace' } } }), 6, 5);
  assert.deepEqual([points(state).p6, points(state).p5], [14, 2]);
  const moved = play(ladder({ rules: { swap: { mode: 'takePlace' } } }), 6, 3);
  assert.deepEqual([ranks(moved).p6, ranks(moved).p3, ranks(moved).p4, ranks(moved).p5], [3, 4, 5, 6]);
  const none = play(ladder({ rules: { swap: { enabled: false }, extension: { allowSwap: false } } }), 6, 3);
  assert.deepEqual(ranks(none), ranks(ladder()));
});
test('late results earn normal points only and never change positions (default); configurable', () => {
  const start = ladder(); let state = act(start, 5, { action: 'challenge', opponentId: 'p3' });
  const [id] = lastChallenge(state);
  state = act(state, 3, { action: 'respond', challengeId: id, accept: true });
  const due = season(state).challenges[id].deadline;
  assert.equal(new Date(due).toISOString(), '2026-11-16T05:59:59.999Z');         // Sunday 23:59:59.999 in Chicago
  const finish = (s, at) => act(act(s, 5, { action: 'submit', challengeId: id, winnerId: 'p5', score: '6-4 6-3' }, at), 3, { action: 'confirm', challengeId: id }, at + DAY);
  const onTime = finish(state, due);                                             // the last millisecond is on time, even if confirmed later
  assert.deepEqual([points(onTime).p5, ranks(onTime).p5, onTime.public.s1.challenges[id].outcome.late], [5, 3, false]);
  const late = finish(state, due + 1);
  assert.deepEqual([points(late).p5, points(late).p3, ranks(late).p5, late.public.s1.challenges[id].outcome.late], [3, 1, 5, true]);
  assert.equal(late.public.s1.challenges[id].outcome.bonuses, undefined ?? late.public.s1.challenges[id].outcome.bonuses);
  assert.deepEqual(late.public.s1.challenges[id].outcome.bonuses, []);
  let lenient = act(ladder({ rules: { late: { allowBonuses: true, allowSwap: true } } }), 5, { action: 'challenge', opponentId: 'p3' });
  const lid = lastChallenge(lenient)[0];
  lenient = act(lenient, 3, { action: 'respond', challengeId: lid, accept: true });
  lenient = act(act(lenient, 5, { action: 'submit', challengeId: lid, winnerId: 'p5', score: '6-4 6-3' }, due + DAY), 3, { action: 'confirm', challengeId: lid }, due + DAY);
  assert.deepEqual([points(lenient).p5, ranks(lenient).p5], [5, 3]);
});
test('an approved extension permits a late swap; after the extension the result is late again', () => {
  const setup = rules => {
    let s = act(ladder({ rules }), 5, { action: 'challenge', opponentId: 'p3' }); const id = lastChallenge(s)[0];
    s = act(s, 3, { action: 'respond', challengeId: id, accept: true });
    const due = season(s).challenges[id].deadline;
    s = act(s, 5, { action: 'request', type: 'extension', category: 'weather', challengeId: id, until: due + 3 * DAY, reason: 'Rain all week' });
    return { s, id, due };
  };
  let { s, id, due } = setup();
  refuses(() => run(s, 3, { action: 'request', type: 'extension', category: 'weather', challengeId: id, until: due + 2 * DAY, reason: 'me too' }), /already waiting/);
  refuses(() => run(s, 5, { action: 'decideRequest', playerId: 'p5', requestId: Object.keys(s.private.s1.requests.p5)[0], approve: true, reason: 'organizer decision' }), /Organizer access/);
  const requestId = Object.keys(s.private.s1.requests.p5)[0];
  assert.equal(s.private.s1.requests.p5[requestId].reason, 'Rain all week');
  assert.equal(JSON.stringify(s.public).includes('Rain all week'), false);        // the reason stays out of public data
  refuses(() => run(s, admin, { action: 'decideRequest', playerId: 'p5', requestId, approve: true, until: due + 15 * DAY, reason: 'organizer decision' }), /within 14 days/);
  const approved = act(s, admin, { action: 'decideRequest', playerId: 'p5', requestId, approve: true, reason: 'organizer decision' });
  assert.equal(season(approved).challenges[id].extensionUntil, due + 3 * DAY);
  const finish = (state, at) => act(act(state, 5, { action: 'submit', challengeId: id, winnerId: 'p5', score: '6-4 6-3' }, at), 3, { action: 'confirm', challengeId: id }, at);
  const inside = finish(approved, due + 2 * DAY);
  assert.deepEqual([points(inside).p5, ranks(inside).p5, inside.public.s1.challenges[id].outcome.extended, inside.public.s1.challenges[id].outcome.late], [5, 3, true, false]);
  const after = finish(approved, due + 3 * DAY + 1);
  assert.deepEqual([points(after).p5, ranks(after).p5], [3, 5]);
  const denied = finish(act(s, admin, { action: 'decideRequest', playerId: 'p5', requestId, approve: false, reason: 'courts were open' }), due + 2 * DAY);
  assert.deepEqual([points(denied).p5, ranks(denied).p5], [3, 5]);
  // Configured so an extension keeps the points bonuses but not the position change.
  ({ s, id, due } = setup({ extension: { allowSwap: false } }));
  const noSwap = finish(act(s, admin, { action: 'decideRequest', playerId: 'p5', requestId: Object.keys(s.private.s1.requests.p5)[0], approve: true, reason: 'organizer decision' }), due + 2 * DAY);
  assert.deepEqual([points(noSwap).p5, ranks(noSwap).p5], [5, 5]);
  refuses(() => run(act(ladder({ rules: { extension: { enabled: false, allowSwap: true } } }), 5, { action: 'challenge', opponentId: 'p3' }), 5, { action: 'request', type: 'extension', category: 'weather', challengeId: 'x', until: due, reason: 'please' }), /not found/);
});
test('duplicate score submissions and confirmations never award points twice', () => {
  let state = act(ladder(), 5, { action: 'challenge', opponentId: 'p3' }); const id = lastChallenge(state)[0];
  refuses(() => run(state, 5, { action: 'submit', challengeId: id, winnerId: 'p5', score: '6-4 6-3' }), /Only an accepted match/);
  state = act(state, 3, { action: 'respond', challengeId: id, accept: true });
  refuses(() => run(state, 3, { action: 'respond', challengeId: id, accept: false }), /already been answered/);
  state = act(state, 5, { action: 'submit', challengeId: id, winnerId: 'p5', score: '6-4 6-3' });
  refuses(() => run(state, 3, { action: 'submit', challengeId: id, winnerId: 'p3', score: '4-6 3-6' }), /already been reported/);
  refuses(() => run(state, 5, { action: 'confirm', challengeId: id }), /other player must confirm/);
  state = act(state, 3, { action: 'confirm', challengeId: id });
  refuses(() => run(state, 3, { action: 'confirm', challengeId: id }), /already been confirmed/);
  refuses(() => run(state, 3, { action: 'dispute', challengeId: id }), /already been confirmed/);
  assert.deepEqual([points(state).p5, points(state).p3, season(state).players.p5.wins], [5, 1, 1]);
  assert.equal(Object.values(season(state).points).length, 4);
});
test('disputes freeze the result until an organizer decides; the decision is final and audited', () => {
  let state = act(ladder(), 5, { action: 'challenge', opponentId: 'p3' }); const id = lastChallenge(state)[0];
  state = act(state, 3, { action: 'respond', challengeId: id, accept: true });
  state = act(state, 5, { action: 'submit', challengeId: id, winnerId: 'p5', score: '6-4 6-3' });
  state = act(state, 3, { action: 'dispute', challengeId: id });
  assert.deepEqual(points(state), points(ladder()));
  refuses(() => run(state, 5, { action: 'confirm', challengeId: id }), /no reported result/);
  refuses(() => run(state, admin, { action: 'resolve', challengeId: id, winnerId: 'p3' }), /Give a reason/);
  refuses(() => run(state, admin, { action: 'resolve', challengeId: id, winnerId: 'p3', reason: 'checked with both' }), /winner must match the score/);
  state = act(state, admin, { action: 'resolve', challengeId: id, winnerId: 'p3', score: '4-6 6-3 8-10', reason: 'checked with both players' });
  const c = season(state).challenges[id];
  assert.deepEqual([c.status, c.result.winnerId, c.result.score, points(state).p3, points(state).p5], ['completed', 'p3', '4-6 6-3 8-10', 4, 1]);
  assert.deepEqual([audits(state).at(-1).action, audits(state).at(-1).reason, audits(state).at(-1).before.status], ['resolve', 'checked with both players', 'disputed']);
});

// ---------- declines ----------
test('first decline is free, the next deducts 2 points, two declines raise a 3-position drop for review', () => {
  const decline = (state, challenger, at) => { state = act(state, challenger, { action: 'challenge', opponentId: 'p3' }, at); return act(state, 3, { action: 'respond', challengeId: lastChallenge(state)[0], accept: false }, at); };
  let state = decline(ladder(), 5, T0);
  assert.equal(points(state).p3, 0);
  assert.equal(Object.keys(season(state).penalties).length, 0);
  state = decline(state, 6, T0 + DAY);
  assert.equal(points(state).p3, -2);
  const [penaltyId, penalty] = Object.entries(season(state).penalties)[0];
  assert.deepEqual([penalty.type, penalty.status, penalty.positions, penalty.rulesVersion, penalty.policy.dropThreshold], ['decline', 'pending', 3, 1, 2]);
  assert.equal(ranks(state).p3, 3);                                              // nothing moves until an organizer decides
  refuses(() => run(state, 3, { action: 'decidePenalty', penaltyId, apply: false, reason: 'no' }), /Organizer access/);
  const applied = act(state, admin, { action: 'decidePenalty', penaltyId, apply: true, reason: 'two declines in a week' }, T0 + 2 * DAY);
  assert.deepEqual([ranks(applied).p3, ranks(applied).p4, ranks(applied).p5, ranks(applied).p6], [6, 3, 4, 5]);
  assert.deepEqual(audits(applied).at(-1).rankChanges.map(c => c.playerId), ['p4', 'p5', 'p6', 'p3']);
  const waived = act(state, admin, { action: 'decidePenalty', penaltyId, apply: false, reason: 'was ill' });
  assert.deepEqual(ranks(waived), ranks(ladder()));
  refuses(() => run(applied, admin, { action: 'decidePenalty', penaltyId, apply: true, reason: 'again' }), /already been decided/);
  // After the drop the count starts again (default): the next decline is free once more.
  const next = decline(applied, 7, T0 + 20 * DAY);
  assert.equal(points(next).p3, -2);
});
test('decline penalties follow the configuration: automatic drop, allowance, rolling window, switched off, downward', () => {
  const decline = (state, challenger, at, target = 3) => { state = act(state, challenger, { action: 'challenge', opponentId: `p${target}` }, at); return act(state, target, { action: 'respond', challengeId: lastChallenge(state)[0], accept: false }, at); };
  let auto = decline(decline(ladder({ rules: { decline: { review: 'auto', dropPositions: 2, penaltyPoints: 5 } } }), 5, T0), 6, T0 + DAY);
  assert.deepEqual([points(auto).p3, ranks(auto).p3, Object.values(season(auto).penalties)[0].status, Object.values(season(auto).penalties)[0].decidedBy], [-5, 5, 'applied', 'system']);
  const off = decline(decline(ladder({ rules: { decline: { enabled: false } } }), 5, T0), 6, T0 + DAY);
  assert.deepEqual([points(off).p3, Object.keys(season(off).penalties).length], [0, 0]);
  let rolling = decline(ladder({ rules: { decline: { counting: 'rolling', rollingDays: 7 }, rematch: { enabled: false } } }), 5, T0);
  rolling = decline(rolling, 6, T0 + 8 * DAY);                                    // the first decline has aged out
  assert.equal(points(rolling).p3, 0);
  const downward = decline(decline(ladder({ rules: { decline: { countDownward: false } } }), 1, T0, 4), 2, T0 + DAY, 4);
  assert.deepEqual([points(downward).p4, lastChallenge(downward)[1].validDecline], [0, false]);
});

// ---------- inactivity, exemptions, no-shows ----------
test('14 days inactive raises a 3-position drop for review; activity and exemptions stop it', () => {
  const sweep = (state, at) => act(state, { uid: 'system', system: true }, { action: 'sweep' }, at);
  let state = play(ladder(), 5, 3);                                              // p5 and p3 played on day 0
  state = act(state, admin, { action: 'grant', type: 'exemption', playerId: 'p1', until: T0 + 20 * DAY, reason: 'travelling' });
  assert.equal(Object.keys(season(sweep(state, T0 + 14 * DAY - 1)).penalties).length, 0);
  state = sweep(state, T0 + 14 * DAY);
  const flagged = Object.values(season(state).penalties);
  assert.deepEqual(flagged.map(p => p.playerId).sort(), ['p2', 'p4', 'p6', 'p7', 'p8']);                // not p1 (exempt), p3 or p5 (played)
  assert.ok(flagged.every(p => p.type === 'inactivity' && p.status === 'pending' && p.policy.days === 14 && p.rulesVersion === 1));
  assert.equal(Object.keys(season(sweep(state, T0 + 14 * DAY + HOUR / 2)).penalties).length, 5);                    // not raised twice
  const [penaltyId] = Object.entries(season(state).penalties).find(([, p]) => p.playerId === 'p2');
  state = act(state, admin, { action: 'decidePenalty', penaltyId, apply: true, reason: 'no reply to three challenges' }, T0 + 15 * DAY);
  assert.equal(ranks(state).p2, 5);
  assert.equal(season(state).penalties[penaltyId].policy.dropPositions, 3);
  // The exemption ended on day 20: the clock for p1 starts there.
  assert.ok(!Object.values(season(sweep(state, T0 + 33 * DAY)).penalties).some(p => p.playerId === 'p1'));
  assert.ok(Object.values(season(sweep(state, T0 + 34 * DAY)).penalties).some(p => p.playerId === 'p1'));
  // p2 was penalised on day 15: penalised again one full period later (default), never when set to once.
  assert.equal(Object.values(season(sweep(state, T0 + 29 * DAY)).penalties).filter(p => p.playerId === 'p2').length, 2);
});
test('inactivity policy is configurable: automatic, once per season, activity definition, switched off', () => {
  const sweep = (state, at) => act(state, admin, { action: 'sweep' }, at);
  let auto = sweep(ladder({ count: 4, rules: { inactivity: { review: 'auto', days: 7, dropPositions: 1, repeat: 'once' } } }), T0 + 7 * DAY);
  assert.deepEqual(Object.values(season(auto).penalties).map(p => p.status), ['applied', 'applied', 'applied', 'applied']);
  assert.equal(audits(auto).filter(a => a.action === 'system.penaltyApplied').length, 4);
  auto = sweep(auto, T0 + 30 * DAY);
  assert.equal(Object.keys(season(auto).penalties).length, 4);                    // once per season
  assert.equal(Object.keys(season(sweep(ladder({ rules: { inactivity: { enabled: false } } }), T0 + 60 * DAY)).penalties).length, 0);
  // With "sending or answering a challenge" as activity, a declined challenge keeps both players active.
  let state = act(ladder({ count: 4, rules: { inactivity: { activity: 'challenge' } } }), 4, { action: 'challenge', opponentId: 'p2' }, T0 + 10 * DAY);
  state = act(state, 2, { action: 'respond', challengeId: lastChallenge(state)[0], accept: false }, T0 + 10 * DAY);
  assert.deepEqual(Object.values(season(sweep(state, T0 + 14 * DAY)).penalties).map(p => p.playerId).sort(), ['p1', 'p3']);
});
test('players request exemptions; only organizers approve; reasons stay private', () => {
  let state = act(ladder(), 4, { action: 'request', type: 'exemption', category: 'travel', until: T0 + 10 * DAY, reason: 'Knee surgery' });
  refuses(() => run(state, 4, { action: 'request', type: 'exemption', category: 'travel', until: T0 + 12 * DAY, reason: 'Again' }), /already have an exemption request/);
  refuses(() => run(state, 5, { action: 'request', type: 'exemption', category: 'travel', until: T0 - DAY, reason: 'Past' }), /end date/);
  const requestId = Object.keys(state.private.s1.requests.p4)[0];
  assert.equal(JSON.stringify(state.public).includes('Knee surgery'), false);
  assert.equal(JSON.stringify(state.audit).includes('Knee surgery'), false);
  state = act(state, admin, { action: 'decideRequest', playerId: 'p4', requestId, approve: true, reason: 'organizer decision' });
  assert.equal(season(state).players.p4.exemptUntil, T0 + 10 * DAY);
  refuses(() => run(state, admin, { action: 'decideRequest', playerId: 'p4', requestId, approve: false, reason: 'organizer decision' }), /already been decided/);
});
test('no-show: reporter needs an organizer by default; loser gets 0, winner the configured walkover points', () => {
  const accepted = rules => { let s = act(ladder({ rules }), 5, { action: 'challenge', opponentId: 'p3' }); const id = lastChallenge(s)[0]; return [act(s, 3, { action: 'respond', challengeId: id, accept: true }), id]; };
  let [state, id] = accepted();
  state = act(state, 5, { action: 'submit', challengeId: id, kind: 'noShow' });
  assert.deepEqual([season(state).challenges[id].status, season(state).challenges[id].review], ['disputed', 'noShow']);
  refuses(() => run(state, 3, { action: 'confirm', challengeId: id }), /no reported result/);
  state = act(state, admin, { action: 'resolve', challengeId: id, winnerId: 'p5', kind: 'noShow', reason: 'opponent confirmed by phone' });
  assert.deepEqual([points(state).p5, points(state).p3, ranks(state).p5, season(state).challenges[id].outcome.bonuses], [3, 0, 3, []]);
  assert.deepEqual(Object.values(season(state).points).map(e => e.type), ['walkoverWin', 'noShow']);
  // Custom: separate walkover points with bonuses, no position change, and the reported player may confirm.
  [state, id] = accepted({ points: { walkoverWin: 2, walkoverBonuses: true, walkoverSwap: false }, noShow: { requireOrganizer: false } });
  state = act(state, 5, { action: 'submit', challengeId: id, kind: 'noShow' });
  assert.equal(season(state).challenges[id].status, 'submitted');
  state = act(state, 3, { action: 'confirm', challengeId: id });
  assert.deepEqual([points(state).p5, points(state).p3, ranks(state).p5], [4, 0, 5]);
  [state, id] = accepted({ noShow: { enabled: false } });
  refuses(() => run(state, 5, { action: 'submit', challengeId: id, kind: 'noShow' }), /Ask an organizer/);
  // A walkover given with notice, recorded by an organizer.
  state = act(state, admin, { action: 'resolve', challengeId: id, winnerId: 'p3', kind: 'walkover', reason: 'p5 withdrew with notice' });
  assert.deepEqual(Object.values(season(state).points).map(e => [e.type, e.amount]), [['walkoverWin', 3], ['walkoverLoss', 0]]);
});

// ---------- rule snapshots and versioning ----------
test('rule changes are versioned, audited with before/after, and apply to new challenges only', () => {
  let state = act(ladder(), 5, { action: 'challenge', opponentId: 'p3' }); const oldId = lastChallenge(state)[0];
  state = act(state, 3, { action: 'respond', challengeId: oldId, accept: true });
  const snapshot = structuredClone(season(state).challenges[oldId].rules), frozen = JSON.stringify(season(state).challenges[oldId]);
  const before = { players: structuredClone(season(state).players), points: structuredClone(season(state).points) };
  refuses(() => run(state, admin, { action: 'saveRules', values: custom({ points: { win: 10 } }), baseVersion: 1 }), /Give a reason/);
  refuses(() => run(state, admin, { action: 'saveRules', values: custom({ points: { win: 0 } }), baseVersion: 1, reason: 'invalid' }), /cannot be saved.*points.win/);
  refuses(() => run(state, admin, { action: 'saveRules', values: custom({}), baseVersion: 1, reason: 'no change' }), /Nothing was changed/);
  state = act(state, admin, { action: 'saveRules', values: custom({ points: { win: 10, challengeBonus: 0 }, swap: { enabled: false }, extension: { allowSwap: false } }), baseVersion: 1, reason: 'Board decision 12 Nov' }, T0 + HOUR);
  refuses(() => run(state, admin, { action: 'saveRules', values: custom({ points: { win: 11 } }), baseVersion: 1, reason: 'stale tab' }), /rules changed since you opened them/);
  assert.equal(season(state).rules.version, 2);
  assert.equal(season(state).rulesHistory.v1.values.points.win, 3);
  assert.deepEqual([season(state).rulesHistory.v2.values.points.win, season(state).rulesHistory.v2.reason, season(state).rulesHistory.v2.actor], [10, 'Board decision 12 Nov', 'organizer']);
  const entry = audits(state).at(-1);
  assert.deepEqual([entry.action, entry.actor.uid, entry.at, entry.reason], ['saveRules', 'organizer', T0 + HOUR, 'Board decision 12 Nov']);
  assert.deepEqual(entry.before, { swap_enabled: true, extension_allowSwap: true, points_win: 3, points_challengeBonus: 1 });
  assert.deepEqual(entry.after, { swap_enabled: false, extension_allowSwap: false, points_win: 10, points_challengeBonus: 0 });
  // Nothing already recorded was recalculated.
  assert.equal(JSON.stringify(season(state).challenges[oldId]), frozen);
  assert.deepEqual({ players: season(state).players, points: season(state).points }, before);
  // The old challenge is judged by its own snapshot (3 + 1 + 1, with a swap) ...
  state = act(state, 5, { action: 'submit', challengeId: oldId, winnerId: 'p5', score: '6-4 6-3' }, T0 + 2 * HOUR);
  state = act(state, 3, { action: 'confirm', challengeId: oldId }, T0 + 2 * HOUR);
  assert.deepEqual([points(state).p5, ranks(state).p5], [5, 3]);
  assert.deepEqual(season(state).challenges[oldId].rules, snapshot);
  assert.equal(Object.values(season(state).points).every(e => e.rulesVersion === 1), true);
  // ... and a new challenge by version 2 (10 points, no bonus, no position change).
  state = play(state, 8, 6, { at: T0 + 3 * HOUR });
  assert.deepEqual([points(state).p8, ranks(state).p8, lastChallenge(state)[1].rules.version], [11, 8, 2]);
});
test('a new season starts from the shared defaults or a copy; another season’s rules are never replaced', () => {
  let state = act(ladder({ rules: { points: { win: 7 } } }), admin, { action: 'createSeason', seasonId: 's2', name: 'Spring', reason: 'spring season' });
  assert.deepEqual(state.public.s2.rules.values, DEFAULT_RULES);
  state = act(state, admin, { action: 'createSeason', seasonId: 's3', name: 'Summer', copyRulesFrom: 's1', reason: 'summer season' });
  assert.equal(state.public.s3.rules.values.points.win, 7);
  assert.equal(state.public.s1.rules.values.points.win, 7);
  assert.equal(state.index.current, 's1');
  refuses(() => run(state, admin, { action: 'createSeason', seasonId: 's2', name: 'Again', reason: 'again' }), /already in use/);
  refuses(() => run(state, admin, { seasonId: 's2', action: 'setStatus', status: 'active', reason: 'open' }), /at least two players/);
});

// ---------- organizer tools, audit, freeze ----------
test('seeding by UTR, manual positions, points and eligibility are organizer-only and audited', () => {
  let state = ladder({ count: 4, status: 'draft' });
  state = act(state, admin, { action: 'syncPlayers', players: { p4: { name: 'Player Four', utr: 9.5, verified: true }, p1: { utr: 5 }, ghost: { utr: 1 } }, reason: 'refresh from PPRC' });
  assert.deepEqual([season(state).players.p4.name, season(state).players.p4.utr, ranks(state).p4], ['Player Four', 9.5, 4]);
  state = act(state, admin, { action: 'seed', reason: 'initial seeding from UTR' });
  assert.deepEqual(ranks(state), { p4: 1, p2: 2, p3: 3, p1: 4 });
  assert.equal(audits(state).at(-1).rankChanges.length, 2);
  state = act(state, admin, { action: 'setStatus', status: 'active', reason: 'go live' });
  state = act(state, admin, { action: 'adjust', playerId: 'p1', rank: 2, pointsDelta: -3, reason: 'correction after appeal' });
  assert.deepEqual([ranks(state).p1, ranks(state).p2, ranks(state).p3, points(state).p1], [2, 3, 4, -3]);
  const entry = audits(state).at(-1);
  assert.deepEqual([entry.before, entry.after, entry.reason], [{ rank: 4, points: 0, eligible: true, utr: 5, verified: false }, { rank: 2, points: -3, eligible: true, utr: 5, verified: false }, 'correction after appeal']);
  assert.deepEqual(Object.values(season(state).points).at(-1), { playerId: 'p1', amount: -3, type: 'adjustment', at: T0, note: 'correction after appeal' });
  refuses(() => run(state, admin, { action: 'adjust', playerId: 'p1', rank: 9, reason: 'bad' }), /position on the ladder/);
  refuses(() => run(state, admin, { action: 'adjust', playerId: 'p1', reason: 'nothing' }), /Choose what to change/);
  state = play(state, 3, 1);
  refuses(() => run(state, admin, { action: 'seed', reason: 'too late' }), /before the first challenge/);
  assert.deepEqual(Object.values(season(state).players).map(p => p.rank).sort(), [1, 2, 3, 4]);          // always 1..n, no gaps
});
test('voiding a result reverses its points with new ledger lines and keeps the history', () => {
  let state = play(ladder(), 5, 3); const id = lastChallenge(state)[0], lines = Object.keys(season(state).points).length;
  state = act(state, admin, { action: 'voidResult', challengeId: id, reason: 'wrong match recorded' });
  assert.deepEqual([points(state).p5, points(state).p3, season(state).challenges[id].status, season(state).players.p5.wins], [0, 0, 'voided', 0]);
  assert.equal(Object.keys(season(state).points).length, lines * 2);
  assert.equal(season(state).challenges[id].outcome.points.p5, 5);                // the original outcome is still on record
  assert.equal(ranks(state).p5, 3);                                               // positions change only by an explicit, audited adjustment
  refuses(() => run(state, admin, { action: 'voidResult', challengeId: id, reason: 'twice' }), /Only a completed match/);
});
test('every action is audited with actor, UTC time and target; player reasons never leak', () => {
  const state = play(ladder({ count: 4 }), 4, 2);
  const actions = audits(state).map(a => a.action);
  assert.deepEqual(actions.slice(-5), ['setStatus', 'challenge', 'respond', 'submit', 'confirm']);
  assert.ok(audits(state).every(a => Number.isSafeInteger(a.at) && a.actor?.role && (a.actor.role === 'system' || a.actor.uid)));
  assert.deepEqual(audits(state).at(-1).actor, { role: 'player', uid: 'u2', playerId: 'p2' });
  assert.equal(audits(state).filter(a => a.action === 'enroll').length, 4);
});
test('a frozen season stops players and automatic rules; organizers can still adjudicate; closed is final', () => {
  let state = act(ladder(), 5, { action: 'challenge', opponentId: 'p3' }); const id = lastChallenge(state)[0];
  state = act(state, admin, { action: 'setStatus', status: 'frozen', reason: 'final week review' });
  for (const [who, payload] of [[3, { action: 'respond', challengeId: id, accept: true }], [5, { action: 'withdraw', challengeId: id }], [6, { action: 'challenge', opponentId: 'p4' }], [6, { action: 'request', type: 'exemption', category: 'travel', until: T0 + DAY, reason: 'away' }]])
    refuses(() => run(state, who, payload), /season is frozen/);
  const later = act(state, admin, { action: 'sweep' }, T0 + 30 * DAY);
  assert.deepEqual([season(later).challenges[id].status, Object.keys(season(later).penalties).length], ['pending', 0]);   // no expiry, no inactivity
  refuses(() => run(state, admin, { action: 'setStatus', status: 'closed', reason: 'done' }), /Resolve or cancel every unfinished challenge/);
  refuses(() => run(state, admin, { action: 'setStatus', status: 'draft', reason: 'back' }), /cannot become draft/);
  state = act(state, admin, { action: 'cancel', challengeId: id, reason: 'season ending' });
  state = act(state, admin, { action: 'adjust', playerId: 'p8', pointsDelta: 1, reason: 'late correction' });
  const reopened = act(state, admin, { action: 'setStatus', status: 'active', reason: 'one more week' });
  assert.equal(challengeIds(act(reopened, 6, { action: 'challenge', opponentId: 'p4' })).length, 2);
  state = act(state, admin, { action: 'setStatus', status: 'closed', reason: 'season complete' });
  assert.equal(state.index.seasons.s1.status, 'closed');
  for (const [who, payload] of [[6, { action: 'challenge', opponentId: 'p4' }], [admin, { action: 'adjust', playerId: 'p1', pointsDelta: 1, reason: 'nope' }], [admin, { action: 'setStatus', status: 'active', reason: 'reopen' }], [admin, { action: 'saveRules', values: DEFAULT_RULES, baseVersion: 1, reason: 'nope' }]])
    refuses(() => run(state, who, payload), /season is closed/);
  // A second season cannot open while one is running; it can once the first is closed.
  let two = act(ladder(), admin, { action: 'createSeason', seasonId: 's2', name: 'Next', reason: 'next season' });
  for (const p of ['p1', 'p2']) two = act(two, admin, { seasonId: 's2', action: 'enroll', playerId: p, name: p, reason: 'roster' });
  refuses(() => run(two, admin, { seasonId: 's2', action: 'setStatus', status: 'active', reason: 'open' }), /Close the season that is running/);
  refuses(() => run(two, 1, { seasonId: 's2', action: 'challenge', opponentId: 'p2' }), /not open yet/);
});
test('invalid input is refused without changing anything', () => {
  const state = ladder(), copy = structuredClone(state);
  for (const payload of [null, [], { action: 'nonsense' }, { action: 'challenge', opponentId: '__proto__' }, { action: 'challenge', opponentId: 'p3', opId: 'bad id!' }, { action: 'challenge', seasonId: 'missing', opponentId: 'p3' }])
    assert.throws(() => applyLadder(state, payload && !Array.isArray(payload) ? { seasonId: 's1', ...payload } : payload, { uid: 'u5' }, { now: T0, id: 'x' }), { name: 'ValidationError' });
  assert.throws(() => applyLadder(state, { seasonId: 's1', action: 'challenge', opponentId: 'p3' }, { uid: null }, { now: T0, id: 'x' }), { name: 'ValidationError' });
  assert.deepEqual(state, copy);
});

// ---------- verified status, request reasons, admin reasons, older stored rules ----------
test('verified: set from PPRC history by the server, earned by playing a ladder match, editable by an organizer with UTR', () => {
  let state = ladder({ count: 4 });
  assert.equal(season(state).players.p4.verified, false);                        // a new player with no PPRC match on record
  state = act(state, admin, { action: 'enroll', playerId: 'p9', name: 'Known Player', utr: 5, verified: true, reason: 'late entry' });
  assert.equal(season(state).players.p9.verified, true);
  state = act(state, admin, { action: 'syncPlayers', players: { p1: { verified: true }, p9: { verified: false } }, reason: 'refresh from PPRC' });
  assert.deepEqual([season(state).players.p1.verified, season(state).players.p9.verified], [true, true]);   // a refresh never removes it
  state = play(state, 4, 2);
  assert.deepEqual([season(state).players.p4.verified, season(state).players.p2.verified, season(state).players.p3.verified], [true, true, false]);
  state = act(state, admin, { action: 'adjust', playerId: 'p3', verified: true, utr: 6.25, reason: 'played KOC under another spelling' });
  assert.deepEqual([season(state).players.p3.verified, season(state).players.p3.utr], [true, 6.25]);
  assert.deepEqual([Object.values(state.audit).at(-1).before.verified, Object.values(state.audit).at(-1).after.verified, Object.values(state.audit).at(-1).after.utr], [false, true, 6.25]);
  refuses(() => run(state, admin, { action: 'adjust', playerId: 'p3', utr: 40, reason: 'typo' }), /UTR from 0 to 16.5/);
  refuses(() => run(state, 3, { action: 'adjust', playerId: 'p3', verified: true, reason: 'me' }), /Organizer access/);
});
test('extension and exemption requests need one of the listed reasons: injury, travel, weather, court closure, scheduling', () => {
  let state = act(ladder(), 5, { action: 'challenge', opponentId: 'p3' }); const id = lastChallenge(state)[0];
  state = act(state, 3, { action: 'respond', challengeId: id, accept: true });
  const due = season(state).challenges[id].deadline;
  refuses(() => run(state, 5, { action: 'request', type: 'extension', challengeId: id, until: due + DAY, reason: 'no category' }), /injury, travel, weather, court closure or scheduling/);
  refuses(() => run(state, 5, { action: 'request', type: 'exemption', category: 'holiday', until: T0 + 5 * DAY, reason: 'not on the list' }), /injury, travel, weather/);
  for (const category of ['injury', 'travel', 'weather', 'courtClosure', 'scheduling']) {
    const asked = act(state, 5, { action: 'request', type: 'extension', category, challengeId: id, until: due + DAY, reason: 'details for the organizer' });
    assert.equal(Object.values(asked.private.s1.requests.p5)[0].category, category);
  }
});
test('every organizer action needs a reason and is audited with it', () => {
  const state = act(ladder(), 5, { action: 'challenge', opponentId: 'p3' }), id = lastChallenge(state)[0];
  for (const payload of [{ action: 'createSeason', seasonId: 's9', name: 'No reason' }, { action: 'enroll', playerId: 'px', name: 'X' }, { action: 'link', uid: 'ux', playerId: 'p1' }, { action: 'unlink', uid: 'u1' },
    { action: 'syncPlayers', players: {} }, { action: 'seed' }, { action: 'setStatus', status: 'frozen' }, { action: 'saveRules', values: DEFAULT_RULES, baseVersion: 1 }, { action: 'adjust', playerId: 'p1', rank: 2 },
    { action: 'resolve', challengeId: id, winnerId: 'p5', kind: 'walkover' }, { action: 'cancel', challengeId: id }, { action: 'voidResult', challengeId: id }, { action: 'grant', type: 'exemption', playerId: 'p1', until: T0 + DAY },
    { action: 'decideRequest', playerId: 'p1', requestId: 'r', approve: true }, { action: 'decidePenalty', penaltyId: 'x', apply: true }])
    refuses(() => run(state, admin, payload), /Give a reason/);
  const organizerEntries = Object.values(state.audit).filter(a => a.actor.role === 'organizer');
  assert.ok(organizerEntries.length > 10 && organizerEntries.every(a => typeof a.reason === 'string' && a.reason.length >= 3));
});
test('several ranking changes in one week keep positions unique and are each audited', () => {
  let state = ladder();
  state = play(state, 5, 3, { at: T0 });                                         // Mon: 5 <-> 3
  state = play(state, 8, 6, { at: T0 + DAY });                                   // Tue: 8 <-> 6
  state = play(state, 4, 1, { at: T0 + 2 * DAY });                               // Wed: 4 <-> 1
  state = play(state, 7, 3, { at: T0 + 3 * DAY, winner: 3 });                    // Thu: defended, no change
  state = play(state, 2, 4, { at: T0 + 4 * DAY, winner: 2 });                    // Fri: p2 (#2) beats p4 (#1): swap
  assert.deepEqual(ranks(state), { p2: 1, p4: 2, p5: 3, p1: 4, p3: 5, p8: 6, p7: 7, p6: 8 });
  assert.deepEqual(Object.values(season(state).players).map(p => p.rank).sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  const moves = Object.values(state.audit).filter(a => a.rankChanges?.length);
  assert.equal(moves.length, 4);
  assert.ok(moves.every(a => a.action === 'confirm' && a.rankChanges.length === 2));
  assert.ok(Object.values(season(state).challenges).every(c => c.outcome.late === false));   // all inside the same Sunday deadline
});
test('a season stored before a rule existed gets that rule’s default and nothing else changes', () => {
  let state = ladder({ rules: { points: { win: 7 } } });
  delete state.public.s1.rules.values.match;                                     // as written by an earlier version of the app
  assert.equal(validateRules(state.public.s1.rules.values).ok, false);
  assert.deepEqual(completeRules(state.public.s1.rules.values).match, DEFAULT_RULES.match);
  state = act(state, 5, { action: 'challenge', opponentId: 'p3' });
  assert.deepEqual([season(state).rules.version, season(state).rules.values.points.win, season(state).rules.values.match.thirdSet, lastChallenge(state)[1].rules.values.match.thirdSet], [2, 7, 'matchTiebreak', 'matchTiebreak']);
});


test('an extension must advance the currently approved deadline', () => {
  let state = act(ladder(), 5, { action: 'challenge', opponentId: 'p3' });
  const [challengeId] = lastChallenge(state);
  state = act(state, 3, { action: 'respond', challengeId, accept: true });
  const due = season(state).challenges[challengeId].deadline;
  state = act(state, admin, { action: 'grant', type: 'extension', challengeId, until: due + 3 * DAY, reason: 'courts closed' });
  refuses(() => run(state, admin, { action: 'grant', type: 'extension', challengeId, until: due + DAY, reason: 'shorter extension' }), /after the.*deadline/);
  refuses(() => run(state, 5, { action: 'request', type: 'extension', category: 'weather', challengeId, until: due + 2 * DAY, reason: 'rain forecast' }), /after the current/);
});

test('voiding a result rebuilds both players’ streaks from the remaining results', () => {
  let state = play(ladder(), 5, 3);
  const firstId = lastChallenge(state)[0];
  state = play(state, 5, 2, { at: T0 + DAY });
  const secondId = lastChallenge(state)[0];
  assert.equal(season(state).players.p5.streak, 2);
  state = act(state, admin, { action: 'voidResult', challengeId: firstId, reason: 'duplicate match' }, T0 + 2 * DAY);
  assert.equal(season(state).players.p5.streak, 1);
  state = act(state, admin, { action: 'voidResult', challengeId: secondId, reason: 'incorrect match' }, T0 + 2 * DAY);
  assert.equal(season(state).players.p5.streak, 0);

  state = play(ladder(), 5, 3);
  state = play(state, 5, 2, { winner: 2, at: T0 + DAY });
  const lossId = lastChallenge(state)[0];
  assert.equal(season(state).players.p5.streak, 0);
  state = act(state, admin, { action: 'voidResult', challengeId: lossId, reason: 'incorrect winner' }, T0 + 2 * DAY);
  assert.equal(season(state).players.p5.streak, 1);
  assert.equal(season(state).players.p2.streak, 0);
});
