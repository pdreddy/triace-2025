// Pure read helpers for the Singles Ladder screens. No React and no Firebase here: components get their numbers from
// these functions, and every business value comes from the season's own rules (functions/lib/singlesLadder/config.js).
import { inChallengeRange } from '../../../functions/lib/singlesLadder/config.js';

const DAY = 86400000;
export const ACTIVE = ['pending', 'accepted', 'submitted', 'disputed'];
export const isActive = c => ACTIVE.includes(c.status);
const involves = (c, id) => c.challengerId === id || c.opponentId === id;
export const opponentOf = (c, id) => (c.challengerId === id ? c.opponentId : c.challengerId);
export const entries = object => Object.entries(object || {}).map(([id, value]) => ({ id, ...value }));
export const dueAt = c => (c.status === 'pending' ? c.respondBy : c.status === 'accepted' ? c.extensionUntil || c.deadline : null);

export function playerStatus(player, rules, now) {
  if (!player.eligible) return { label: 'Not eligible', tone: 'muted' };
  if (player.exemptUntil > now && (player.exemptFrom || 0) <= now) return { label: 'Exempt', tone: 'sky' };
  if (rules?.streak.enabled && (player.streak || 0) >= rules.streak.wins) return { label: `${player.streak}-win streak`, tone: 'lime' };
  if (rules?.inactivity.enabled && now - Math.max(player.lastActiveAt || 0, player.joinedAt || 0) >= rules.inactivity.days * DAY) return { label: 'Inactive', tone: 'warn' };
  return { label: 'Active', tone: 'good' };
}
// Last few finished matches for a player, newest first: ['W', 'L', ...].
export function recentResults(season, playerId, count = 3) {
  return entries(season?.challenges).filter(c => c.status === 'completed' && involves(c, playerId)).sort((a, b) => b.completedAt - a.completedAt).slice(0, count).map(c => (c.result.winnerId === playerId ? 'W' : 'L'));
}
export function standings(season, now = Date.now()) {
  const rules = season?.rules?.values;
  return entries(season?.players).sort((a, b) => a.rank - b.rank).map(p => ({ ...p, status: playerStatus(p, rules, now), recent: recentResults(season, p.id) }));
}
export const challengesOf = (season, playerId) => entries(season?.challenges).filter(c => involves(c, playerId)).sort((a, b) => b.createdAt - a.createdAt);

// Why the signed-in player can or cannot challenge someone right now. The server makes the real decision; this only
// decides which buttons to show, from the same season rules.
export function challengeOption(season, meId, targetId, now = Date.now()) {
  const v = season?.rules?.values, me = season?.players?.[meId], target = season?.players?.[targetId];
  if (!v || !me || !target || meId === targetId) return { ok: false };
  if (!me.eligible || !target.eligible) return { ok: false };
  const exempt = p => p.exemptUntil > now && (p.exemptFrom || 0) <= now;
  if (v.challenge.blockExempt && (exempt(me) || exempt(target))) return { ok: false };
  if (!inChallengeRange(v, me.rank, target.rank, me.streak || 0, Object.keys(season.players).length)) return { ok: false };
  const all = entries(season.challenges), active = id => all.filter(c => isActive(c) && involves(c, id)).length;
  if (active(meId) >= v.challenge.activeLimit) return { ok: false };   // their own card already says what to finish first
  if (active(targetId) >= v.challenge.activeLimit) return { ok: false, why: 'Busy' };
  if (v.rematch.enabled) {
    const last = Math.max(0, ...all.filter(c => involves(c, meId) && involves(c, targetId) && c.completedAt && (c.status === 'completed' || (v.rematch.afterUnplayed && ['declined', 'expired'].includes(c.status)))).map(c => c.completedAt));
    if (now - last < v.rematch.days * DAY) return { ok: false, why: 'Rematch cooldown' };
  }
  return { ok: true };
}
// What the Player Home card shows.
export function ladderSummary(season, playerId) {
  const me = season?.players?.[playerId];
  if (!me) return null;
  const mine = challengesOf(season, playerId).filter(isActive), due = mine.map(dueAt).filter(Boolean);
  return { rank: me.rank, points: me.points, utr: me.utr, players: Object.keys(season.players).length, pending: mine.length, nextDeadline: due.length ? Math.min(...due) : null };
}
// What the signed-in player has to do about a challenge, if anything.
export function nextStep(c, playerId) {
  if (!involves(c, playerId)) return null;
  if (c.status === 'pending') return c.opponentId === playerId ? 'respond' : 'waiting';
  if (c.status === 'accepted') return 'report';
  if (c.status === 'submitted') return c.result.submittedBy === playerId ? 'waiting' : 'confirm';
  if (c.status === 'disputed') return 'organizer';
  return null;
}
export const STATUS_LABELS = { pending: 'Waiting for an answer', accepted: 'To be played', submitted: 'Score reported', disputed: 'With the organizer', completed: 'Completed', declined: 'Declined', expired: 'Lapsed', withdrawn: 'Withdrawn', cancelled: 'Cancelled', voided: 'Voided' };
export const POINT_LABELS = { win: 'Win', loss: 'Loss', challengeBonus: 'Successful challenge', defenseBonus: 'Successful defense', upsetBonus: 'Upset bonus', walkoverWin: 'Walkover win', walkoverLoss: 'Walkover given', noShow: 'No-show', declinePenalty: 'Decline penalty', adjustment: 'Organizer adjustment', void: 'Voided result' };
export function pointsBreakdown(season, playerId) {
  const lines = entries(season?.points).filter(e => e.playerId === playerId).sort((a, b) => b.at - a.at);
  const totals = {};
  for (const line of lines) totals[line.type] = (totals[line.type] || 0) + line.amount;
  return { lines, totals: Object.entries(totals).map(([type, amount]) => ({ type, label: POINT_LABELS[type] || type, amount })), total: lines.reduce((sum, e) => sum + e.amount, 0) };
}

// ----- CSV exports (organizer) -----
const cell = value => { const text = value === null || value === undefined ? '' : String(value); return /[",\n\r]/.test(text) || /^[=+\-@]/.test(text) ? `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"` : text; };
export const toCsv = (header, rows) => [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
const iso = ts => (ts ? new Date(ts).toISOString() : '');
export function exportCsv(kind, season, now = Date.now()) {
  const name = id => season.players?.[id]?.name || id;
  if (kind === 'standings') return toCsv(['Position', 'Player', 'Points', 'UTR', 'Wins', 'Losses', 'Streak', 'Status'], standings(season, now).map(p => [p.rank, p.name, p.points, p.utr, p.wins || 0, p.losses || 0, p.streak || 0, p.status.label]));
  if (kind === 'players') return toCsv(['Player ID', 'Player', 'Position', 'UTR', 'Eligible', 'Joined (UTC)', 'Last active (UTC)', 'Exempt until (UTC)'], standings(season, now).map(p => [p.id, p.name, p.rank, p.utr, p.eligible ? 'yes' : 'no', iso(p.joinedAt), iso(p.lastActiveAt), iso(p.exemptUntil)]));
  if (kind === 'matches') return toCsv(['Challenge ID', 'Challenger', 'Opponent', 'Status', 'Created (UTC)', 'Deadline (UTC)', 'Extended to (UTC)', 'Winner', 'Score', 'Result type', 'Reported (UTC)', 'Completed (UTC)', 'Late', 'Positions changed', 'Rules version'],
    entries(season.challenges).sort((a, b) => a.createdAt - b.createdAt).map(c => [c.id, name(c.challengerId), name(c.opponentId), c.status, iso(c.createdAt), iso(c.deadline), iso(c.extensionUntil), c.result ? name(c.result.winnerId) : '', c.result?.score, c.result?.kind, iso(c.result?.submittedAt), iso(c.completedAt), c.outcome ? (c.outcome.late ? 'yes' : 'no') : '', c.outcome ? (c.outcome.moved ? 'yes' : 'no') : '', c.rules?.version]));
  if (kind === 'points') return toCsv(['Time (UTC)', 'Player', 'Type', 'Points', 'Challenge ID', 'Rules version', 'Note'], entries(season.points).sort((a, b) => a.at - b.at).map(e => [iso(e.at), name(e.playerId), POINT_LABELS[e.type] || e.type, e.amount, e.challengeId, e.rulesVersion, e.note]));
  throw new Error('Unknown export.');
}
