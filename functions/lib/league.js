// League play: round-robin fixtures, playoffs, captain score submissions with admin approval,
// standings and player ratings. Like tournament.js, every apply* function takes the whole
// tournament state and returns { state, result }.
import { ValidationError, DEFAULT_LEAGUE_RULES, DEFAULT_SEASON_NAME, rulesOf } from './tournament.js';

export const ROLES = ['captain', 'ace1', 'ace2'];
export const ROLE_LABELS = { captain: 'Captain', ace1: 'Ace 1', ace2: 'Ace 2' };
// Who plays each match follows from two choices per team: the Doubles 1 pair and the Doubles 2 partner.
// "third" sat out Doubles 1; "leftOut" is the Doubles 1 player who sits out Doubles 2.
export const FORMATS = {
  rr: [
    { key: 'd1', label: 'Doubles 1', players: l => l.d1 },
    { key: 'd2', label: 'Doubles 2', players: l => [l.third, l.d2Partner] },
    { key: 's', label: 'Singles', players: l => [l.leftOut] }
  ],
  po: [
    { key: 'd1', label: 'Doubles 1', players: l => l.d1 },
    { key: 's1', label: 'Singles 1', players: l => [l.third] },
    { key: 'd2', label: 'Doubles 2', players: l => [l.third, l.d2Partner] },
    { key: 's2', label: 'Singles 2', players: l => [l.leftOut] },
    { key: 'stb', label: 'Super tiebreak', players: l => [l.third, l.leftOut] }
  ]
};
export const MATCHES = FORMATS.rr;
export const POINTS_PER_WIN = DEFAULT_LEAGUE_RULES.pointsPerWin;
const SCORE_PATTERN = /^[0-9 ()\-–/,]{0,40}$/;
const formatOf = fixture => FORMATS[fixture.format || 'rr'];

function assert(condition, message) { if (!condition) throw new ValidationError(message); }
const tierTeams = (state, tierId) => Object.values(state.tiers?.[tierId]?.teams || {});
const isLeague = fixture => !fixture.stage;

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
  return { state, result: { tierId, fixtures: Object.keys(state.fixtures[tierId]).length, rounds: Math.max(0, teams.length - 1 + (teams.length % 2)) } };
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

function validMatches(fixture, matches) {
  const format = formatOf(fixture), playoff = fixture.format === 'po';
  assert(Array.isArray(matches) && matches.length === format.length, `Enter a result for ${format.map(m => m.label).join(', ')}.`);
  const wins = { home: 0, away: 0 };
  return format.map(({ key, label }, i) => {
    const m = matches[i];
    assert(m && m.key === key, `Results must be in the order ${format.map(x => x.label).join(', ')}.`);
    const decided = playoff && (wins.home === 3 || wins.away === 3);
    if (decided) { assert(!m.winner, `${label} is not played once a team has won three matches.`); return { key, winner: '', score: '' }; }
    if (playoff && key === 'stb') assert(wins.home === 2 && wins.away === 2, 'The super tiebreak is only played at 2–2.');
    assert(m.winner === 'home' || m.winner === 'away', `Choose the winner of ${label}.`);
    const score = typeof m.score === 'string' ? m.score.trim() : '';
    assert(SCORE_PATTERN.test(score), `${label}: the score can only contain numbers, spaces and - ( ) / , characters.`);
    wins[m.winner]++;
    return { key, winner: m.winner, score };
  });
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
  const owns = id => current.registrations?.[id]?.ownerUid === uid;
  const side = owns(fixture.home) ? 'home' : owns(fixture.away) ? 'away' : null;
  assert(isAdmin || side, 'Only the captains of these two teams can submit this score.');
  assert(isAdmin || fixture.status !== 'final', 'This result is final. Ask the admin to correct it.');
  const matches = validMatches(fixture, payload.matches), lineups = validLineups(payload.lineups);
  const entry = { matches, winner: encounterWinner(matches), ...(lineups ? { lineups } : {}) };
  const state = structuredClone(current), fixtures = state.fixtures[payload.tierId], target = fixtures[payload.fixtureId];
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
  }
  delete target.submission;
  advancePlayoffs(fixtures);
  return { state, result: { status: target.status } };
}

// Standings from final round-robin results: points per encounter win (admin setting, default 2);
// ties break on match difference, then matches won, then combined UTR.
export function standings(teams, fixtures, rules = DEFAULT_LEAGUE_RULES) {
  const rows = new Map(teams.map(t => [t.teamId, { team: t, played: 0, won: 0, lost: 0, matchesWon: 0, matchesLost: 0, points: 0, form: [] }]));
  const finals = Object.values(fixtures || {}).filter(f => isLeague(f) && f.status === 'final' && f.result).sort((a, b) => a.round - b.round || a.result.approvedAt - b.result.approvedAt);
  for (const f of finals) {
    const home = rows.get(f.home), away = rows.get(f.away);
    if (!home || !away) continue;
    const homeMatches = f.result.matches.filter(m => m.winner === 'home').length, awayMatches = f.result.matches.filter(m => m.winner === 'away').length;
    for (const [row, won, mine, theirs] of [[home, f.result.winner === 'home', homeMatches, awayMatches], [away, f.result.winner === 'away', awayMatches, homeMatches]]) {
      row.played++; row.matchesWon += mine; row.matchesLost += theirs;
      if (won) { row.won++; row.points += rules.pointsPerWin; } else row.lost++;
      row.form.push(won ? 'W' : 'L');
    }
  }
  return [...rows.values()]
    .map(row => ({ ...row, form: row.form.slice(-5) }))
    .sort((a, b) => b.points - a.points || (b.matchesWon - b.matchesLost) - (a.matchesWon - a.matchesLost) || b.matchesWon - a.matchesWon || b.team.combinedUtr - a.team.combinedUtr)
    .map((row, i) => ({ ...row, position: i + 1 }));
}
export const playoffSpots = (teamCount, rules = DEFAULT_LEAGUE_RULES) => Math.min(teamCount, teamCount > rules.playoffThreshold ? rules.playoffSpotsLarge : rules.playoffSpotsSmall);

// ---------- Player ratings ----------
// A Triace rating starts at the player's counted UTR and moves after every final match that has a
// lineup, by how the share of games won compares with what the rating gap predicted. Doubles use
// the pair's average; both partners move by the same amount. Ratings are in UTR units (e.g. 6.42).
const K = { singles: 0.3, doubles: 0.24, tiebreak: 0.12 }, SPREAD = 0.75;
export const playerId = (teamId, role) => `${teamId}:${role}`;
export function gameShare(score) {
  const sets = [...String(score || '').matchAll(/(\d+)\s*[-–]\s*(\d+)/g)].map(m => [Number(m[1]), Number(m[2])]);
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
      const type = format.key === 'stb' ? 'tiebreak' : winners.length === 1 ? 'singles' : 'doubles';
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
