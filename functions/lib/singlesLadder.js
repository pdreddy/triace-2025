// All policy runs in a callable transaction. Browser inputs never supply ranks, roles or time.
import { ValidationError } from './tournament.js';
const DAY = 86400000;
const check = (ok, message) => { if (!ok) throw new ValidationError(message); };
const key = value => typeof value === 'string' && !['__proto__', 'prototype', 'constructor'].includes(value) && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function validateScore(score, winnerIsChallenger) {
  check(typeof score === 'string' && score.length <= 80 && /^\d{1,2}-\d{1,2}(?:[ ,]+\d{1,2}-\d{1,2}){1,2}$/.test(score), 'Enter a best-of-three score from the challenger’s side, such as 6-4 6-3.');
  const sets = score.split(/[ ,]+/).map(set => set.split('-').map(Number));
  let a = 0, b = 0;
  sets.forEach(([x, y], i) => {
    check(a < 2 && b < 2, 'Score includes sets after the match ended.');
    const hi = Math.max(x,y), lo = Math.min(x,y);
    check((hi === 6 && lo <= 4) || (hi === 7 && [5,6].includes(lo)) || (i === 2 && ((hi === 10 && lo <= 8) || (hi > 10 && hi - lo === 2))), 'Invalid tennis set score.');
    if (x > y) a++; else b++;
  });
  check((winnerIsChallenger ? a === 2 : b === 2), 'Winner must match the score from the challenger’s side.');
}
export function canChallenge(rank, target, wins, count) {
  return rank !== target && target >= 1 && target <= count && (rank <= 3 ? Math.abs(rank - target) <= 3 : target < rank && (wins >= 2 || rank - target <= 3));
}
export function sundayDeadline(now) {
  // Find the end of the current Chicago Sunday, including DST transitions.
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hourCycle: 'h23', minute: 'numeric' });
  let t = Math.floor(now / 60000) * 60000;
  for (let i = 0; i <= 8 * 24 * 60; i++, t += 60000) {
    const parts = Object.fromEntries(fmt.formatToParts(t).map(p => [p.type, p.value]));
    if (parts.weekday === 'Sun' && parts.hour === '23' && parts.minute === '59' && t + 59999 >= now) return t + 59999;
  }
  throw new ValidationError('Cannot calculate deadline.');
}
export function applySinglesLadder(input, payload, actor, now, id) {
  check(payload && typeof payload === 'object', 'Invalid request.');
  const state = structuredClone(input || {});
  const ladder = state.singlesLadder ||= { status: 'draft', entries: {}, challenges: {}, audit: {}, rules: { responseHours: 48, rematchDays: 14 } };
  ladder.entries ||= {}; ladder.challenges ||= {}; ladder.audit ||= {};
  const before = structuredClone(ladder.entries);
  const { action } = payload;
  const admin = () => check(actor.admin, 'Organizer access required.');
  const entry = playerId => { check(key(playerId) && ladder.entries[playerId], 'Choose an enrolled player.'); return ladder.entries[playerId]; };
  const me = state.ladderAccounts?.[actor.uid];
  const audit = () => { ladder.audit[id] = { action, actor: actor.admin ? 'organizer' : me, at: now, before, after: structuredClone(ladder.entries), challengeId: payload.challengeId || null, reason: payload.reason || null }; };
  if (action === 'enroll') {
    admin(); check(ladder.status !== 'closed', 'Season is closed.');
    check(key(payload.playerId) && !ladder.entries[payload.playerId], 'Player already enrolled or invalid.');
    check(typeof payload.name === 'string' && payload.name.length <= 120, 'Invalid player name.');
    ladder.entries[payload.playerId] = { name: payload.name, rank: Object.keys(ladder.entries).length + 1, points: 0, wins: 0, declines: 0 };
  } else if (action === 'link') {
    admin(); entry(payload.playerId); check(key(payload.uid), 'Invalid account UID.');
    check(!Object.entries(state.ladderAccounts || {}).some(([uid, pid]) => uid !== payload.uid && pid === payload.playerId), 'Player already linked.');
    state.ladderAccounts ||= {}; state.ladderAccounts[payload.uid] = payload.playerId;
  } else if (action === 'adjustRank' || action === 'exempt') {
    admin(); check(ladder.status !== 'closed', 'Season is closed.');
    const e = entry(payload.playerId);
    check(typeof payload.reason === 'string' && payload.reason.trim().length >= 3 && payload.reason.length <= 500, 'Explain the organizer decision.');
    check(!Object.values(ladder.challenges).some(c => ['pending', 'accepted', 'submitted', 'disputed'].includes(c.status)), 'Resolve active challenges before changing eligibility or ranks.');
    if (action === 'exempt') {
      check(Number.isSafeInteger(payload.until) && payload.until >= now && payload.until <= now + 90 * DAY, 'Exemption must end within 90 days.'); e.exemptUntil = payload.until;
    } else {
      check(Number.isInteger(payload.rank) && payload.rank >= 1 && payload.rank <= Object.keys(ladder.entries).length, 'Invalid rank.');
      const old = e.rank, target = payload.rank;
      for (const other of Object.values(ladder.entries)) {
        if (other === e) continue;
        if (target < old && other.rank >= target && other.rank < old) other.rank++;
        if (target > old && other.rank > old && other.rank <= target) other.rank--;
      }
      e.rank = target;
    }
  } else if (action === 'open' || action === 'close') {
    admin(); check(ladder.status !== 'closed', 'Closed seasons cannot reopen.');
    check(!Object.values(ladder.challenges).some(c => ['pending', 'accepted', 'submitted', 'disputed'].includes(c.status)), 'Resolve active challenges first.');
    check(Object.keys(ladder.entries).length >= 2, 'Enroll at least two players.'); ladder.status = action === 'open' ? 'active' : 'closed';
  } else {
    check(ladder.status === 'active', 'The ladder is not active.');
    if (action === 'challenge') {
      const a = entry(me), b = entry(payload.opponentId);
      check(!(a.exemptUntil > now || b.exemptUntil > now), 'A player has an approved exemption.');
      check(canChallenge(a.rank, b.rank, a.wins, Object.keys(ladder.entries).length), 'Opponent outside your challenge range.');
      for (const c of Object.values(ladder.challenges)) {
        const pair = [c.challengerId, c.opponentId];
        check(!(['pending', 'accepted', 'submitted', 'disputed'].includes(c.status) && pair.some(p => [me, payload.opponentId].includes(p))), 'A player already has an active challenge.');
        check(!(pair.includes(me) && pair.includes(payload.opponentId) && now - (c.completedAt || c.createdAt) < 14 * DAY), 'Rematches require 14 days.');
      }
      ladder.challenges[id] = { challengerId: me, opponentId: payload.opponentId, status: 'pending', createdAt: now, respondBy: now + 2 * DAY, deadline: sundayDeadline(now), rulesSnapshot: structuredClone(ladder.rules), ranks: { challenger: a.rank, opponent: b.rank } };
    } else {
      check(key(payload.challengeId), 'Invalid challenge.'); const c = ladder.challenges[payload.challengeId]; check(c, 'Challenge not found.');
      const participant = [c.challengerId, c.opponentId].includes(me);
      if (action === 'respond') {
        check(me === c.opponentId && c.status === 'pending' && now <= c.respondBy, 'Only the opponent may respond within 48 hours.');
        check(typeof payload.accept === 'boolean', 'Choose accept or decline.');
        c.status = payload.accept ? 'accepted' : 'declined';
        if (!payload.accept) { const e = entry(me); e.declines++; if (e.declines >= 2) { e.points -= 2; const next = Object.values(ladder.entries).find(x => x.rank === e.rank + 1); if (next) { next.rank--; e.rank++; } } c.completedAt = now; }
      } else if (action === 'expire') {
        check((participant || actor.admin) && c.status === 'pending' && now > c.respondBy, 'Response is not overdue.'); c.status = 'expired'; c.completedAt = now;
      } else if (action === 'submit') {
        check(participant && c.status === 'accepted', 'Only participants may submit an accepted match.');
        check([c.challengerId, c.opponentId].includes(payload.winnerId), 'Invalid winner.');
        validateScore(payload.score, payload.winnerId === c.challengerId);
        c.result = { winnerId: payload.winnerId, score: payload.score, submittedBy: me, at: now }; c.status = 'submitted';
      } else if (action === 'confirm' || action === 'dispute' || action === 'resolve') {
        if (action === 'resolve') { admin(); check(c.status === 'disputed', 'No dispute to resolve.'); check([c.challengerId, c.opponentId].includes(payload.winnerId), 'Choose a winner.'); check(typeof payload.reason === 'string' && payload.reason.trim().length >= 3 && payload.reason.length <= 500, 'Explain the dispute resolution.'); c.resolutionReason = payload.reason.trim(); c.result.winnerId = payload.winnerId; }
        else check(participant && me !== c.result?.submittedBy && c.status === 'submitted', 'The other player must confirm or dispute.');
        if (action === 'dispute') c.status = 'disputed';
        else {
          const winner = entry(c.result.winnerId), loser = entry(c.result.winnerId === c.challengerId ? c.opponentId : c.challengerId);
          const late = c.result.at > (c.extensionUntil || c.deadline);
          const upset = c.result.winnerId === c.challengerId ? c.ranks.challenger > c.ranks.opponent : c.ranks.opponent > c.ranks.challenger;
          winner.points += 3 + (late ? 0 : 1 + Number(upset)); loser.points++; winner.wins++; loser.wins = 0;
          winner.lastPlayedAt = loser.lastPlayedAt = now;
          if (c.result.winnerId === c.challengerId && winner.rank > loser.rank) { const old = winner.rank, target = loser.rank; for (const e of Object.values(ladder.entries)) if (e !== winner && e.rank >= target && e.rank < old) e.rank++; winner.rank = target; }
          c.status = 'confirmed'; c.completedAt = now;
        }
      } else if (action === 'extension') {
        check(participant && c.status === 'accepted', 'Only active match participants may request an extension.'); c.extensionRequested = true;
      } else if (action === 'approveExtension') {
        admin(); check(c.status === 'accepted' && c.extensionRequested, 'No extension request.'); check(Number.isSafeInteger(payload.until) && payload.until > Math.max(now, c.deadline) && payload.until <= c.deadline + 14 * DAY, 'Extension must be within 14 days of deadline.'); c.extensionUntil = payload.until; c.extensionRequested = false;
      } else if (action === 'cancel') { admin(); check(['pending', 'accepted', 'disputed', 'submitted'].includes(c.status), 'Match already completed.'); c.status = 'cancelled'; c.completedAt = now; }
      else check(false, 'Unknown action.');
    }
  }
  audit(); return { state, result: { ok: true, id } };
}
