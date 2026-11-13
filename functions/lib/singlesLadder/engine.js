// Singles Ladder policy. One pure function, applyLadder(state, payload, actor, ctx), runs inside a database transaction
// on the `ladder` node (Cloud Function) or the local demo server. The browser never supplies ranks, roles, names,
// points or the time: `actor` comes from the verified sign-in, `ctx.now`/`ctx.id` are fixed once per request so a
// retried transaction computes the same result.
//
// state = { index: { current, seasons: { [id]: { name, status, createdAt, activatedAt, closedAt } } },
//           public:  { [seasonId]: { rules, rulesHistory, players, challenges, points, penalties } },
//           private: { [seasonId]: { requests: { [playerId]: {...} }, notifications: { [playerId]: {...} } } },
//           audit: { [id]: entry }, accounts: { [uid]: playerId }, ops: { [opId]: at } }
import { ValidationError } from '../tournament.js';
import { RULES_SCHEMA, DEFAULT_RULES, REQUEST_CATEGORIES, validateRules, diffRules, completeRules, inChallengeRange } from './config.js';
import { nextDeadline } from './time.js';

const DAY = 86400000, HOUR = 3600000;
export const ACTIVE_STATUSES = ['pending', 'accepted', 'submitted', 'disputed'];
const PLAYER_ACTIONS = ['challenge', 'respond', 'withdraw', 'submit', 'confirm', 'dispute', 'request'];
const ORGANIZER_ACTIONS = ['createSeason', 'setStatus', 'saveRules', 'enroll', 'syncPlayers', 'seed', 'adjust', 'link', 'unlink', 'resolve', 'voidResult', 'cancel', 'decideRequest', 'grant', 'decidePenalty', 'sweep'];
// Every organizer action needs a reason; only the automatic time-based sweep has none.
const NEEDS_REASON = ORGANIZER_ACTIONS.filter(a => a !== 'sweep');

const check = (ok, message) => { if (!ok) throw new ValidationError(message); };
export const isKey = value => typeof value === 'string' && !['__proto__', 'prototype', 'constructor'].includes(value) && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const text = (value, min, max, message) => { check(typeof value === 'string' && value.trim().length >= min && value.length <= max, message); return value.trim(); };
const isActive = c => ACTIVE_STATUSES.includes(c.status);
const involves = (c, playerId) => c.challengerId === playerId || c.opponentId === playerId;
const other = (c, playerId) => (c.challengerId === playerId ? c.opponentId : c.challengerId);

// Best of three from the challenger's side: sets to 6 (7-5, or 7-6 after the tiebreak at 6-6). At one set all the
// season's match format decides: a 10-point match tiebreak ("6-4 3-6 10-8"), a full third set, or either.
export function validateScore(score, winnerIsChallenger, thirdSet = 'matchTiebreak') {
  check(typeof score === 'string' && score.length <= 80 && /^\d{1,2}-\d{1,2}(?:[ ,]+\d{1,2}-\d{1,2}){1,2}$/.test(score.trim()), 'Enter the score from the challenger’s side, such as 6-4 6-3.');
  let a = 0, b = 0;
  score.trim().split(/[ ,]+/).map(set => set.split('-').map(Number)).forEach(([x, y], i) => {
    check(a < 2 && b < 2, 'The score has sets after the match ended.');
    const hi = Math.max(x, y), lo = Math.min(x, y);
    const set = (hi === 6 && lo <= 4) || (hi === 7 && [5, 6].includes(lo)), tiebreak = (hi === 10 && lo <= 8) || (hi > 10 && hi - lo === 2);
    if (i < 2) check(set, 'That is not a valid tennis set score.');
    else check(thirdSet === 'fullSet' ? set : thirdSet === 'either' ? set || tiebreak : tiebreak, thirdSet === 'fullSet' ? 'At one set all this season plays a full third set.' : thirdSet === 'either' ? 'That is not a valid third set or match tiebreak.' : 'At one set all the match is decided by a 10-point match tiebreak, such as 10-8.');
    if (x > y) a++; else b++;
  });
  check(winnerIsChallenger ? a === 2 : b === 2, 'The winner must match the score (challenger’s games first).');
}

const ranksOf = season => Object.fromEntries(Object.entries(season.players || {}).map(([id, p]) => [id, p.rank]));
const rankChanges = (before, season) => Object.entries(season.players || {}).filter(([id, p]) => before[id] !== undefined && before[id] !== p.rank).map(([id, p]) => ({ playerId: id, from: before[id], to: p.rank })).sort((x, y) => x.to - y.to);
// Moves one player to a position; everyone between shifts by one so positions stay 1..n with no gaps.
function moveTo(season, playerId, target) {
  const players = Object.values(season.players), me = season.players[playerId], from = me.rank;
  target = Math.min(players.length, Math.max(1, target));
  for (const p of players) {
    if (p === me) continue;
    if (target < from && p.rank >= target && p.rank < from) p.rank++;
    if (target > from && p.rank > from && p.rank <= target) p.rank--;
  }
  me.rank = target;
}

export function applyLadder(current, payload, actor, ctx) {
  check(payload && typeof payload === 'object' && !Array.isArray(payload), 'Invalid request.');
  check(actor && isKey(actor.uid), 'Sign in to continue.');
  const state = structuredClone(current || {}), { now } = ctx, { action } = payload;
  state.index ||= {}; state.index.seasons ||= {}; state.public ||= {}; state.private ||= {}; state.audit ||= {}; state.accounts ||= {}; state.ops ||= {};
  check(PLAYER_ACTIONS.includes(action) || ORGANIZER_ACTIONS.includes(action), 'Unknown action.');
  const organizer = ORGANIZER_ACTIONS.includes(action), system = actor.system === true;
  // Security controls (never configurable): organizer actions need the verified admin role.
  if (organizer) check(actor.admin === true || (system && action === 'sweep'), 'Organizer access is required.');
  // A retried request (same opId) is answered again without being applied twice.
  if (payload.opId !== undefined) {
    check(isKey(payload.opId), 'Invalid request id.');
    if (state.ops[payload.opId]) return { state, result: { ok: true, duplicate: true } };
    state.ops[payload.opId] = now;
  }
  let n = 0;
  const newId = () => (n++ ? `${ctx.id}_${n - 1}` : ctx.id);
  const me = state.accounts[actor.uid] || null;
  const reason = NEEDS_REASON.includes(action) ? text(payload.reason, 3, 500, 'Give a reason (3 to 500 characters). It is kept in the audit log.') : (organizer && typeof payload.reason === 'string' ? payload.reason.trim().slice(0, 500) : null);   // a player's own reason is private and never audited

  // ----- shared helpers -----
  let seasonId = null, season = null, meta = null, hidden = null;
  function open(id) {
    check(isKey(id) && state.index.seasons[id], 'Choose a season.');
    seasonId = id; meta = state.index.seasons[id]; season = state.public[id] ||= {}; hidden = state.private[id] ||= {};
    for (const key of ['players', 'challenges', 'points', 'penalties', 'rulesHistory']) season[key] ||= {};
    hidden.requests ||= {}; hidden.notifications ||= {};
    if (season.rules?.values) season.rules.values = completeRules(season.rules.values);
    check(meta.status !== 'closed', 'This season is closed. Its records can no longer change.');
  }
  const role = () => (system ? 'system' : organizer ? 'organizer' : 'player');
  function audit(entry, as = role()) {
    state.audit[newId()] = { at: now, seasonId, action, actor: as === 'system' ? { role: 'system' } : { role: as, uid: actor.uid, ...(me ? { playerId: me } : {}) }, reason: reason || null, ...entry };
  }
  function notify(playerId, type, message, challengeId) {
    if (!season.players[playerId]) return;
    (hidden.notifications[playerId] ||= {})[newId()] = { at: now, type, text: message, ...(challengeId ? { challengeId } : {}) };
  }
  const player = id => { check(isKey(id) && season.players[id], 'Choose a player on this ladder.'); return season.players[id]; };
  const name = id => season.players[id]?.name || 'A player';
  function award(playerId, amount, type, extra = {}) {
    season.players[playerId].points += amount;
    season.points[newId()] = { playerId, amount, type, at: now, ...extra };
  }
  const touch = (...ids) => ids.forEach(id => { season.players[id].lastActiveAt = now; });
  const exempt = p => p.exemptUntil > now && (p.exemptFrom || 0) <= now;

  function createPenalty(type, playerId, policy, rulesVersion, auto, extra = {}) {
    const id = newId(), before = ranksOf(season);
    season.penalties[id] = { type, playerId, positions: policy.dropPositions, status: 'pending', createdAt: now, rulesVersion, policy: structuredClone(policy), ...extra };
    if (auto) settlePenalty(id, true, 'system');
    else notify(playerId, 'penalty', `A ${policy.dropPositions}-position drop for ${type === 'decline' ? 'declined challenges' : 'inactivity'} is waiting for an organizer’s decision.`);
    audit({ action: auto ? 'system.penaltyApplied' : 'system.penaltyPending', reason: null, target: { playerId, penaltyId: id }, rankChanges: rankChanges(before, season) }, 'system');
  }
  function settlePenalty(id, apply, by) {
    const penalty = season.penalties[id], p = season.players[penalty.playerId];
    penalty.status = apply ? 'applied' : 'waived'; penalty.decidedAt = now; penalty.decidedBy = by;
    if (penalty.type === 'inactivity') p.lastInactivityAt = now;           // the clock restarts either way
    if (!apply) return notify(penalty.playerId, 'penalty', 'An organizer waived your pending position drop.');
    moveTo(season, penalty.playerId, p.rank + penalty.positions);
    if (penalty.type === 'decline' && penalty.policy.resetAfterDrop) p.declinesResetAt = now;
    notify(penalty.playerId, 'penalty', `You moved down ${penalty.positions} position${penalty.positions === 1 ? '' : 's'} for ${penalty.type === 'decline' ? 'declined challenges' : 'inactivity'}.`);
  }
  function validDeclines(playerId, v) {
    const since = Math.max(season.players[playerId].declinesResetAt || 0, v.decline.counting === 'rolling' ? now - v.decline.rollingDays * DAY : 0);
    return Object.values(season.challenges).filter(c => c.opponentId === playerId && c.status === 'declined' && c.validDecline && c.completedAt > since).length;
  }
  // The challenged player said no (or, when configured, did not answer). Uses the rules kept with the challenge.
  function decline(id, c, unanswered) {
    const v = c.rules.values, who = c.opponentId;
    c.status = 'declined'; c.completedAt = now; if (unanswered) c.unanswered = true;
    c.validDecline = v.decline.enabled && (v.decline.countDownward || c.ranks.challenger > c.ranks.opponent);
    notify(c.challengerId, 'declined', `${name(who)} ${unanswered ? 'did not answer' : 'declined'} your challenge.`, id);
    if (!c.validDecline) return;
    const count = validDeclines(who, v);
    if (count > v.decline.free && v.decline.penaltyPoints > 0) award(who, -v.decline.penaltyPoints, 'declinePenalty', { challengeId: id, rulesVersion: c.rules.version });
    const waiting = Object.values(season.penalties).some(x => x.playerId === who && x.type === 'decline' && x.status === 'pending');
    if (v.decline.dropThreshold > 0 && count >= v.decline.dropThreshold && !waiting) createPenalty('decline', who, v.decline, c.rules.version, v.decline.review === 'auto', { challengeId: id });
  }
  // Points, bonuses, streaks and positions for a finished match, decided by the rules kept with the challenge.
  function finalize(id, c, kind) {
    const v = c.rules.values, winnerId = c.result.winnerId, loserId = other(c, winnerId), winner = season.players[winnerId], loser = season.players[loserId];
    const challengerWon = winnerId === c.challengerId, played = kind === 'played';
    const due = c.extensionUntil || c.deadline || null, reportedAt = c.result.submittedAt;
    const late = due !== null && reportedAt > due, extended = !late && !!c.extensionUntil && reportedAt > c.deadline;
    const bonusOk = (played || v.points.walkoverBonuses) && (late ? v.late.allowBonuses : extended ? v.extension.allowBonuses : true);
    const moveOk = v.swap.enabled && (played || v.points.walkoverSwap) && (late ? v.late.allowSwap : extended ? v.extension.allowSwap : true);
    const ranksBefore = { [winnerId]: winner.rank, [loserId]: loser.rank }, tag = { challengeId: id, rulesVersion: c.rules.version }, bonuses = [];
    const startPoints = { [winnerId]: winner.points, [loserId]: loser.points };
    award(winnerId, played ? v.points.win : v.points.walkoverWin, played ? 'win' : 'walkoverWin', tag);
    award(loserId, played ? v.points.loss : kind === 'noShow' ? v.noShow.points : v.points.walkoverLoss, played ? 'loss' : kind === 'noShow' ? 'noShow' : 'walkoverLoss', tag);
    if (bonusOk) {
      const bonus = challengerWon ? 'challengeBonus' : 'defenseBonus';
      if (v.points[bonus] > 0) { award(winnerId, v.points[bonus], bonus, tag); bonuses.push(bonus); }
      const gap = (challengerWon ? c.ranks.challenger - c.ranks.opponent : c.ranks.opponent - c.ranks.challenger);   // positions when the challenge was sent
      if (v.points.upsetBonus > 0 && gap >= v.points.upsetMinGap && gap <= v.points.upsetMaxGap) { award(winnerId, v.points.upsetBonus, 'upsetBonus', tag); bonuses.push('upsetBonus'); }
    }
    let moved = false;
    if (moveOk && winner.rank > loser.rank && (challengerWon || v.swap.lowerDefenderWin === 'move')) {
      moved = true;
      if (v.swap.mode === 'swap') [winner.rank, loser.rank] = [loser.rank, winner.rank];
      else moveTo(season, winnerId, loser.rank);
    }
    winner.streak = (winner.streak || 0) + 1; loser.streak = 0;
    winner.wins = (winner.wins || 0) + 1; loser.losses = (loser.losses || 0) + 1;
    if (played) winner.verified = loser.verified = true;                     // they have now played a PPRC match
    touch(...(played ? [winnerId, loserId] : [winnerId]));
    c.status = 'completed'; c.completedAt = now; c.result.kind = kind;
    c.outcome = { late, extended, moved, bonuses, points: { [winnerId]: winner.points - startPoints[winnerId], [loserId]: loser.points - startPoints[loserId] }, ranksBefore, ranksAfter: { [winnerId]: winner.rank, [loserId]: loser.rank } };
    notify(winnerId, 'result', `Result confirmed: you beat ${loser.name}${moved ? ` and moved to #${winner.rank}` : ''}.`, id);
    notify(loserId, 'result', `Result confirmed: ${winner.name} won${moved ? `; you are now #${loser.rank}` : ''}.`, id);
  }
  // Time-based rules. Runs before every action on an active season and from the hourly scheduled function.
  function sweep() {
    if (meta.status !== 'active') return;
    for (const [id, c] of Object.entries(season.challenges)) {
      if (c.status !== 'pending' || now <= c.respondBy) continue;
      const before = ranksOf(season), mode = c.rules.values.response.onExpire;
      if (mode === 'decline') decline(id, c, true);
      else if (mode === 'walkover') { c.result = { winnerId: c.challengerId, kind: 'walkover', submittedBy: 'system', submittedAt: now }; c.unanswered = true; finalize(id, c, 'walkover'); }
      else { c.status = 'expired'; c.completedAt = now; notify(c.challengerId, 'expired', `${name(c.opponentId)} did not answer your challenge in time. It has lapsed.`, id); notify(c.opponentId, 'expired', `You did not answer ${name(c.challengerId)}’s challenge in time. It has lapsed.`, id); }
      audit({ action: 'system.unanswered', reason: null, target: { challengeId: id }, after: { status: c.status }, rankChanges: rankChanges(before, season) }, 'system');
    }
    for (const [op, at] of Object.entries(state.ops)) if (now - at > 7 * DAY) delete state.ops[op];
    const v = season.rules.values;
    if (!v.inactivity.enabled) return;
    for (const [id, p] of Object.entries(season.players)) {
      if (!p.eligible || exempt(p)) continue;
      const penalties = Object.values(season.penalties).filter(x => x.playerId === id && x.type === 'inactivity');
      if (penalties.some(x => x.status === 'pending') || (v.inactivity.repeat === 'once' && penalties.some(x => x.status === 'applied'))) continue;
      const since = Math.max(p.lastActiveAt || 0, p.joinedAt || 0, meta.activatedAt || 0, p.lastInactivityAt || 0, p.exemptUntil || 0);
      if (now - since >= v.inactivity.days * DAY) createPenalty('inactivity', id, v.inactivity, season.rules.version, v.inactivity.review === 'auto', { inactiveSince: since });
    }
  }
  function challengeOf(id) { check(isKey(id) && season.challenges[id], 'That challenge was not found.'); return season.challenges[id]; }
  // Approves an exemption or an extension (from a request or granted directly).
  function grant(type, target, until, from) {
    check(Number.isSafeInteger(until) && until > now, 'Choose an end time in the future.');
    if (type === 'exemption') {
      check(until <= now + 365 * DAY, 'An exemption can last at most a year.');
      check(from === undefined || from === null || (Number.isSafeInteger(from) && from < until), 'The exemption must start before it ends.');
      const p = player(target); p.exemptFrom = Math.max(now, from || 0); p.exemptUntil = until;
      notify(target, 'exemption', 'Your exemption was approved.');
    } else {
      const c = challengeOf(target), v = c.rules.values;
      check(c.status === 'accepted' && c.deadline, 'Only an accepted match that is still to be played can be extended.');
      check(until > c.deadline && until <= c.deadline + v.extension.maxDays * DAY, `An extension must end after the deadline and within ${v.extension.maxDays} days of it.`);
      c.extensionUntil = until;
      for (const id of [c.challengerId, c.opponentId]) notify(id, 'extension', 'The deadline for your match was extended.', target);
    }
  }

  // ----- season-independent organizer actions -----
  if (action === 'createSeason') {
    const id = payload.seasonId === undefined ? ctx.id : payload.seasonId;
    check(isKey(id) && !state.index.seasons[id], 'That season id is already in use.');
    const title = text(payload.name, 2, 80, 'Give the season a name (2 to 80 characters).');
    let values = DEFAULT_RULES;
    if (payload.copyRulesFrom !== undefined && payload.copyRulesFrom !== null) { check(isKey(payload.copyRulesFrom) && state.public[payload.copyRulesFrom]?.rules, 'Choose an existing season to copy rules from.'); values = state.public[payload.copyRulesFrom].rules.values; }
    const checked = validateRules(completeRules(structuredClone(values))); check(checked.ok, 'The copied rules are not valid for this version. Review them first.');
    state.index.seasons[id] = { name: title, status: 'draft', createdAt: now };
    state.index.current ||= id;
    const rules = { schema: RULES_SCHEMA, version: 1, values: checked.values, updatedAt: now };
    state.public[id] = { rules, rulesHistory: { v1: { ...structuredClone(rules), actor: actor.uid, reason: payload.copyRulesFrom ? `Copied from season ${payload.copyRulesFrom}` : 'Initial defaults' } } };
    seasonId = id; audit({ target: { seasonId: id }, after: { name: title, status: 'draft', rulesVersion: 1 } });
    return { state, result: { ok: true, seasonId: id } };
  }
  if (action === 'link' || action === 'unlink') {
    check(isKey(payload.uid), 'Choose a sign-in account.');
    const before = state.accounts[payload.uid] || null;
    if (action === 'link') {
      check(isKey(payload.playerId), 'Choose a player.');
      check(Object.values(state.public).some(s => s.players?.[payload.playerId]), 'Enroll the player on a ladder season first.');
      check(!Object.entries(state.accounts).some(([uid, pid]) => uid !== payload.uid && pid === payload.playerId), 'That player is already linked to another account. Unlink it first.');
      state.accounts[payload.uid] = payload.playerId;
    } else { check(before, 'That account is not linked.'); delete state.accounts[payload.uid]; }
    audit({ target: { uid: payload.uid, playerId: payload.playerId || before }, before: { playerId: before }, after: { playerId: state.accounts[payload.uid] || null } });
    return { state, result: { ok: true } };
  }

  // ----- everything else works on one season -----
  open(payload.seasonId);
  if (!organizer) {
    check(meta.status === 'active', meta.status === 'frozen' ? 'The season is frozen. Standings are final until an organizer reopens it.' : 'This season is not open yet.');
    // Ownership (never configurable): the signed-in account must be linked to an enrolled player by an organizer.
    check(me && season.players[me], 'Your sign-in is not linked to a player on this ladder. Ask an organizer to verify and link your account.');
  }
  sweep();
  const result = { ok: true, seasonId };
  const before = ranksOf(season);

  if (action === 'sweep') { /* the time-based rules above are the whole action */ }
  else if (action === 'setStatus') {
    const to = payload.status, from = meta.status;
    check({ draft: ['active'], active: ['frozen', 'closed'], frozen: ['active', 'closed'] }[from]?.includes(to), `A ${from} season cannot become ${to}.`);
    if (to === 'active') {
      check(Object.keys(season.players).length >= 2, 'Enroll at least two players first.');
      check(!Object.entries(state.index.seasons).some(([id, s]) => id !== seasonId && ['active', 'frozen'].includes(s.status)), 'Close the season that is running before opening another.');
      if (from === 'draft') meta.activatedAt = now;
      state.index.current = seasonId;
    }
    if (to === 'closed') { check(!Object.values(season.challenges).some(isActive), 'Resolve or cancel every unfinished challenge before closing the season.'); meta.closedAt = now; }
    meta.status = to;
    audit({ target: { seasonId }, before: { status: from }, after: { status: to } });
  }
  else if (action === 'saveRules') {
    check(payload.baseVersion === season.rules.version, 'The rules changed since you opened them. Reload and review your changes again.');
    const checked = validateRules(payload.values);
    check(checked.ok, `These settings cannot be saved: ${Object.entries(checked.errors).map(([k, m]) => `${k}: ${m}`).join(' ')}`);
    const changes = diffRules(season.rules.values, checked.values);
    check(changes.length, 'Nothing was changed.');
    // Existing challenges keep their own snapshot; nothing already decided is recalculated.
    season.rules = { schema: RULES_SCHEMA, version: season.rules.version + 1, values: checked.values, updatedAt: now };
    season.rulesHistory[`v${season.rules.version}`] = { ...structuredClone(season.rules), actor: actor.uid, reason };
    result.version = season.rules.version;
    audit({ target: { seasonId, rulesVersion: season.rules.version }, before: Object.fromEntries(changes.map(c => [c.key.replace('.', '_'), c.before])), after: Object.fromEntries(changes.map(c => [c.key.replace('.', '_'), c.after])) });
  }
  else if (action === 'enroll') {
    check(isKey(payload.playerId) && !season.players[payload.playerId], 'That player is already on this ladder.');
    const title = text(payload.name, 1, 120, 'The player needs a name.');
    check(payload.utr === null || payload.utr === undefined || (Number.isFinite(payload.utr) && payload.utr >= 0 && payload.utr <= 16.5), 'The UTR is not valid.');
    season.players[payload.playerId] = { name: title, utr: payload.utr ?? null, rank: Object.keys(season.players).length + 1, points: 0, streak: 0, wins: 0, losses: 0, eligible: true, verified: payload.verified === true, joinedAt: now };
    audit({ target: { playerId: payload.playerId }, after: { rank: season.players[payload.playerId].rank, utr: payload.utr ?? null } });
  }
  else if (action === 'syncPlayers') {
    // Names and UTRs re-read from the PPRC master list by the server. Positions and points never change here.
    const changed = {};
    for (const [id, fresh] of Object.entries(payload.players || {})) {
      const p = season.players[id]; if (!p || !fresh) continue;
      // Verified only ever turns on here (the player has a PPRC match on record); an organizer's decision is not undone.
      const next = { name: typeof fresh.name === 'string' && fresh.name.trim() ? fresh.name.trim().slice(0, 120) : p.name, utr: Number.isFinite(fresh.utr) ? fresh.utr : p.utr, verified: p.verified === true || fresh.verified === true };
      if (next.name !== p.name || next.utr !== p.utr || next.verified !== (p.verified === true)) { changed[id] = { before: { name: p.name, utr: p.utr ?? null, verified: p.verified === true }, after: next }; Object.assign(p, next); }
    }
    result.updated = Object.keys(changed).length;
    audit({ target: { seasonId }, after: { updated: result.updated, players: changed } });
  }
  else if (action === 'seed') {
    check(meta.status === 'draft' || !Object.keys(season.challenges).length, 'Seeding from UTR is only possible before the first challenge. Adjust positions one by one instead.');
    Object.values(season.players).sort((a, b) => (b.utr ?? -1) - (a.utr ?? -1) || a.name.localeCompare(b.name)).forEach((p, i) => { p.rank = i + 1; });
    audit({ target: { seasonId }, rankChanges: rankChanges(before, season) });
  }
  else if (action === 'adjust') {
    const p = player(payload.playerId), was = { rank: p.rank, points: p.points, eligible: p.eligible, utr: p.utr ?? null, verified: p.verified === true };
    check(['rank', 'pointsDelta', 'eligible', 'markActive', 'utr', 'verified'].some(k => payload[k] !== undefined), 'Choose what to change.');
    if (payload.utr !== undefined) { check(Number.isFinite(payload.utr) && payload.utr >= 0 && payload.utr <= 16.5, 'Enter a UTR from 0 to 16.5.'); p.utr = payload.utr; }
    if (payload.verified !== undefined) { check(typeof payload.verified === 'boolean', 'Choose verified or unverified.'); p.verified = payload.verified; }
    if (payload.rank !== undefined) { check(Number.isInteger(payload.rank) && payload.rank >= 1 && payload.rank <= Object.keys(season.players).length, 'Choose a position on the ladder.'); moveTo(season, payload.playerId, payload.rank); }
    if (payload.pointsDelta !== undefined) { check(Number.isInteger(payload.pointsDelta) && payload.pointsDelta !== 0 && Math.abs(payload.pointsDelta) <= 100, 'Enter a whole number of points to add or remove.'); award(payload.playerId, payload.pointsDelta, 'adjustment', { note: reason }); }
    if (payload.eligible !== undefined) {
      check(typeof payload.eligible === 'boolean', 'Choose eligible or not eligible.');
      check(payload.eligible || !Object.values(season.challenges).some(c => isActive(c) && involves(c, payload.playerId)), 'Cancel or resolve this player’s unfinished challenges first.');
      p.eligible = payload.eligible;
    }
    if (payload.markActive === true) p.lastActiveAt = now;
    notify(payload.playerId, 'organizer', 'An organizer updated your ladder record.');
    audit({ target: { playerId: payload.playerId }, before: was, after: { rank: p.rank, points: p.points, eligible: p.eligible, utr: p.utr ?? null, verified: p.verified === true }, rankChanges: rankChanges(before, season) });
  }
  else if (action === 'resolve') {
    // Disputes, walkovers, no-shows and results the players could not finish themselves. The organizer's decision is final.
    const c = challengeOf(payload.challengeId), kind = payload.kind || c.result?.kind || 'played';
    check(['accepted', 'submitted', 'disputed'].includes(c.status), 'Only an accepted, reported or disputed match can be decided.');
    check(involves(c, payload.winnerId), 'Choose one of the two players as the winner.');
    check(['played', 'walkover', 'noShow'].includes(kind), 'Choose played, walkover or no-show.');
    const was = { status: c.status, result: c.result || null };
    if (kind === 'played') { const score = payload.score ?? c.result?.score; validateScore(score, payload.winnerId === c.challengerId, c.rules.values.match?.thirdSet); c.result = { ...c.result, score }; }
    c.result = { submittedBy: 'organizer', submittedAt: now, ...c.result, winnerId: payload.winnerId, kind };
    if (kind !== 'played') delete c.result.score;
    c.resolution = { by: actor.uid, at: now };
    finalize(payload.challengeId, c, kind);
    audit({ target: { challengeId: payload.challengeId }, before: was, after: { status: c.status, result: c.result, outcome: c.outcome }, rankChanges: rankChanges(before, season) });
  }
  else if (action === 'voidResult') {
    // A correction never rewrites history: the awarded points are reversed with new ledger lines. Positions are not
    // moved back automatically; the organizer adjusts them explicitly so every position change has its own reason.
    const c = challengeOf(payload.challengeId);
    check(c.status === 'completed', 'Only a completed match can be voided.');
    for (const entry of Object.values(season.points).filter(e => e.challengeId === payload.challengeId && e.type !== 'void')) award(entry.playerId, -entry.amount, 'void', { challengeId: payload.challengeId, note: reason });
    const winner = season.players[c.result.winnerId], loser = season.players[other(c, c.result.winnerId)];
    winner.wins = Math.max(0, (winner.wins || 0) - 1); loser.losses = Math.max(0, (loser.losses || 0) - 1);
    c.status = 'voided'; c.voided = { at: now, by: actor.uid };
    for (const id of [c.challengerId, c.opponentId]) notify(id, 'organizer', 'An organizer voided one of your results. Its points were reversed.', payload.challengeId);
    audit({ target: { challengeId: payload.challengeId }, before: { status: 'completed', outcome: c.outcome }, after: { status: 'voided' } });
  }
  else if (action === 'cancel') {
    const c = challengeOf(payload.challengeId);
    check(isActive(c), 'That challenge is already finished.');
    const was = c.status; c.status = 'cancelled'; c.completedAt = now;
    for (const id of [c.challengerId, c.opponentId]) notify(id, 'organizer', 'An organizer cancelled your challenge.', payload.challengeId);
    audit({ target: { challengeId: payload.challengeId }, before: { status: was }, after: { status: 'cancelled' } });
  }
  else if (action === 'decideRequest') {
    check(isKey(payload.playerId) && isKey(payload.requestId), 'Choose a request.');
    const request = hidden.requests[payload.playerId]?.[payload.requestId];
    check(request?.status === 'pending', 'That request has already been decided.');
    check(typeof payload.approve === 'boolean', 'Choose approve or deny.');
    if (payload.approve) grant(request.type, request.type === 'exemption' ? payload.playerId : request.challengeId, payload.until ?? request.until, request.from);
    else notify(payload.playerId, request.type, `Your ${request.type} request was not approved.`, request.challengeId);
    Object.assign(request, { status: payload.approve ? 'approved' : 'denied', decidedAt: now, decidedBy: actor.uid, ...(payload.approve ? { until: payload.until ?? request.until } : {}), ...(reason ? { note: reason } : {}) });
    audit({ target: { playerId: payload.playerId, requestId: payload.requestId, ...(request.challengeId ? { challengeId: request.challengeId } : {}) }, before: { status: 'pending' }, after: { status: request.status, type: request.type, until: request.until } });
  }
  else if (action === 'grant') {
    check(['exemption', 'extension'].includes(payload.type), 'Choose an exemption or an extension.');
    const target = payload.type === 'exemption' ? payload.playerId : payload.challengeId;
    grant(payload.type, target, payload.until, payload.from);
    const owner = payload.type === 'exemption' ? payload.playerId : season.challenges[target].challengerId;
    (hidden.requests[owner] ||= {})[newId()] = { type: payload.type, ...(payload.type === 'extension' ? { challengeId: target } : {}), until: payload.until, reason: 'Granted by an organizer', status: 'approved', createdAt: now, decidedAt: now, decidedBy: actor.uid, note: reason };
    audit({ target: payload.type === 'exemption' ? { playerId: target } : { challengeId: target }, after: { type: payload.type, until: payload.until } });
  }
  else if (action === 'decidePenalty') {
    check(isKey(payload.penaltyId) && season.penalties[payload.penaltyId]?.status === 'pending', 'That penalty has already been decided.');
    check(typeof payload.apply === 'boolean', 'Choose apply or waive.');
    settlePenalty(payload.penaltyId, payload.apply, actor.uid);
    audit({ target: { penaltyId: payload.penaltyId, playerId: season.penalties[payload.penaltyId].playerId }, before: { status: 'pending' }, after: { status: season.penalties[payload.penaltyId].status }, rankChanges: rankChanges(before, season) });
  }
  // ----- player actions (the signed-in player is `me`) -----
  else if (action === 'challenge') {
    const v = season.rules.values, a = season.players[me], b = player(payload.opponentId);
    check(payload.opponentId !== me, 'You cannot challenge yourself.');
    check(a.eligible, 'You are not eligible to challenge right now. Ask an organizer.');
    check(b.eligible, `${b.name} is not eligible for challenges right now.`);
    if (v.challenge.blockExempt) check(!exempt(a) && !exempt(b), exempt(a) ? 'You have an approved exemption. You can challenge again when it ends.' : `${b.name} has an approved exemption.`);
    check(inChallengeRange(v, a.rank, b.rank, a.streak || 0, Object.keys(season.players).length), `${b.name} is outside your challenge range.`);
    const all = Object.values(season.challenges), activeFor = id => all.filter(c => isActive(c) && involves(c, id)).length;
    check(activeFor(me) < v.challenge.activeLimit, v.challenge.activeLimit === 1 ? 'You already have an active challenge. Finish it first.' : `You already have ${v.challenge.activeLimit} active challenges.`);
    check(activeFor(payload.opponentId) < v.challenge.activeLimit, `${b.name} already has ${v.challenge.activeLimit === 1 ? 'an active challenge' : `${v.challenge.activeLimit} active challenges`}.`);
    check(!all.some(c => isActive(c) && involves(c, me) && involves(c, payload.opponentId)), `You already have a challenge with ${b.name}.`);
    if (v.rematch.enabled) {
      const last = Math.max(0, ...all.filter(c => involves(c, me) && involves(c, payload.opponentId) && c.completedAt && (c.status === 'completed' || (v.rematch.afterUnplayed && ['declined', 'expired'].includes(c.status)))).map(c => c.completedAt));
      check(now - last >= v.rematch.days * DAY, `You can challenge ${b.name} again ${v.rematch.days} days after your last challenge with them.`);
    }
    const id = newId();
    // The rules version and values travel with the challenge: later edits never change how it is judged.
    season.challenges[id] = { challengerId: me, opponentId: payload.opponentId, status: 'pending', createdAt: now, respondBy: now + v.response.hours * HOUR, ranks: { challenger: a.rank, opponent: b.rank }, rules: { version: season.rules.version, values: structuredClone(v) } };
    if (v.inactivity.activity === 'challenge') touch(me);
    notify(payload.opponentId, 'challenge', `${a.name} challenged you. Answer within ${v.response.hours} hours.`, id);
    result.challengeId = id;
    audit({ target: { challengeId: id }, after: { challengerId: me, opponentId: payload.opponentId, rulesVersion: season.rules.version } });
  }
  else if (action === 'request' && payload.type === 'exemption') {
    const why = text(payload.reason, 3, 500, 'Explain the request in 3 to 500 characters. Only organizers can read it.');
    check(Object.hasOwn(REQUEST_CATEGORIES, payload.category), 'Choose what the request is for: injury, travel, weather, court closure or scheduling.');
    check(Number.isSafeInteger(payload.until) && payload.until > now && payload.until <= now + 365 * DAY, 'Choose an end date within the next year.');
    check(payload.from === undefined || payload.from === null || (Number.isSafeInteger(payload.from) && payload.from < payload.until), 'The exemption must start before it ends.');
    check(!Object.values(hidden.requests[me] || {}).some(r => r.type === 'exemption' && r.status === 'pending'), 'You already have an exemption request waiting.');
    const id = newId();
    (hidden.requests[me] ||= {})[id] = { type: 'exemption', category: payload.category, from: payload.from ?? null, until: payload.until, reason: why, status: 'pending', createdAt: now };
    result.requestId = id; audit({ target: { playerId: me, requestId: id }, after: { type: 'exemption', until: payload.until } });
  }
  else {
    const c = challengeOf(payload.challengeId), v = c.rules.values, id = payload.challengeId;
    check(involves(c, me), 'Only the two players in this challenge can do that.');
    if (action === 'respond') {
      check(me === c.opponentId, 'Only the challenged player can answer.');
      check(c.status === 'pending', c.status === 'expired' && c.completedAt === now ? 'The time to answer this challenge has passed.' : 'This challenge has already been answered.');
      check(typeof payload.accept === 'boolean', 'Choose accept or decline.');
      if (payload.accept) {
        c.status = 'accepted'; c.acceptedAt = now; c.deadline = nextDeadline(now, v.deadline);
        if (v.inactivity.activity !== 'match') touch(c.challengerId, c.opponentId);
        notify(c.challengerId, 'accepted', `${name(me)} accepted your challenge.`, id);
      } else { decline(id, c, false); if (v.inactivity.activity === 'challenge') touch(me); }
      audit({ target: { challengeId: id }, before: { status: 'pending' }, after: { status: c.status, ...(c.deadline ? { deadline: c.deadline } : {}) }, rankChanges: rankChanges(before, season) });
    } else if (action === 'withdraw') {
      check(me === c.challengerId && c.status === 'pending', 'Only the challenger can withdraw, and only before an answer.');
      c.status = 'withdrawn'; c.completedAt = now;
      notify(c.opponentId, 'withdrawn', `${name(me)} withdrew their challenge.`, id);
      audit({ target: { challengeId: id }, before: { status: 'pending' }, after: { status: 'withdrawn' } });
    } else if (action === 'submit') {
      check(c.status === 'accepted', c.status === 'submitted' ? 'A result has already been reported for this match.' : 'Only an accepted match can be reported.');
      const kind = payload.kind || 'played';
      if (kind === 'noShow') {
        check(v.noShow.enabled, 'Ask an organizer to record a no-show.');
        c.result = { winnerId: me, kind, submittedBy: me, submittedAt: now };
        c.status = v.noShow.requireOrganizer ? 'disputed' : 'submitted'; if (v.noShow.requireOrganizer) c.review = 'noShow';
        notify(other(c, me), 'noShow', `${name(me)} reported that you did not show up. ${v.noShow.requireOrganizer ? 'An organizer will decide.' : 'Confirm or dispute it.'}`, id);
      } else {
        check(kind === 'played', 'Choose a played match or a no-show.');
        check(involves(c, payload.winnerId), 'Choose one of the two players as the winner.');
        validateScore(payload.score, payload.winnerId === c.challengerId, v.match?.thirdSet);
        c.result = { winnerId: payload.winnerId, score: payload.score.trim(), kind, submittedBy: me, submittedAt: now };
        c.status = 'submitted';
        notify(other(c, me), 'score', `${name(me)} reported ${c.result.score}. Confirm or dispute it.`, id);
      }
      audit({ target: { challengeId: id }, before: { status: 'accepted' }, after: { status: c.status, result: c.result } });
    } else if (action === 'confirm' || action === 'dispute') {
      check(c.status === 'submitted', c.status === 'completed' ? 'This result has already been confirmed.' : 'There is no reported result to answer.');
      check(me !== c.result.submittedBy, 'The other player must confirm or dispute the result.');
      if (action === 'confirm') finalize(id, c, c.result.kind);
      else { c.status = 'disputed'; c.review = 'dispute'; notify(c.result.submittedBy, 'dispute', `${name(me)} disputed the result. An organizer will decide.`, id); }
      audit({ target: { challengeId: id }, before: { status: 'submitted' }, after: { status: c.status, ...(c.outcome ? { outcome: c.outcome } : {}) }, rankChanges: rankChanges(before, season) });
    } else if (action === 'request' && payload.type === 'extension') {
      check(v.extension.enabled, 'Extensions are not available for this match.');
      check(c.status === 'accepted', 'Only an accepted match that is still to be played can be extended.');
      const why = text(payload.reason, 3, 500, 'Explain the request in 3 to 500 characters. Only organizers can read it.');
      check(Object.hasOwn(REQUEST_CATEGORIES, payload.category), 'Choose what the request is for: injury, travel, weather, court closure or scheduling.');
      check(Number.isSafeInteger(payload.until) && payload.until > Math.max(now, c.deadline) && payload.until <= c.deadline + v.extension.maxDays * DAY, `Choose a new deadline after the current one and within ${v.extension.maxDays} days of it.`);
      check(!Object.values(hidden.requests).some(list => Object.values(list).some(r => r.challengeId === id && r.status === 'pending')), 'An extension request for this match is already waiting.');
      const requestId = newId();
      (hidden.requests[me] ||= {})[requestId] = { type: 'extension', category: payload.category, challengeId: id, until: payload.until, reason: why, status: 'pending', createdAt: now };
      result.requestId = requestId; audit({ target: { playerId: me, challengeId: id, requestId }, after: { type: 'extension', until: payload.until } });
    } else check(false, 'Choose an exemption or an extension.');
  }
  return { state, result };
}
