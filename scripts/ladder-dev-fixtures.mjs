// DEVELOPMENT ONLY. A made-up roster and a short season for the local demo (npm run demo) and the Firebase emulators.
// Nothing in the web app or the Cloud Functions imports this file, so it can never reach production data.
import { applyLadder } from '../functions/lib/singlesLadder/engine.js';
import { ValidationError } from '../functions/lib/tournament.js';

const DAY = 86400000, HOUR = 3600000;
export const DEMO_SEASON = 'demo';
export const DEMO_ROSTER = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`ladder_demo_${i + 1}`, { name: `Demo Player ${i + 1}`, utr: Number((7 - i * 0.21).toFixed(2)) }]));
export const demoUid = playerId => `demo_${playerId}`;

// Builds the demo season through the real rules engine (so it obeys every rule) and refuses to touch an existing ladder.
export function seedDemoLadder(ladder, now, uidFor = demoUid) {
  if (Object.keys(ladder?.index?.seasons || {}).length) throw new ValidationError('A ladder season already exists here. The demo seed never replaces one.');
  const organizer = { uid: 'demo_seed', admin: true }, id = n => `ladder_demo_${n}`, player = n => ({ uid: uidFor(id(n)), admin: false });
  let state = ladder || {}, count = 0;
  const step = (actor, at, payload) => { const out = applyLadder(state, { seasonId: DEMO_SEASON, ...payload }, actor, { now: at, id: `seed${String(++count).padStart(3, '0')}` }); state = out.state; return out.result; };
  const start = now - 10 * DAY;
  step(organizer, start, { action: 'createSeason', seasonId: DEMO_SEASON, name: 'Demo Season' });
  for (const [playerId, record] of Object.entries(DEMO_ROSTER)) { step(organizer, start, { action: 'enroll', playerId, ...record }); step(organizer, start, { action: 'link', uid: uidFor(playerId), playerId }); }
  step(organizer, start, { action: 'seed', reason: 'Initial seeding from UTR' });
  step(organizer, start, { action: 'setStatus', status: 'active', reason: 'Demo season opened' });
  const challenge = (a, b, at) => { const { challengeId } = step(player(a), at, { action: 'challenge', opponentId: id(b) }); return challengeId; };
  const played = (a, b, at, challengerWins, score) => {
    const challengeId = challenge(a, b, at);
    step(player(b), at + HOUR, { action: 'respond', challengeId, accept: true });
    step(player(a), at + 2 * HOUR, { action: 'submit', challengeId, winnerId: id(challengerWins ? a : b), score });
    step(player(b), at + 3 * HOUR, { action: 'confirm', challengeId });
  };
  played(6, 4, now - 8 * DAY, true, '6-4 7-5');
  played(9, 7, now - 7 * DAY, false, '3-6 6-4 8-10');
  played(12, 10, now - 5 * DAY, true, '6-2 6-3');
  played(3, 2, now - 4 * DAY, true, '7-6 6-4');
  played(8, 5, now - 3 * DAY, false, '4-6 2-6');
  step(player(9), now - DAY, { action: 'respond', challengeId: challenge(11, 9, now - DAY - HOUR), accept: true });   // accepted, still to play
  challenge(5, 3, now - 2 * HOUR);                                                                                    // waiting for an answer
  return state;
}
