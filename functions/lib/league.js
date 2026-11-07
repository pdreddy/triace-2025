// League play: round-robin fixtures, playoffs, captain score submissions with admin approval,
// standings and player ratings. Like tournament.js, every apply* function takes the whole
// tournament state and returns { state, result }.
import { COURTS, validateCourt, cleanCourt, courtScoreText, SCORE_ERRORS, standings as scoreStandings, matchResult } from './scoring.js';
import { ValidationError, DEFAULT_LEAGUE_RULES, DEFAULT_SEASON_NAME, rulesOf, isOwner, validateRegistration, publicRecord } from './tournament.js';

export const ROLES = ['captain', 'ace1', 'ace2'];
export const ROLE_LABELS = { captain: 'Captain', ace1: 'Ace 1', ace2: 'Ace 2' };
// Who plays each match follows from two choices per team: the Doubles 1 pair and the Doubles 2 partner.
// "third" sat out Doubles 1; "leftOut" is the Doubles 1 player who sits out Doubles 2.
// Courts and their types come from scoring.js; this adds which of a team's players take each court.
const PLAYERS = {
  d1: l => l.d1,
  d2: l => [l.third, l.d2Partner],
  d3: l => [l.third, l.leftOut],
  s: l => [l.leftOut],
  s1: l => [l.third],
  s2: l => [l.leftOut]
};
export const FORMATS = Object.fromEntries(Object.entries(COURTS).map(([format, courts]) => [format, courts.map(c => ({ ...c, players: PLAYERS[c.key] }))]));
export const MATCHES = FORMATS.rr;
export const POINTS_PER_WIN = DEFAULT_LEAGUE_RULES.pointsPerWin;
const formatOf = fixture => FORMATS[fixture.format || 'rr'];

function assert(condition, message) { if (!condition) throw new ValidationError(message); }
const tierTeams = (state, tierId) => Object.values(state.tiers?.[tierId]?.teams || {});
const isLeague = fixture => !fixture.stage && !fixture.challenge;

// ---------- Dates ----------
// Dates are calendar days (YYYY-MM-DD). A deadline lasts until the end of that day anywhere on
// earth (UTC−12), so a result entered late in the evening in any time zone still counts as on time.
const DAY = 86400000, DATE = /^\d{4}-\d{2}-\d{2}$/;
const toDay = ms => new Date(ms).toISOString().slice(0, 10);
export const addDays = (date, days) => toDay(Date.parse(`${date}T00:00:00Z`) + days * DAY);
export const deadlineEnd = date => Date.parse(`${date}T23:59:59Z`) + 12 * 3600000;
export const isOverdue = (fixture, now = Date.now()) => !!fixture.dueBy && fixture.status !== 'final' && now > deadlineEnd(fixture.dueBy);
export const onTime = fixture => !fixture.dueBy || (fixture.completedAt != null && fixture.completedAt <= deadlineEnd(fixture.dueBy));
function validDate(value, label) { assert(typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), `${label} must be a date.`); return value; }
function dateRounds(fixtures, start, intervalDays) {
  for (const f of Object.values(fixtures)) if (isLeague(f) && f.round) { f.startsOn = addDays(start, (f.round - 1) * intervalDays); f.dueBy = addDays(f.startsOn, intervalDays - 1); }
}

export function deriveLineup(choice) {
  const third = ROLES.find(r => !choice.d1.includes(r)), leftOut = choice.d1.find(r => r !== choice.d2Partner);
  return { d1: choice.d1, d2Partner: choice.d2Partner, third, leftOut };
}
export function matchPlayers(fixture, side) {
  const choice = fixture.result?.lineups?.[side] || fixture.submission?.lineups?.[side];
  if (!choice) return null;
  const lineup = deriveLineup(choice);
  return Object.fromEntries(formatOf(fixture).map(m => [m.key, m.players(lineup)]));
}
function validLineup(value, label) {
  assert(value && Array.isArray(value.d1) && value.d1.length === 2 && value.d1.every(r => ROLES.includes(r)) && value.d1[0] !== value.d1[1], `${label}: choose the two Doubles 1 players.`);
  assert(value.d1.includes(value.d2Partner), `${label}: the Doubles 2 partner must be one of the Doubles 1 players.`);
  return { d1: [...value.d1], d2Partner: value.d2Partner };
}

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
  assert(payload.replace === true || !existing.some(f => f.status !== 'scheduled' && f.status !== 'pending'), 'This tier already has submitted or final results. Confirm replacing the schedule to start again.');
  const teams = tierTeams(current, tierId).sort((a, b) => a.registeredAt - b.registeredAt);
  assert(teams.length >= 2, 'A tier needs at least two teams before fixtures can be generated.');
  const state = structuredClone(current);
  state.fixtures ||= {};
  state.fixtures[tierId] = {};
  roundRobin(teams.map(t => t.teamId)).forEach((pairs, r) => pairs.forEach(([home, away], i) => {
    const id = `r${String(r + 1).padStart(2, '0')}m${i + 1}`;
    state.fixtures[tierId][id] = { id, tierId, round: r + 1, format: 'rr', home, away, status: 'scheduled' };
  }));
  const schedule = payload.start ? validSchedule(payload) : state.schedules?.[tierId];
  if (schedule) { state.schedules ||= {}; state.schedules[tierId] = schedule; dateRounds(state.fixtures[tierId], schedule.start, schedule.intervalDays); }
  return { state, result: { tierId, fixtures: Object.keys(state.fixtures[tierId]).length, rounds: Math.max(0, teams.length - 1 + (teams.length % 2)) } };
}

function validSchedule(payload) {
  const intervalDays = Number(payload.intervalDays);
  assert(Number.isInteger(intervalDays) && intervalDays >= 1 && intervalDays <= 60, 'Days per round must be 1–60.');
  return { start: validDate(payload.start, 'The start date'), intervalDays };
}
// Date every round: round r starts start + (r − 1) × interval and is due interval − 1 days later.
export function applySetSchedule(current, payload) {
  const tierId = payload?.tierId;
  assert(Object.hasOwn(current?.tierConfig || {}, tierId), 'Choose an existing tier.');
  const schedule = validSchedule(payload), state = structuredClone(current);
  state.schedules ||= {}; state.schedules[tierId] = schedule;
  if (state.fixtures?.[tierId]) dateRounds(state.fixtures[tierId], schedule.start, schedule.intervalDays);
  return { state, result: { tierId, schedule } };
}
// Move one fixture's deadline, e.g. for a rained-off week.
export function applyMoveFixture(current, payload) {
  const fixture = current?.fixtures?.[payload?.tierId]?.[payload?.fixtureId];
  assert(fixture, 'That fixture no longer exists.');
  const dueBy = validDate(payload.dueBy, 'The new deadline'), state = structuredClone(current);
  state.fixtures[payload.tierId][payload.fixtureId].dueBy = dueBy;
  return { state, result: { dueBy } };
}

// Seeds come from the admin's manual mapping, or from the standings when none are given.
// 4 seeds: SF1 1 v 3, SF2 2 v 4, then the final. 3 seeds: Eliminator 2 v 3, then 1 v its winner.
// 2 seeds: a single final.
export function applyGeneratePlayoffs(current, payload) {
  const tierId = payload?.tierId, tierFixtures = current?.fixtures?.[tierId] || {}, rules = rulesOf(current);
  const league = Object.values(tierFixtures).filter(isLeague);
  const tierTeamIds = new Set(tierTeams(current, tierId).map(t => t.teamId));
  let seeds;
  if (Array.isArray(payload?.seeds)) {
    seeds = payload.seeds;
    assert([2, 3, 4].includes(seeds.length), 'Choose 2, 3 or 4 playoff teams.');
    assert(seeds.every(id => tierTeamIds.has(id)) && new Set(seeds).size === seeds.length, 'Each playoff slot needs a different team from this tier.');
  } else {
    assert(league.length, 'Generate and play the round-robin fixtures first.');
    assert(payload?.force === true || league.every(f => f.status === 'final'), 'Some round-robin results are not final yet. Confirm to create the playoffs from the current standings.');
    const table = standings(tierTeams(current, tierId), tierFixtures, rules);
    assert(table.length >= 2, 'Playoffs need at least two teams.');
    seeds = table.slice(0, playoffSpots(table.length, rules)).map(r => r.team.teamId);
  }
  const state = structuredClone(current);
  state.fixtures ||= {}; state.fixtures[tierId] ||= {};
  const target = state.fixtures[tierId];
  for (const f of Object.values(target)) if (f.stage) delete target[f.id];
  const add = (id, stage, label, home, away, order) => { target[id] = { id, tierId, stage, label, order, format: 'po', home, away, status: home && away ? 'scheduled' : 'pending' }; };
  if (seeds.length === 4) {
    add('po-sf1', 'sf1', 'Semifinal 1', seeds[0], seeds[2], 1);
    add('po-sf2', 'sf2', 'Semifinal 2', seeds[1], seeds[3], 2);
    add('po-final', 'final', 'Final', null, null, 3);
  } else if (seeds.length === 3) {
    add('po-elim', 'elim', 'Eliminator', seeds[1], seeds[2], 1);
    add('po-final', 'final', 'Final', seeds[0], null, 2);
  } else {
    add('po-final', 'final', 'Final', seeds[0], seeds[1], 1);
  }
  return { state, result: { tierId, seeds } };
}

// Fill the final once its feeder matches are decided; a corrected feeder result resets the final.
function advancePlayoffs(fixtures) {
  const final = fixtures['po-final'];
  if (!final) return;
  const winnerOf = id => (fixtures[id]?.status === 'final' ? fixtures[id][fixtures[id].result.winner] : null);
  if (!fixtures['po-sf1'] && !fixtures['po-elim']) return;
  const slots = fixtures['po-sf1'] ? [winnerOf('po-sf1'), winnerOf('po-sf2')] : [final.home, winnerOf('po-elim')];
  if (slots[0] !== final.home || slots[1] !== final.away) {
    final.home = slots[0]; final.away = slots[1];
    delete final.result; delete final.submission;
    final.status = final.home && final.away ? 'scheduled' : 'pending';
  }
}

// Checks every court with the scoring rules and returns what is stored: the cleaned courts, a
// per-court summary (`matches`, winner and score text from the winner's side) and the totals.
function validCourts(fixture, courts) {
  const format = formatOf(fixture);
  assert(courts && typeof courts === 'object' && !Array.isArray(courts), SCORE_ERRORS.incomplete);
  const clean = {};
  for (const { key, label, type } of format) {
    const check = validateCourt(courts[key] && { ...courts[key], type });
    if (!check.valid) throw new ValidationError(check.errors[0] === SCORE_ERRORS.incomplete ? SCORE_ERRORS.incomplete : `${label}: ${check.errors.join(' ')}`);
    clean[key] = cleanCourt({ ...courts[key], type });
  }
  const totals = matchResult(fixture.format || 'rr', clean);
  const matches = format.map(({ key }) => ({ key, winner: totals.courts[key].winner, score: courtScoreText(clean[key], totals.courts[key].winner) }));
  const { courts: perCourt, ...summary } = totals;
  return { courts: clean, matches, summary: { ...summary, perCourt } };
}
export function encounterWinner(matches) {
  const home = matches.filter(m => m.winner === 'home').length, away = matches.filter(m => m.winner === 'away').length;
  return home > away ? 'home' : 'away';
}
function validLineups(lineups) {
  if (lineups == null) return null;
  return { home: validLineup(lineups.home, 'Home team'), away: validLineup(lineups.away, 'Away team') };
}

// A captain's submission waits for admin approval; an admin's entry is final straight away.
export function applySubmitResult(current, payload, uid, isAdmin = false, now = Date.now()) {
  assert(typeof uid === 'string' && uid, 'Sign in before submitting a score.');
  const fixture = current?.fixtures?.[payload?.tierId]?.[payload?.fixtureId];
  assert(fixture, 'That fixture no longer exists.');
  assert(fixture.home && fixture.away, 'This playoff match is waiting for the earlier rounds.');
  const owns = id => isOwner(current.registrations?.[id], uid);
  const side = owns(fixture.home) ? 'home' : owns(fixture.away) ? 'away' : null;
  assert(isAdmin || side, 'Only the captains of these two teams can submit this score.');
  assert(isAdmin || fixture.status !== 'final', 'This result is final. Ask the admin to correct it.');
  const { courts, matches, summary } = validCourts(fixture, payload.courts), lineups = validLineups(payload.lineups);
  const entry = { courts, matches, ...summary, ...(lineups ? { lineups } : {}) };
  const state = structuredClone(current), fixtures = state.fixtures[payload.tierId], target = fixtures[payload.fixtureId];
  target.completedAt ??= now;
  if (isAdmin) {
    target.result = { ...entry, approvedAt: now };
    target.status = 'final';
    delete target.submission;
    advancePlayoffs(fixtures);
  } else {
    target.submission = { ...entry, side, submittedAt: now };
    target.status = 'submitted';
  }
  return { state, result: { status: target.status } };
}

export function applyReviewResult(current, payload, now = Date.now()) {
  const fixture = current?.fixtures?.[payload?.tierId]?.[payload?.fixtureId];
  assert(fixture, 'That fixture no longer exists.');
  assert(fixture.status === 'submitted' && fixture.submission, 'There is no submitted score waiting for review.');
  const state = structuredClone(current), fixtures = state.fixtures[payload.tierId], target = fixtures[payload.fixtureId];
  if (payload.approve === true) {
    const { side, submittedAt, ...entry } = target.submission;
    target.result = { ...entry, approvedAt: now };
    target.status = 'final';
  } else {
    target.status = target.result ? 'final' : 'scheduled';
    if (!target.result) delete target.completedAt;
  }
  delete target.submission;
  advancePlayoffs(fixtures);
  return { state, result: { status: target.status } };
}

// Standings from final (approved) round-robin results: 1 point per encounter win (the admin setting
// scales the points shown). Order: points, head-to-head, court difference, game difference, games won.
const resultTotals = result => {
  if (result.courtsHome != null) return result;
  const courtsHome = (result.matches || []).filter(m => m.winner === 'home').length, courtsAway = (result.matches || []).filter(m => m.winner === 'away').length;
  return { ...result, courtsHome, courtsAway, gamesHome: 0, gamesAway: 0 }; // results saved before game totals were recorded
};
export function standings(teams, fixtures, rules = DEFAULT_LEAGUE_RULES) {
  const finals = Object.values(fixtures || {}).filter(f => isLeague(f) && f.status === 'final' && f.result).sort((a, b) => a.round - b.round || a.result.approvedAt - b.result.approvedAt);
  const byId = new Map(teams.map(t => [t.teamId, t])), form = new Map(teams.map(t => [t.teamId, []]));
  for (const f of finals) {
    if (!byId.has(f.home) || !byId.has(f.away)) continue;
    form.get(f.home).push(f.result.winner === 'home' ? 'W' : 'L'); form.get(f.away).push(f.result.winner === 'away' ? 'W' : 'L');
  }
  const table = scoreStandings(teams.map(t => t.teamId), finals.map(f => ({ home: f.home, away: f.away, status: 'final', result: resultTotals(f.result) })))
    .map(row => ({ ...row, team: byId.get(row.teamId), played: row.matchesPlayed, won: row.wins, lost: row.losses, matchesWon: row.courtsWon, matchesLost: row.courtsLost, points: row.wins * (rules.pointsPerWin ?? 1), form: form.get(row.teamId).slice(-5) }));
  return swapChallengers(table, fixtures).map((row, i) => ({ ...row, position: i + 1 }));
}
// A challenger who wins takes the challenged team's place and the two swap.
function swapChallengers(table, fixtures) {
  const wins = Object.values(fixtures || {}).filter(f => f.challenge && f.status === 'final' && f.result?.winner === 'home').sort((a, b) => a.result.approvedAt - b.result.approvedAt);
  for (const f of wins) {
    const c = table.findIndex(r => r.team.teamId === f.home), t = table.findIndex(r => r.team.teamId === f.away);
    if (c > t && t >= 0) [table[c], table[t]] = [{ ...table[t], swappedBy: f.id }, { ...table[c], swappedBy: f.id }];
  }
  return table;
}

// ---------- Challenge rule ----------
export function challengeStatus(current, tierId, teamId, now = Date.now()) {
  const rules = rulesOf(current), fixtures = current?.fixtures?.[tierId] || {}, league = Object.values(fixtures).filter(isLeague);
  const table = standings(tierTeams(current, tierId), fixtures, rules), row = table.find(r => r.team.teamId === teamId);
  const reasons = [];
  if (!rules.challengeEnabled) reasons.push('The challenge rule is turned off.');
  if (!league.length) reasons.push('The round-robin fixtures haven’t been created.');
  if (league.some(f => !f.dueBy)) reasons.push('The admin hasn’t set match dates for this tier.');
  if (!row || row.position < rules.challengerFrom || row.position > rules.challengerTo) reasons.push(`Only teams in places ${rules.challengerFrom}–${rules.challengerTo} can challenge.`);
  if (Object.values(fixtures).some(f => f.challenge && f.home === teamId)) reasons.push('Each team can use its challenge only once.');
  if (Object.values(fixtures).some(f => f.challenge && f.status !== 'final' && (f.home === teamId || f.away === teamId))) reasons.push('This team already has a challenge in progress.');
  const due = league.filter(f => (f.home === teamId || f.away === teamId) && f.dueBy && deadlineEnd(f.dueBy) < now);
  if (due.some(f => f.status !== 'final' || !onTime(f))) reasons.push('Every scheduled week so far must be completed on time.');
  const lastRound = Math.max(0, ...league.map(f => f.round || 0)), cutoff = league.find(f => f.round === lastRound - rules.challengeCutoffRounds + 1);
  if (cutoff?.startsOn && now >= Date.parse(`${cutoff.startsOn}T00:00:00Z`)) reasons.push(`Challenges close before the last ${rules.challengeCutoffRounds} weeks of the season.`);
  const targets = table.filter(r => r.position >= rules.targetFrom && r.position <= rules.targetTo && !Object.values(fixtures).some(f => f.challenge && f.status !== 'final' && (f.home === r.team.teamId || f.away === r.team.teamId)));
  return { allowed: reasons.length === 0, reasons, targets: targets.map(r => r.team.teamId), position: row?.position };
}
export function applyIssueChallenge(current, payload, uid, isAdmin = false, now = Date.now()) {
  const { tierId, challenger, target } = payload || {};
  assert(Object.hasOwn(current?.tierConfig || {}, tierId), 'Choose an existing tier.');
  assert(isAdmin || isOwner(current.registrations?.[challenger], uid), 'Only the challenging team’s captain can issue a challenge.');
  const status = challengeStatus(current, tierId, challenger, now);
  assert(status.allowed, status.reasons[0] || 'This team can’t challenge now.');
  assert(status.targets.includes(target), `Choose a team in places ${rulesOf(current).targetFrom}–${rulesOf(current).targetTo}.`);
  const state = structuredClone(current), interval = state.schedules?.[tierId]?.intervalDays || 7, id = `ch${now}`;
  state.fixtures[tierId][id] = { id, tierId, challenge: true, label: 'Challenge', format: 'rr', home: challenger, away: target, status: 'scheduled', issuedAt: now, startsOn: toDay(now), dueBy: addDays(toDay(now), interval - 1) };
  return { state, result: { fixtureId: id } };
}

// ---------- Team management ----------
const fixturesWith = (state, teamId) => Object.values(state.fixtures || {}).flatMap(t => Object.values(t || {})).filter(f => f.home === teamId || f.away === teamId);
function placeTeam(state, record) {
  for (const tier of Object.values(state.tiers || {})) if (tier.teams) delete tier.teams[record.teamId];
  for (const tierId of record.listedTiers) { state.tiers[tierId] ||= { teams: {} }; state.tiers[tierId].teams ||= {}; state.tiers[tierId].teams[record.teamId] = publicRecord(record, state.settings); }
}
// The admin can always edit; a captain only until fixtures exist for the team.
export function applyUpdateTeam(current, payload, uid, isAdmin = false) {
  const previous = current?.registrations?.[payload?.teamId];
  assert(previous, 'That team no longer exists.');
  assert(isAdmin || isOwner(previous, uid), 'Only this team’s captain or the admin can edit it.');
  const scheduled = fixturesWith(current, previous.teamId);
  assert(isAdmin || !scheduled.length, 'Fixtures are already scheduled. Ask the admin to edit the team.');
  const { teamId, captain, ace1, ace2, selectedTier } = payload;
  const phones = Object.fromEntries(['whatsappPhone', 'ace1Phone', 'ace2Phone'].filter(key => Object.hasOwn(payload, key)).map(key => [key, payload[key]]));
  const team = validateRegistration({ teamId, captain, ace1, ace2, selectedTier, ...phones, consent: true, rulesAccepted: true }, { ...current.settings, registrationEnabled: true }, current.tierConfig || {}, rulesOf(current).utrGapLimit);
  assert(!scheduled.length || JSON.stringify(team.listedTiers) === JSON.stringify(previous.listedTiers || [previous.assignedTier]), 'This change moves the team to another tier, but it already has fixtures. Withdraw it or regenerate the fixtures first.');
  const state = structuredClone(current), record = { ...previous, ...team };
  state.registrations[teamId] = record;
  placeTeam(state, record);
  return { state, result: { teamId, listedTiers: record.listedTiers, combinedUtr: record.combinedUtr } };
}
// Withdrawing removes the team and its unplayed fixtures; its finished results stop counting.
export function applyWithdrawTeam(current, payload, uid, isAdmin = false, now = Date.now()) {
  const previous = current?.registrations?.[payload?.teamId];
  assert(previous, 'That team no longer exists.');
  assert(isAdmin || isOwner(previous, uid), 'Only this team’s captain or the admin can withdraw it.');
  const scheduled = fixturesWith(current, previous.teamId);
  assert(isAdmin || !scheduled.length, 'Fixtures are already scheduled. Ask the admin to withdraw the team.');
  assert(!scheduled.some(f => f.stage && f.status !== 'final'), 'This team is in the playoffs. Recreate the playoffs without it first.');
  const state = structuredClone(current), teamId = previous.teamId;
  delete state.registrations[teamId];
  state.withdrawn ||= {}; state.withdrawn[teamId] = { ...previous, withdrawnAt: now };
  for (const tier of Object.values(state.tiers || {})) if (tier.teams) delete tier.teams[teamId];
  for (const owned of Object.values(state.teamsByOwner || {})) delete owned[teamId];
  for (const tier of Object.values(state.fixtures || {})) for (const f of Object.values(tier || {})) if ((f.home === teamId || f.away === teamId) && f.status !== 'final' && !f.stage) delete tier[f.id];
  return { state, result: { teamId, removedFixtures: scheduled.filter(f => f.status !== 'final' && !f.stage).length } };
}
// A captain on a new device proves ownership with the captain code (hashed by the caller).
export function applyClaimTeam(current, payload, uid) {
  const record = current?.registrations?.[payload?.teamId];
  assert(typeof uid === 'string' && uid, 'Sign in before claiming a team.');
  assert(record && record.recoveryHash && typeof payload.codeHash === 'string' && payload.codeHash === record.recoveryHash, 'That captain code doesn’t match this team.');
  const state = structuredClone(current), target = state.registrations[record.teamId];
  target.owners ||= {}; target.owners[uid] = true;
  state.teamsByOwner ||= {}; state.teamsByOwner[uid] ||= {}; state.teamsByOwner[uid][record.teamId] = true;
  return { state, result: { teamId: record.teamId } };
}
// The admin issues a fresh captain code (the caller generates it and passes its hash).
export function applyResetCaptainCode(current, payload) {
  const record = current?.registrations?.[payload?.teamId];
  assert(record, 'That team no longer exists.');
  assert(typeof payload.codeHash === 'string' && /^[a-f0-9]{64}$/.test(payload.codeHash), 'Invalid captain code.');
  const state = structuredClone(current);
  state.registrations[record.teamId].recoveryHash = payload.codeHash;
  return { state, result: { teamId: record.teamId } };
}
export const playoffSpots = (teamCount, rules = DEFAULT_LEAGUE_RULES) => Math.min(teamCount, teamCount > rules.playoffThreshold ? rules.playoffSpotsLarge : rules.playoffSpotsSmall);

// ---------- Player ratings ----------
// A Triace rating starts at the player's counted UTR and moves after every final match that has a
// lineup, by how the share of games won compares with what the rating gap predicted. Doubles use
// the pair's average; both partners move by the same amount. Ratings are in UTR units (e.g. 6.42).
const K = { singles: 0.3, doubles: 0.24, tiebreak: 0.12 }, SPREAD = 0.75;
export const playerId = (teamId, role) => `${teamId}:${role}`;
export function gameShare(score) {
  const sets = [...String(score || '').replace(/\([^)]*\)/g, '').matchAll(/(\d+)\s*[-–]\s*(\d+)/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (!sets.length) return 0.65;
  let won = 0, lost = 0;
  // Scores are written from the winner's side; a match tiebreak (to 10) counts as one game.
  for (const [a, b] of sets) { if (Math.max(a, b) >= 10) { won += a > b ? 1 : 0; lost += a > b ? 0 : 1; } else { won += a; lost += b; } }
  return won + lost ? Math.max(0.5, won / (won + lost)) : 0.65;
}
const expected = (mine, theirs) => 1 / (1 + Math.exp(-(mine - theirs) / SPREAD));

export function playerRatings(teams, fixturesByTier) {
  const players = new Map();
  for (const team of teams) {
    const starts = { captain: team.captainUtr, ace1: team.ace1Utr, ace2: team.ace2Utr };
    for (const role of ROLES) {
      const id = playerId(team.teamId, role), start = (starts[role] || 0) / 100;
      players.set(id, { id, teamId: team.teamId, role, start, rating: start, wins: 0, losses: 0, singles: { wins: 0, losses: 0 }, doubles: { wins: 0, losses: 0 }, history: [] });
    }
  }
  const finals = Object.values(fixturesByTier || {}).flatMap(tier => Object.values(tier || {}))
    .filter(f => f.status === 'final' && f.result?.lineups)
    .sort((a, b) => a.result.approvedAt - b.result.approvedAt || (a.round || 99) - (b.round || 99));
  for (const f of finals) {
    const sides = { home: matchPlayers(f, 'home'), away: matchPlayers(f, 'away') };
    formatOf(f).forEach((format, i) => {
      const m = f.result.matches[i];
      if (!m?.winner) return;
      const ids = side => (sides[side][format.key] || []).map(role => playerId(f[side], role)).filter(id => players.has(id));
      const winners = ids(m.winner), losers = ids(m.winner === 'home' ? 'away' : 'home');
      if (!winners.length || !losers.length) return;
      const avg = list => list.reduce((s, id) => s + players.get(id).rating, 0) / list.length;
      const type = format.key === 'd3' ? 'tiebreak' : winners.length === 1 ? 'singles' : 'doubles';
      const delta = K[type] * (gameShare(m.score) - expected(avg(winners), avg(losers)));
      const record = (list, won, opponents) => list.forEach(id => {
        const p = players.get(id), change = won ? delta : -delta;
        p.rating = Math.max(0.01, p.rating + change);
        won ? p.wins++ : p.losses++;
        const bucket = type === 'singles' ? p.singles : p.doubles;
        won ? bucket.wins++ : bucket.losses++;
        p.history.push({ fixtureId: f.id, tierId: f.tierId, round: f.round, stage: f.label || null, match: format.label, won, score: m.score, partner: list.find(x => x !== id) || null, opponents, change, after: p.rating, at: f.result.approvedAt });
      });
      record(winners, true, losers);
      record(losers, false, winners);
    });
  }
  return players;
}

// ---------- Singles minimum ----------
// Every player must play singles on at least the configured share of the team's scheduled
// round-robin match days, rounded down. Counted from final results that include a lineup.
export function singlesEligibility(teamId, tierFixtures, rules = DEFAULT_LEAGUE_RULES) {
  const mine = Object.values(tierFixtures || {}).filter(f => isLeague(f) && (f.home === teamId || f.away === teamId));
  const required = Math.floor((mine.length * rules.singlesMinPercent) / 100);
  const days = Object.fromEntries(ROLES.map(r => [r, 0]));
  let recorded = 0;
  for (const f of mine.filter(f => f.status === 'final')) {
    const players = matchPlayers(f, f.home === teamId ? 'home' : 'away');
    if (!players) continue;
    recorded++;
    for (const role of players.s || []) days[role]++;
  }
  const left = mine.length - mine.filter(f => f.status === 'final').length;
  return {
    matchDays: mine.length, required, recorded, left,
    players: Object.fromEntries(ROLES.map(r => [r, { days: days[r], met: days[r] >= required, possible: days[r] + left >= required }]))
  };
}

// ---------- Seasons ----------
// Closing a season stores a public snapshot (teams, fixtures, standings inputs, champions) and a
// private copy of the registrations, then clears the season so registration can start again.
export function applyManageSeason(current, payload, now = Date.now()) {
  assert(current?.settings, 'Save the initial tournament configuration first.');
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  assert(name.length > 0 && name.length <= 60, 'Season names need 1–60 characters.');
  const state = structuredClone(current), season = state.season || { name: DEFAULT_SEASON_NAME, startedAt: null };
  if (payload.action === 'rename') {
    state.season = { ...season, name };
    return { state, result: { season: state.season } };
  }
  assert(payload.action === 'archive', 'Unknown season action.');
  assert(payload.confirm === season.name, `Type the current season name, “${season.name}”, to confirm.`);
  const id = `s${now}`, champions = {};
  for (const [tierId, fixtures] of Object.entries(state.fixtures || {})) {
    const final = fixtures['po-final'];
    if (final?.status === 'final') champions[tierId] = { winner: final[final.result.winner], runnerUp: final[final.result.winner === 'home' ? 'away' : 'home'] };
  }
  state.seasons ||= {};
  state.seasons[id] = { id, name: season.name, startedAt: season.startedAt || null, archivedAt: now, tierConfig: state.tierConfig || {}, leagueRules: rulesOf(state), tiers: state.tiers || {}, fixtures: state.fixtures || {}, champions };
  state.archive ||= {};
  state.archive[id] = { registrations: state.registrations || {} };
  state.registrations = {}; state.tiers = {}; state.fixtures = {}; state.teamsByOwner = {};
  state.season = { name, startedAt: now };
  return { state, result: { archived: id, season: state.season } };
}
