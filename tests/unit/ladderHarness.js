// Shared helpers for the Singles Ladder unit tests (not a test file itself).
import { applyLadder } from '../../functions/lib/singlesLadder/engine.js';
import { DEFAULT_RULES } from '../../functions/lib/singlesLadder/config.js';

export const T0 = Date.parse('2026-11-09T18:00:00Z');   // Monday noon in Chicago (CST)
export const HOUR = 3600000, DAY = 86400000;
export const admin = { uid: 'organizer', admin: true };
let counter = 0;
// Applies one action and returns the new state. `who` is an actor object or a player number (uid u<N>).
export function run(state, who, payload, now = T0) {
  const actor = typeof who === 'number' ? { uid: `u${who}`, admin: false } : who;
  return applyLadder(state, { seasonId: 's1', ...payload }, actor, { now, id: `id${++counter}` });
}
export const act = (...args) => run(...args).state;
export const season = state => state.public.s1;
export const challengeIds = state => Object.keys(season(state).challenges || {});
export const lastChallenge = state => { const id = challengeIds(state).at(-1); return [id, season(state).challenges[id]]; };
export const custom = changes => { const values = structuredClone(DEFAULT_RULES); for (const [group, fields] of Object.entries(changes)) Object.assign(values[group], fields); return values; };
// An active season `s1` with `count` players p1..pN ranked in that order, each linked to account u1..uN.
export function ladder({ count = 8, rules, status = 'active' } = {}) {
  let state = act({}, admin, { action: 'createSeason', seasonId: 's1', name: 'Test season', reason: 'test season' });
  for (let i = 1; i <= count; i++) {
    state = act(state, admin, { action: 'enroll', playerId: `p${i}`, name: `Player ${i}`, utr: 8 - i * 0.25, reason: 'test roster' });
    state = act(state, admin, { action: 'link', uid: `u${i}`, playerId: `p${i}`, reason: 'verified in person' });
  }
  if (rules) state = act(state, admin, { action: 'saveRules', values: custom(rules), baseVersion: 1, reason: 'test rules' });
  if (status !== 'draft') state = act(state, admin, { action: 'setStatus', status: 'active', reason: 'open season' });
  if (status === 'frozen') state = act(state, admin, { action: 'setStatus', status: 'frozen', reason: 'freeze' });
  return state;
}
// challenger -> opponent, accepted, score reported by the challenger and confirmed by the opponent.
export function play(state, challenger, opponent, { winner = challenger, at = T0, reportAt = at + HOUR, score } = {}) {
  state = act(state, challenger, { action: 'challenge', opponentId: `p${opponent}` }, at);
  const [challengeId] = lastChallenge(state);
  state = act(state, opponent, { action: 'respond', challengeId, accept: true }, at);
  state = act(state, challenger, { action: 'submit', challengeId, winnerId: `p${winner}`, score: score || (winner === challenger ? '6-4 6-3' : '4-6 3-6') }, reportAt);
  return act(state, opponent, { action: 'confirm', challengeId }, reportAt);
}
export const ranks = state => Object.fromEntries(Object.entries(season(state).players).map(([id, p]) => [id, p.rank]));
export const points = state => Object.fromEntries(Object.entries(season(state).players).map(([id, p]) => [id, p.points]));
