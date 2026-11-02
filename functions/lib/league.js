// League play: round-robin fixtures, captain score submissions with admin approval, and standings.
// Like tournament.js, every apply* function takes the whole tournament state and returns { state, result }.
import { ValidationError } from './tournament.js';

export const MATCHES = [
  { key: 'd1', label: 'Doubles 1' },
  { key: 'd2', label: 'Doubles 2' },
  { key: 's', label: 'Singles' }
];
export const POINTS_PER_WIN = 2;
const SCORE_PATTERN = /^[0-9 ()\-–/,]{0,40}$/;

function assert(condition, message) { if (!condition) throw new ValidationError(message); }
const tierTeams = (state, tierId) => Object.values(state.tiers?.[tierId]?.teams || {});

// Circle-method round robin: every team meets every other team once. An odd count gets a bye each round.
export function roundRobin(teamIds) {
  const ids = [...teamIds];
  if (ids.length < 2) return [];
  if (ids.length % 2) ids.push(null);
  const rounds = [], n = ids.length;
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i], b = ids[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  return rounds;
}

export function applyGenerateFixtures(current, payload) {
  const tierId = payload?.tierId;
  assert(typeof tierId === 'string' && Object.hasOwn(current?.tierConfig || {}, tierId), 'Choose an existing tier.');
  const existing = Object.values(current.fixtures?.[tierId] || {});
  assert(payload.replace === true || !existing.some(f => f.status !== 'scheduled'), 'This tier already has submitted or final results. Confirm replacing the schedule to start again.');
  const teams = tierTeams(current, tierId).sort((a, b) => a.registeredAt - b.registeredAt);
  assert(teams.length >= 2, 'A tier needs at least two teams before fixtures can be generated.');
  const state = structuredClone(current);
  state.fixtures ||= {};
  state.fixtures[tierId] = {};
  roundRobin(teams.map(t => t.teamId)).forEach((pairs, r) => pairs.forEach(([home, away], i) => {
    const id = `r${String(r + 1).padStart(2, '0')}m${i + 1}`;
    state.fixtures[tierId][id] = { id, tierId, round: r + 1, home, away, status: 'scheduled' };
  }));
  return { state, result: { tierId, fixtures: Object.keys(state.fixtures[tierId]).length, rounds: Math.max(0, teams.length - 1 + (teams.length % 2)) } };
}

function validMatches(matches) {
  assert(Array.isArray(matches) && matches.length === MATCHES.length, 'Enter a result for Doubles 1, Doubles 2 and Singles.');
  return MATCHES.map(({ key, label }, i) => {
    const m = matches[i];
    assert(m && m.key === key, 'Results must be in the order Doubles 1, Doubles 2, Singles.');
    assert(m.winner === 'home' || m.winner === 'away', `Choose the winner of ${label}.`);
    const score = typeof m.score === 'string' ? m.score.trim() : '';
    assert(SCORE_PATTERN.test(score), `${label}: the score can only contain numbers, spaces and - ( ) / , characters.`);
    return { key, winner: m.winner, score };
  });
}
export const encounterWinner = matches => (matches.filter(m => m.winner === 'home').length >= 2 ? 'home' : 'away');

// A captain's submission waits for admin approval; an admin's entry is final straight away.
export function applySubmitResult(current, payload, uid, isAdmin = false, now = Date.now()) {
  assert(typeof uid === 'string' && uid, 'Sign in before submitting a score.');
  const fixture = current?.fixtures?.[payload?.tierId]?.[payload?.fixtureId];
  assert(fixture, 'That fixture no longer exists.');
  const owns = id => current.registrations?.[id]?.ownerUid === uid;
  const side = owns(fixture.home) ? 'home' : owns(fixture.away) ? 'away' : null;
  assert(isAdmin || side, 'Only the captains of these two teams can submit this score.');
  assert(isAdmin || fixture.status !== 'final', 'This result is final. Ask the admin to correct it.');
  const matches = validMatches(payload.matches);
  const state = structuredClone(current), target = state.fixtures[payload.tierId][payload.fixtureId];
  if (isAdmin) {
    target.result = { matches, winner: encounterWinner(matches), approvedAt: now };
    target.status = 'final';
    delete target.submission;
  } else {
    target.submission = { matches, winner: encounterWinner(matches), side, submittedAt: now };
    target.status = 'submitted';
  }
  return { state, result: { status: target.status } };
}

export function applyReviewResult(current, payload, now = Date.now()) {
  const fixture = current?.fixtures?.[payload?.tierId]?.[payload?.fixtureId];
  assert(fixture, 'That fixture no longer exists.');
  assert(fixture.status === 'submitted' && fixture.submission, 'There is no submitted score waiting for review.');
  const state = structuredClone(current), target = state.fixtures[payload.tierId][payload.fixtureId];
  if (payload.approve === true) {
    target.result = { matches: target.submission.matches, winner: target.submission.winner, approvedAt: now };
    target.status = 'final';
  } else {
    target.status = target.result ? 'final' : 'scheduled';
  }
  delete target.submission;
  return { state, result: { status: target.status } };
}

// Standings from final results: 2 points per encounter win; ties break on match difference,
// then matches won, then combined UTR.
export function standings(teams, fixtures) {
  const rows = new Map(teams.map(t => [t.teamId, { team: t, played: 0, won: 0, lost: 0, matchesWon: 0, matchesLost: 0, points: 0, form: [] }]));
  const finals = Object.values(fixtures || {}).filter(f => f.status === 'final' && f.result).sort((a, b) => a.round - b.round || a.result.approvedAt - b.result.approvedAt);
  for (const f of finals) {
    const home = rows.get(f.home), away = rows.get(f.away);
    if (!home || !away) continue;
    const homeMatches = f.result.matches.filter(m => m.winner === 'home').length, awayMatches = f.result.matches.length - homeMatches;
    for (const [row, won, mine, theirs] of [[home, f.result.winner === 'home', homeMatches, awayMatches], [away, f.result.winner === 'away', awayMatches, homeMatches]]) {
      row.played++; row.matchesWon += mine; row.matchesLost += theirs;
      if (won) { row.won++; row.points += POINTS_PER_WIN; } else row.lost++;
      row.form.push(won ? 'W' : 'L');
    }
  }
  return [...rows.values()]
    .map(row => ({ ...row, form: row.form.slice(-5) }))
    .sort((a, b) => b.points - a.points || (b.matchesWon - b.matchesLost) - (a.matchesWon - a.matchesLost) || b.matchesWon - a.matchesWon || b.team.combinedUtr - a.team.combinedUtr)
    .map((row, i) => ({ ...row, position: i + 1 }));
}
export const playoffSpots = teamCount => (teamCount > 7 ? 4 : 3);
