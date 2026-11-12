// The one definition of every Singles Ladder business rule: its type, limits, INITIAL default and plain-language help.
// The web app (settings form, Rules page, challenge buttons) and the Cloud Functions (enforcement) both import this file,
// so a value is never repeated in a component or a handler. A season stores its own copy
// ({ schema, version, values }); the defaults below are only used when an organizer creates a season.
// Authentication, organizer authorization, ownership checks, audit logging and data-integrity checks are NOT here on
// purpose: they are security controls and cannot be configured or switched off.
export const RULES_SCHEMA = 1;

const int = (def, min, max, label, help) => ({ type: 'int', default: def, min, max, label, help });
const bool = (def, label, help) => ({ type: 'bool', default: def, label, help });
const choice = (def, options, label, help) => ({ type: 'enum', default: def, options, label, help });
const AUTO_OR_REVIEW = { review: 'An organizer reviews it first', auto: 'Applied automatically' };
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const RULE_GROUPS = [
  { id: 'challenge', title: 'Challenge range', fields: {
    maxUp: int(3, 1, 50, 'Positions above', 'How many positions above their own a player may challenge.'),
    activeLimit: int(1, 1, 5, 'Active challenges per player', 'A player may be part of this many unfinished challenges at once, as challenger or as opponent.'),
    blockExempt: bool(true, 'Exempt players sit out', 'A player with an approved exemption cannot challenge or be challenged until it ends.')
  } },
  { id: 'top', title: 'Top players', fields: {
    enabled: bool(true, 'Top players may challenge downward', 'Lets the highest-ranked players find matches by challenging players below them.'),
    threshold: int(3, 1, 20, 'Top positions', 'Positions 1 to this number count as top players.'),
    maxDown: int(3, 1, 20, 'Positions below', 'How many positions below their own a top player may challenge.')
  } },
  { id: 'streak', title: 'Win streak', fields: {
    enabled: bool(true, 'Win streak unlocks a wider range', 'Consecutive ladder wins let a player challenge beyond the normal range. A loss ends the streak.'),
    wins: int(2, 1, 20, 'Consecutive wins needed', 'Wins in a row (walkover wins count) before the wider range opens.'),
    maxUp: int(0, 0, 100, 'Unlocked positions above', 'How many positions above a player on a streak may challenge. 0 means any higher position.')
  } },
  { id: 'rematch', title: 'Rematches', fields: {
    enabled: bool(true, 'Rematch cooldown', 'Stops the same two players from meeting again straight away.'),
    days: int(14, 1, 365, 'Days between rematches', 'Counted from the day the earlier challenge between the two players ended.'),
    afterUnplayed: bool(true, 'Also after a declined or expired challenge', 'When off, only played matches and walkovers start the cooldown.')
  } },
  { id: 'response', title: 'Responding to a challenge', fields: {
    hours: int(48, 1, 336, 'Hours to respond', 'The challenged player must accept or decline within this time.'),
    onExpire: choice('void', { void: 'The challenge lapses with no penalty', decline: 'It counts as a decline by the challenged player', walkover: 'The challenger receives a walkover win' }, 'If nobody responds', 'What happens when the response window closes without an answer.')
  } },
  { id: 'deadline', title: 'Match deadline', fields: {
    day: choice(0, Object.fromEntries(WEEKDAYS.map((name, i) => [i, name])), 'Deadline day', 'Accepted matches must be played and reported by the end of this day.'),
    time: { type: 'time', default: '23:59', label: 'Deadline time', help: 'Local time on the deadline day, in the season timezone (24-hour HH:MM). The whole minute counts.' },
    timezone: { type: 'timezone', default: 'America/Chicago', label: 'Season timezone', help: 'Deadlines and displayed times use this timezone. Times are stored in UTC.' },
    minDays: int(0, 0, 13, 'Minimum days to play', 'A match accepted with fewer than this many days before the deadline is due the following week instead. 0 means always the next deadline.')
  } },
  { id: 'swap', title: 'Position changes', fields: {
    enabled: bool(true, 'Winning challengers move up', 'An on-time win by a challenger over a higher-ranked opponent changes positions.'),
    mode: choice('swap', { swap: 'The two players swap positions', takePlace: 'The winner takes the position; everyone between moves down one' }, 'How positions change', 'What happens to the two players and those between them.'),
    lowerDefenderWin: choice('none', { none: 'Positions stay as they are', move: 'The lower-ranked winner moves up the same way' }, 'Lower-ranked player wins a downward challenge', 'When a top player challenges downward and loses.')
  } },
  { id: 'late', title: 'Late results', fields: {
    allowBonuses: bool(false, 'Late results keep bonuses', 'When off, a result reported after the deadline earns the normal win and loss points only.'),
    allowSwap: bool(false, 'Late results change positions', 'When off, a result reported after the deadline never changes positions.')
  } },
  { id: 'extension', title: 'Deadline extensions', fields: {
    enabled: bool(true, 'Players may request an extension', 'An organizer approves or denies every request.'),
    maxDays: int(14, 1, 60, 'Longest extension (days)', 'An extension may end at most this many days after the original deadline.'),
    allowSwap: bool(true, 'Extended matches change positions', 'A result reported inside an approved extension can still change positions.'),
    allowBonuses: bool(true, 'Extended matches keep bonuses', 'A result reported inside an approved extension can still earn bonuses.')
  } },
  { id: 'points', title: 'Points', fields: {
    win: int(3, 0, 20, 'Win', 'Points for winning a played match.'),
    loss: int(1, 0, 20, 'Loss', 'Points for losing a played match.'),
    challengeBonus: int(1, 0, 20, 'Successful challenge bonus', 'Extra points when the challenger wins.'),
    defenseBonus: int(1, 0, 20, 'Successful defense bonus', 'Extra points when the challenged player wins.'),
    upsetBonus: int(1, 0, 20, 'Upset bonus', 'Extra points for beating a player ranked well above you.'),
    upsetMinGap: int(2, 1, 50, 'Upset: smallest gap', 'The winner must have started at least this many positions below the loser.'),
    upsetMaxGap: int(3, 1, 100, 'Upset: largest gap', 'The winner must have started at most this many positions below the loser.'),
    walkoverWin: int(3, 0, 20, 'Walkover win', 'Points for a win awarded without play. Set separately from a played win.'),
    walkoverLoss: int(0, 0, 20, 'Walkover loss (with notice)', 'Points for a player who gives a walkover after telling the opponent.'),
    walkoverBonuses: bool(false, 'Walkover wins earn bonuses', 'When on, challenge, defense and upset bonuses also apply to walkover wins.'),
    walkoverSwap: bool(true, 'Walkover wins change positions', 'When on, a walkover win changes positions like a played win.')
  } },
  { id: 'decline', title: 'Declines', fields: {
    enabled: bool(true, 'Decline penalties', 'When off, declining never costs points or positions.'),
    free: int(1, 0, 20, 'Free declines', 'This many valid declines carry no points penalty.'),
    penaltyPoints: int(2, 0, 20, 'Points deducted per later decline', 'Deducted for each valid decline after the free allowance.'),
    countDownward: bool(true, 'Declining a higher-ranked challenger counts', 'When off, declining a downward challenge from a top player is never a valid decline.'),
    counting: choice('season', { season: 'All declines this season', rolling: 'Declines in the last N days' }, 'Which declines count', 'How valid declines are counted towards the free allowance and the position drop.'),
    rollingDays: int(30, 1, 365, 'Rolling window (days)', 'Used when only recent declines count.'),
    dropThreshold: int(2, 0, 20, 'Declines that trigger a position drop', 'Reaching this many valid declines triggers a position drop. 0 turns the drop off.'),
    dropPositions: int(3, 1, 20, 'Positions dropped', 'How far the player moves down.'),
    resetAfterDrop: bool(true, 'Start counting again after a drop', 'When on, the decline count returns to zero once a drop is applied.'),
    review: choice('review', AUTO_OR_REVIEW, 'Position drop for declines', 'The points deduction is always immediate; this controls the position drop.')
  } },
  { id: 'inactivity', title: 'Inactivity', fields: {
    enabled: bool(true, 'Inactivity penalty', 'Players who stay inactive too long can be moved down.'),
    days: int(14, 1, 365, 'Days without activity', 'Counted from the last activity, the day the player joined or the season opened, or the end of an exemption.'),
    activity: choice('match', { match: 'A completed match', accepted: 'An accepted challenge or a completed match', challenge: 'Sending or answering a challenge, or a completed match' }, 'What counts as activity', 'Which actions reset the inactivity clock.'),
    dropPositions: int(3, 1, 20, 'Positions dropped', 'How far an inactive player moves down.'),
    repeat: choice('every', { every: 'Again after every further inactive period', once: 'Only once per season' }, 'Repeat penalties', 'Whether continued inactivity is penalised again.'),
    review: choice('review', AUTO_OR_REVIEW, 'Position drop for inactivity', 'Whether an organizer confirms each inactivity penalty.')
  } },
  { id: 'noShow', title: 'No-shows', fields: {
    enabled: bool(true, 'Players may report a no-show', 'When off, only an organizer can record a no-show.'),
    graceMinutes: int(15, 0, 120, 'Grace period (minutes)', 'A player who has not arrived this long after the agreed time, without notice, is a no-show.'),
    points: int(0, 0, 20, 'No-show points', 'Points for the player who did not show.'),
    requireOrganizer: bool(true, 'An organizer decides every no-show', 'When off, the reported player may confirm the no-show themselves; disputes still go to an organizer.')
  } }
];

const FIELD = Object.fromEntries(RULE_GROUPS.map(g => [g.id, g.fields]));
export const DEFAULT_RULES = Object.freeze(Object.fromEntries(RULE_GROUPS.map(g => [g.id, Object.freeze(Object.fromEntries(Object.entries(g.fields).map(([k, f]) => [k, f.default])))])));

export const isTimezone = tz => { if (typeof tz !== 'string' || !tz || tz.length > 64) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

// Returns { ok, values, errors }: `values` is a clean copy, `errors` maps "group.field" (or "group") to a message.
// Every field is required and unknown fields are refused, so a stored configuration is always complete.
export function validateRules(input) {
  const errors = {}, values = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, values: null, errors: { rules: 'Rules must be an object.' } };
  for (const key of Object.keys(input)) if (!FIELD[key]) errors[key] = 'Unknown rule group.';
  for (const group of RULE_GROUPS) {
    const given = input[group.id];
    if (!given || typeof given !== 'object' || Array.isArray(given)) { errors[group.id] = 'Missing rule group.'; continue; }
    for (const key of Object.keys(given)) if (!group.fields[key]) errors[`${group.id}.${key}`] = 'Unknown rule.';
    values[group.id] = {};
    for (const [key, field] of Object.entries(group.fields)) {
      const value = given[key], at = `${group.id}.${key}`;
      if (field.type === 'int') { if (!Number.isInteger(value) || value < field.min || value > field.max) errors[at] = `Enter a whole number from ${field.min} to ${field.max}.`; }
      else if (field.type === 'bool') { if (typeof value !== 'boolean') errors[at] = 'Choose on or off.'; }
      else if (field.type === 'enum') { if (!Object.keys(field.options).includes(String(value)) || typeof value !== typeof field.default) errors[at] = 'Choose one of the listed options.'; }
      else if (field.type === 'time') { if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) errors[at] = 'Enter a 24-hour time such as 23:59.'; }
      else if (field.type === 'timezone') { if (!isTimezone(value)) errors[at] = 'Enter a timezone such as America/Chicago.'; }
      values[group.id][key] = value;
    }
  }
  if (Object.keys(errors).length) return { ok: false, values: null, errors };
  // Combinations that contradict each other.
  const v = values, fail = (at, message) => { errors[at] ||= message; };
  if (v.streak.enabled && v.streak.maxUp !== 0 && v.streak.maxUp <= v.challenge.maxUp) fail('streak.maxUp', `A streak must unlock more than the normal ${v.challenge.maxUp} positions (or 0 for any higher position).`);
  if (v.points.win < v.points.loss) fail('points.win', 'A win cannot be worth less than a loss.');
  if (v.points.upsetMinGap > v.points.upsetMaxGap) fail('points.upsetMaxGap', 'The largest upset gap cannot be smaller than the smallest.');
  if (v.points.walkoverWin < v.points.walkoverLoss) fail('points.walkoverWin', 'A walkover win cannot be worth less than a walkover loss.');
  if (v.points.walkoverWin < v.noShow.points) fail('noShow.points', 'A no-show cannot earn more than the walkover win.');
  if (v.decline.enabled && v.decline.dropThreshold !== 0 && v.decline.dropThreshold <= v.decline.free) fail('decline.dropThreshold', 'A position drop cannot be triggered by a decline that is still free. Use a number above the free declines, or 0 to turn the drop off.');
  if (v.inactivity.enabled && v.inactivity.days * 24 <= v.response.hours) fail('inactivity.days', 'The inactivity period must be longer than the time allowed to respond to a challenge.');
  if (v.late.allowSwap && !v.swap.enabled) fail('late.allowSwap', 'Late results cannot change positions while position changes are off.');
  if (v.extension.enabled && v.extension.allowSwap && !v.swap.enabled) fail('extension.allowSwap', 'Extended matches cannot change positions while position changes are off.');
  if (v.response.onExpire === 'decline' && v.response.hours < 24) fail('response.hours', 'Give at least 24 hours to respond when an unanswered challenge counts as a decline.');
  return Object.keys(errors).length ? { ok: false, values: null, errors } : { ok: true, values, errors: {} };
}

const shown = (field, value) => field.type === 'bool' ? (value ? 'On' : 'Off') : field.type === 'enum' ? field.options[value] : String(value);
// Before/after list for the settings preview and the audit log: [{ key, group, label, before, after, beforeText, afterText }].
export function diffRules(before, after) {
  const changes = [];
  for (const group of RULE_GROUPS) for (const [key, field] of Object.entries(group.fields)) {
    const a = before?.[group.id]?.[key], b = after?.[group.id]?.[key];
    if (a !== b) changes.push({ key: `${group.id}.${key}`, group: group.title, label: field.label, before: a ?? null, after: b ?? null, beforeText: a === undefined ? '—' : shown(field, a), afterText: b === undefined ? '—' : shown(field, b) });
  }
  return changes;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pts = n => plural(n, 'point');
export const formatTime = time => { const [h, m] = time.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
// The readable Rules page, generated from a season's values: [{ title, lines: [sentence] }].
export function describeRules(v) {
  const sections = [];
  const add = (title, ...lines) => sections.push({ title, lines: lines.filter(Boolean) });
  add('Who you can challenge',
    `You may challenge a player up to ${plural(v.challenge.maxUp, 'position')} above you.`,
    v.top.enabled && `Players ranked 1 to ${v.top.threshold} may also challenge up to ${plural(v.top.maxDown, 'position')} below them.`,
    v.streak.enabled && `${plural(v.streak.wins, 'consecutive ladder win')} unlock${v.streak.wins === 1 ? 's' : ''} ${v.streak.maxUp === 0 ? 'any higher position' : `up to ${plural(v.streak.maxUp, 'position')} above you`}. A loss ends the streak.`,
    `You may have ${plural(v.challenge.activeLimit, 'active challenge')} at a time, counting challenges you sent and received.`,
    v.rematch.enabled && `No rematch against the same player within ${plural(v.rematch.days, 'day')}${v.rematch.afterUnplayed ? ', including after a declined or unanswered challenge' : ' of a played match'}.`,
    v.challenge.blockExempt && 'Players with an approved exemption cannot challenge or be challenged until it ends.');
  add('Responding',
    `A challenged player must accept or decline within ${plural(v.response.hours, 'hour')}.`,
    { void: 'An unanswered challenge lapses with no penalty.', decline: 'An unanswered challenge counts as a decline.', walkover: 'An unanswered challenge gives the challenger a walkover win.' }[v.response.onExpire]);
  add('Playing the match',
    `Accepted matches are due ${WEEKDAYS[v.deadline.day]} at ${formatTime(v.deadline.time)} (${v.deadline.timezone}).`,
    v.deadline.minDays > 0 && `A match accepted fewer than ${plural(v.deadline.minDays, 'day')} before that deadline is due the following ${WEEKDAYS[v.deadline.day]}.`,
    'Either player reports the score; the other player confirms or disputes it.',
    v.extension.enabled ? `Either player may request an extension of up to ${plural(v.extension.maxDays, 'day')}; an organizer decides.` : 'Deadline extensions are not available this season.');
  add('Positions',
    !v.swap.enabled ? 'Results do not change positions this season.' : `A challenger who beats a higher-ranked opponent on time ${v.swap.mode === 'swap' ? 'swaps positions with them' : 'takes their position, and everyone between moves down one'}.`,
    v.swap.enabled && v.top.enabled && (v.swap.lowerDefenderWin === 'move' ? 'A lower-ranked player who beats a downward challenge moves up the same way.' : 'A lower-ranked player who beats a downward challenge keeps their position.'),
    `Late results earn ${v.late.allowBonuses ? 'the usual bonuses' : 'normal win and loss points only, with no bonuses'}${v.swap.enabled ? ` and ${v.late.allowSwap ? 'still change positions' : 'do not change positions'}` : ''}.`,
    v.extension.enabled && v.swap.enabled && (v.extension.allowSwap ? 'A result reported inside an approved extension can still change positions.' : 'A result reported after the original deadline does not change positions, even with an extension.'));
  add('Points',
    `Win: ${pts(v.points.win)}. Loss: ${pts(v.points.loss)}.`,
    `Successful challenge: +${v.points.challengeBonus}. Successful defense: +${v.points.defenseBonus}.`,
    `Upset (beating a player ${v.points.upsetMinGap === v.points.upsetMaxGap ? v.points.upsetMinGap : `${v.points.upsetMinGap}–${v.points.upsetMaxGap}`} positions above you): +${v.points.upsetBonus}.`,
    `Walkover win: ${pts(v.points.walkoverWin)}${v.points.walkoverBonuses ? ' plus bonuses' : ', no bonuses'}. Walkover given with notice: ${pts(v.points.walkoverLoss)}.`);
  add('Declines',
    !v.decline.enabled ? 'Declining a challenge carries no penalty this season.' : `${v.decline.free === 0 ? 'Every valid decline' : `Your first ${v.decline.free === 1 ? 'valid decline is' : `${v.decline.free} valid declines are`} free; each later one`} deducts ${pts(v.decline.penaltyPoints)}.`,
    v.decline.enabled && `Declines are counted ${v.decline.counting === 'season' ? 'over the whole season' : `over the last ${plural(v.decline.rollingDays, 'day')}`}${v.decline.countDownward ? '' : '; declining a higher-ranked challenger never counts'}.`,
    v.decline.enabled && v.decline.dropThreshold > 0 && `${plural(v.decline.dropThreshold, 'valid decline')} can trigger a ${v.decline.dropPositions}-position drop${v.decline.review === 'review' ? ', decided by an organizer' : ', applied automatically'}${v.decline.resetAfterDrop ? '; the count then starts again' : ''}.`);
  add('Inactivity and no-shows',
    v.inactivity.enabled ? `${plural(v.inactivity.days, 'day')} without ${{ match: 'a completed match', accepted: 'an accepted challenge or completed match', challenge: 'sending or answering a challenge' }[v.inactivity.activity]}, and without an approved exemption, can trigger a ${v.inactivity.dropPositions}-position drop${v.inactivity.review === 'review' ? ', decided by an organizer' : ', applied automatically'}${v.inactivity.repeat === 'every' ? ', again for each further inactive period' : ', once per season'}.` : 'There is no inactivity penalty this season.',
    'Request an exemption before you are away; an organizer decides.',
    `A player who has not arrived ${plural(v.noShow.graceMinutes, 'minute')} after the agreed time, without notice, is a no-show and receives ${pts(v.noShow.points)}; the opponent receives the walkover win.`,
    v.noShow.requireOrganizer ? 'An organizer decides every no-show.' : 'The reported player may confirm a no-show; disputes go to an organizer.');
  add('Organizers', 'Organizers have final authority over disputes and manual adjustments. Every organizer action and every position change is recorded.',
    'Each challenge keeps the rules that applied when it was sent. Later rule changes apply to new challenges only.');
  return sections;
}

// The positions a player may challenge right now. Shared by the challenge buttons and the server check.
export function challengeRange(v, rank, streak, playerCount) {
  const up = v.streak.enabled && streak >= v.streak.wins ? (v.streak.maxUp === 0 ? playerCount : Math.max(v.streak.maxUp, v.challenge.maxUp)) : v.challenge.maxUp;
  const down = v.top.enabled && rank <= v.top.threshold ? v.top.maxDown : 0;
  return { min: Math.max(1, rank - up), max: Math.min(playerCount, rank + down) };
}
export function inChallengeRange(v, rank, targetRank, streak, playerCount) {
  const { min, max } = challengeRange(v, rank, streak, playerCount);
  return Number.isInteger(targetRank) && targetRank !== rank && targetRank >= min && targetRank <= max;
}
