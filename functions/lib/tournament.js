import { validateEarlyBird } from './earlyBird.js';
import { validateCalendar, calendarOf, registrationWindow } from './calendar.js';
export const DEFAULT_SETTINGS = { registrationEnabled: true, aceNameMaskingEnabled: true, minPlayerUtr: 1, maxPlayerUtr: 1650 };
export const DEFAULT_TIERS = {
  goat: { name: 'GOAT Tier', minCombinedUtr: 1750, maxCombinedUtr: 2200, sortOrder: 1, active: true },
  rising: { name: 'Rising Tier', minCombinedUtr: 1150, maxCombinedUtr: 1750, sortOrder: 2, active: true }
};
export class ValidationError extends Error { constructor(message) { super(message); this.name = 'ValidationError'; } }
export const formatUtr = value => (value / 100).toFixed(2);
// A player counts at the higher of singles and doubles, unless the two are more than 1.75 apart:
// then the average counts (rounded to the nearest hundredth). Ratings are integer hundredths.
export const UTR_GAP_LIMIT = 175;
export function playerUtr(singlesUtr, doublesUtr = null, gapLimit = UTR_GAP_LIMIT) {
  if (doublesUtr == null) return singlesUtr;
  return Math.abs(singlesUtr - doublesUtr) > gapLimit ? Math.round((singlesUtr + doublesUtr) / 2) : Math.max(singlesUtr, doublesUtr);
}
// League rules the admin can change. Missing values (older saved data) fall back to these defaults.
export const DEFAULT_LEAGUE_RULES = {
  utrGapLimit: 175, pointsPerWin: 1, playoffThreshold: 7, playoffSpotsLarge: 4, playoffSpotsSmall: 3, singlesMinPercent: 30, tierCapacity: 9,
  // Challenge rule (provisional): a team in challengerFrom–challengerTo may challenge one in targetFrom–targetTo once,
  // before the last challengeCutoffRounds rounds; a challenger win swaps the two places in the table.
  challengeEnabled: true, challengerFrom: 5, challengerTo: 6, targetFrom: 2, targetTo: 4, challengeCutoffRounds: 3
};
// A registration belongs to the browser that created it and to the captain's login account (owners).
export const isOwner = (registration, uid) => !!registration && !!uid && (registration.ownerUid === uid || registration.owners?.[uid] === true);
// Each encounter has ONE singles match and a team has three players, so they share the singles days: every player can reach
// at most a third of them. A higher minimum cannot be met by every player, so it is never allowed (and never applied if one was saved earlier).
export const MAX_SINGLES_PERCENT = 33;
export const rulesOf = state => { const rules = { ...DEFAULT_LEAGUE_RULES, ...(state?.leagueRules || {}) }; return { ...rules, singlesMinPercent: Math.min(rules.singlesMinPercent, MAX_SINGLES_PERCENT) }; };
export const DEFAULT_SEASON_NAME = `${new Date().getFullYear()} season`;
export function parseUtr(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) throw new ValidationError('Enter a numeric UTR with up to two decimal places.');
  return Math.round(Number(text) * 100);
}
function assert(condition, message) { if (!condition) throw new ValidationError(message); }
function exact(value, keys, message) { assert(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), message); }
function integer(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
function name(value, label, max = 80) { assert(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value), `${label} is required (up to ${max} characters).`); return value.trim(); }
export function normalizeWhatsAppPhone(value) {
  assert(typeof value === 'string', 'Enter a WhatsApp number with country code, such as +15551234567.');
  const phone = value.replace(/[\s()-]/g, '');
  assert(/^\+[1-9]\d{7,14}$/.test(phone), 'Enter a WhatsApp number with country code, such as +15551234567.');
  return phone;
}
export function validateSettings(value) {
  exact(value, Object.keys(DEFAULT_SETTINGS), 'Invalid registration settings.');
  assert(typeof value.registrationEnabled === 'boolean' && typeof value.aceNameMaskingEnabled === 'boolean', 'Registration and masking settings must be on or off.');
  assert(integer(value.minPlayerUtr, 1, 1650) && integer(value.maxPlayerUtr, value.minPlayerUtr, 1650), 'Individual UTR limits must be between 0.01 and 16.50, with minimum ≤ maximum.');
  return { ...value };
}
export function validateTierConfig(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Tier configuration is required.');
  assert(Object.keys(value).length <= 20, 'A tournament supports at most 20 tiers.');
  const result = {};
  for (const [id, tier] of Object.entries(value)) {
    assert(/^[a-z][a-z0-9_-]{0,39}$/.test(id) && !['higher', 'both', 'goat_fallback_rising', 'constructor', 'prototype'].includes(id), 'Tier ID is reserved or invalid. Use lowercase letters, numbers, hyphens or underscores.');
    exact(tier, ['name', 'minCombinedUtr', 'maxCombinedUtr', 'sortOrder', 'active'], 'Invalid tier fields.');
    assert(integer(tier.minCombinedUtr, 1, 4950) && integer(tier.maxCombinedUtr, tier.minCombinedUtr, 4950), 'Combined UTR limits must be between 0.01 and 49.50, with minimum ≤ maximum.');
    assert(integer(tier.sortOrder, 1, 999) && typeof tier.active === 'boolean', 'Each tier needs an order from 1 to 999 and an active status.');
    result[id] = { ...tier, name: name(tier.name, 'Tier name', 50) };
  }
  assert(new Set(Object.values(result).map(t => t.sortOrder)).size === Object.keys(result).length, 'Each tier must have a unique order. Order 1 is highest.');
  return result;
}
export function orderedTiers(config, activeOnly = false) {
  return Object.entries(config || {}).map(([id, tier]) => ({ ...tier, id })).filter(t => !activeOnly || t.active).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
export function assignTier(combinedUtr, config) {
  return orderedTiers(config, true).find(tier => combinedUtr >= tier.minCombinedUtr && combinedUtr <= tier.maxCombinedUtr)?.id ?? null;
}
export function assignSelectedTier(combinedUtr, config, selectedTier = 'higher') {
  const highest = assignTier(combinedUtr, config);
  if (!highest) return null;
  if (selectedTier === 'higher') return highest;
  if (selectedTier === 'goat_fallback_rising') {
    if (!config.goat?.active || !config.rising?.active) return null;
    return highest === 'goat' ? 'goat' : highest === 'rising' ? 'rising' : null;
  }
  if (selectedTier === 'both') return highest === 'goat' && config.rising?.active ? 'goat' : null;
  const active = orderedTiers(config, true);
  const highestIndex = active.findIndex(tier => tier.id === highest);
  const selectedIndex = active.findIndex(tier => tier.id === selectedTier);
  return selectedIndex >= highestIndex ? selectedTier : null;
}
export function listedTiers(combinedUtr, config, selectedTier) {
  const assigned = assignSelectedTier(combinedUtr, config, selectedTier);
  return assigned ? selectedTier === 'both' ? ['goat', 'rising'] : [assigned] : [];
}
function player(value, captain, settings, gapLimit) {
  // The captain may also give a last name (private; used to build the captain's login). It is optional so older pages keep working.
  const withLastName = captain && value && typeof value === 'object' && Object.hasOwn(value, 'lastName');
  exact(value, [captain ? 'firstName' : 'fullName', 'singlesUtr', 'doublesUtr', ...(withLastName ? ['lastName'] : [])], 'Invalid player fields.');
  const key = captain ? 'firstName' : 'fullName';
  const label = captain ? 'Captain first name' : 'Ace full name';
  const clean = name(value[key], label, captain ? 40 : 80);
  if (captain) assert(!/\s/.test(clean), 'Enter only the captain’s first name, without a surname.');
  assert(integer(value.singlesUtr, settings.minPlayerUtr, settings.maxPlayerUtr), `${label}: UTR must be ${formatUtr(settings.minPlayerUtr)}–${formatUtr(settings.maxPlayerUtr)}.`);
  assert(value.doublesUtr === null || integer(value.doublesUtr, settings.minPlayerUtr, settings.maxPlayerUtr), `${label}: optional doubles UTR must be within the individual limits.`);
  let lastName;
  if (withLastName) {
    lastName = name(value.lastName, 'Captain last name', 40);
    assert(/^[\p{L}][\p{L} .'’-]*$/u.test(lastName), 'Use letters only for the captain’s last name.');
  }
  return { [key]: clean, ...(lastName ? { lastName } : {}), singlesUtr: value.singlesUtr, doublesUtr: value.doublesUtr, utr: playerUtr(value.singlesUtr, value.doublesUtr, gapLimit) };
}
// Links to the shared PPRC player list: { captain?, ace1?, ace2? } -> player id. Private to the team (an id is made from the
// full name), so it is never part of the public record.
const PPRC_ID = /^p_[a-z0-9_]{2,100}$/;
function validPprcIds(value) {
  if (value === undefined || value === null) return null;
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Invalid PPRC player links.');
  const entries = Object.entries(value).filter(([, id]) => id !== '' && id != null);
  for (const [key, id] of entries) assert(['captain', 'ace1', 'ace2'].includes(key) && typeof id === 'string' && PPRC_ID.test(id), 'Invalid PPRC player link.');
  assert(new Set(entries.map(([, id]) => id)).size === entries.length, 'The same PPRC player cannot be linked twice.');
  return entries.length ? Object.fromEntries(entries) : null;
}
export function validateRegistration(payload, settings, tiers, gapLimit = UTR_GAP_LIMIT) {
  validateSettings(settings); validateTierConfig(tiers);
  assert(settings.registrationEnabled, 'Registration is currently closed.');
  exact(payload, ['teamId', 'captain', 'ace1', 'ace2', 'selectedTier', 'consent', 'rulesAccepted', ...['whatsappPhone', 'ace1Phone', 'ace2Phone', 'pprcIds'].filter(key => Object.hasOwn(payload || {}, key))], 'Invalid registration fields.');
  assert(typeof payload.teamId === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(payload.teamId), 'Invalid registration identifier.');
  assert(payload.consent === true, 'Player consent is required.');
  assert(payload.rulesAccepted === true, 'Read and accept the tournament rules before registering.');
  assert(['higher', 'both', 'goat_fallback_rising'].includes(payload.selectedTier) || (typeof payload.selectedTier === 'string' && Object.hasOwn(tiers, payload.selectedTier) && tiers[payload.selectedTier].active), 'Select an active tier or a valid tier preference.');
  const pprcIds = validPprcIds(payload.pprcIds);
  const captain = player(payload.captain, true, settings, gapLimit), ace1 = player(payload.ace1, false, settings, gapLimit), ace2 = player(payload.ace2, false, settings, gapLimit);
  const combinedUtr = captain.utr + ace1.utr + ace2.utr, assignedTier = assignSelectedTier(combinedUtr, tiers, payload.selectedTier);
  assert(assignedTier, 'Your team does not qualify for the selected tier. Choose an eligible tier or contact the tournament admin.');
  return { teamId: payload.teamId, captain, ace1, ace2, ...(pprcIds ? { pprcIds } : {}), ...Object.fromEntries(['whatsappPhone', 'ace1Phone', 'ace2Phone'].filter(key => Object.hasOwn(payload, key)).map(key => [key, normalizeWhatsAppPhone(payload[key])])), combinedUtr, selectedTier: payload.selectedTier, assignedTier, listedTiers: listedTiers(combinedUtr, tiers, payload.selectedTier), rulesAccepted: true };
}
// A PPRC rating counts as verified once the player has played more than this many rated matches; until then it shows as "NR".
export const PPRC_VERIFIED_AFTER = 5;
// What the public sees per player: the rating only when verified, otherwise just that it is not rated. The id and the
// provisional number stay private.
export function publicPprc(team) {
  const links = team.pprcLinks;
  if (!links || !Object.keys(links).length) return null;
  // A player's PPRC profile id is shown only when the admin chose to make that link public (the profile carries the full name).
  return Object.fromEntries(['captain', 'ace1', 'ace2'].filter(role => links[role]).map(role => [role, { ...(links[role].matches > PPRC_VERIFIED_AFTER ? { verified: true, rating: links[role].overall } : { verified: false }), ...(links[role].public ? { id: links[role].id } : {}) }]));
}
export function publicRecord(team, settings = DEFAULT_SETTINGS) {
  const pprc = publicPprc(team);
  return { teamId: team.teamId, captainFirstName: team.captain.firstName, captainUtr: team.captain.utr, ace1Utr: team.ace1.utr, ace2Utr: team.ace2.utr, ...(!settings.aceNameMaskingEnabled && team.rulesAccepted === true ? { ace1Name: team.ace1.fullName, ace2Name: team.ace2.fullName } : {}), combinedUtr: team.combinedUtr, assignedTier: team.assignedTier, registeredAt: team.registeredAt, ...(pprc ? { pprc } : {}) };
}
export function initialState() { return { settings: { ...DEFAULT_SETTINGS }, tierConfig: structuredClone(DEFAULT_TIERS), configRevision: 1, registrations: {}, tiers: {} }; }
// First visitor may trigger this through the callable backend. Preserve any existing tournament
// configuration or records; only an absent settings node is a fresh installation.
export function bootstrapState(current) {
  if (current?.settings) return { state: current, result: { created: false } };
  assert(!Object.keys(current?.registrations || {}).length && !Object.values(current?.tiers || {}).some(tier => Object.keys(tier?.teams || {}).length), 'Existing team data needs an administrator review before initialization.');
  const defaults = initialState();
  return { state: { ...defaults, ...(current || {}), settings: defaults.settings, tierConfig: current?.tierConfig && Object.keys(current.tierConfig).length ? current.tierConfig : defaults.tierConfig, configRevision: current?.configRevision || 1 }, result: { created: true } };
}
// The shared libraries report problems as plain errors named ValidationError; the server only shows a clear message for the real class.
export function guard(fn) { try { return fn(); } catch (error) { if (error?.name === 'ValidationError' && !(error instanceof ValidationError)) throw new ValidationError(error.message); throw error; } }
export function applyCalendar(current, payload) {
  assert(current?.settings, 'Save the initial tournament configuration first.');
  const calendar = guard(() => validateCalendar(payload)), state = structuredClone(current);
  state.calendar = calendar;
  return { state, result: { calendar } };
}
export function publicState(state) { return { calendar: calendarOf(state), partnerPosts: state.partnerPosts || {}, earlyBird: state.earlyBird, settings: state.settings, tierConfig: state.tierConfig || {}, configRevision: state.configRevision || 0, tiers: state.tiers || {}, fixtures: state.fixtures || {}, leagueRules: rulesOf(state), season: state.season || { name: DEFAULT_SEASON_NAME }, seasons: state.seasons || {}, schedules: state.schedules || {} }; }
function canonical(value) { return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).filter(key => item[key] !== null && item[key] !== undefined).sort().map(key => [key, item[key]])) : item); }
// One browser (one anonymous sign-in) can register a few teams, not unlimited ones.
export const MAX_TEAMS_PER_BROWSER = 3;
// `login` is the captain's new login account ({ uid, username }); it is added as an owner so signing in on any device manages the team.
// ---------- Tier capacity and waitlist ----------
// Each tier seats `tierCapacity` teams (0 = no limit); later registrations join that tier's waitlist, in order of registration, and are
// seated automatically when a place opens (a withdrawal, or a higher limit).
export function seatTeam(state, record) {
  const cap = rulesOf(state).tierCapacity, waitlisted = [];
  state.tiers ||= {};
  for (const tier of Object.values(state.tiers)) { if (tier.teams) delete tier.teams[record.teamId]; if (tier.waitlist) delete tier.waitlist[record.teamId]; }
  for (const tierId of record.listedTiers || []) {
    const tier = (state.tiers[tierId] ||= { teams: {} });
    tier.teams ||= {};
    if (cap > 0 && Object.keys(tier.teams).length >= cap) { (tier.waitlist ||= {})[record.teamId] = { teamId: record.teamId, captainFirstName: record.captain.firstName, registeredAt: record.registeredAt }; waitlisted.push(tierId); }
    else tier.teams[record.teamId] = publicRecord(record, state.settings);
  }
  return waitlisted;
}
export const waitlistPosition = (state, tierId, teamId) => Object.values(state.tiers?.[tierId]?.waitlist || {}).sort((a, b) => a.registeredAt - b.registeredAt).findIndex(w => w.teamId === teamId) + 1;
const waitlistInfo = (state, record, tierIds) => tierIds.map(tierId => ({ tierId, position: waitlistPosition(state, tierId, record.teamId) }));
// Seats waiting teams while places are free; returns who moved so the admin can tell them.
export function promoteWaitlist(state) {
  const cap = rulesOf(state).tierCapacity, moved = [];
  for (const [tierId, tier] of Object.entries(state.tiers || {})) {
    const queue = Object.values(tier.waitlist || {}).sort((a, b) => a.registeredAt - b.registeredAt);
    for (const waiting of queue) {
      if (cap > 0 && Object.keys(tier.teams || {}).length >= cap) break;
      const record = state.registrations?.[waiting.teamId];
      delete tier.waitlist[waiting.teamId];
      if (record) { (tier.teams ||= {})[waiting.teamId] = publicRecord(record, state.settings); moved.push({ teamId: waiting.teamId, tierId, captainFirstName: record.captain.firstName }); }
    }
    if (tier.waitlist && !Object.keys(tier.waitlist).length) delete tier.waitlist;
  }
  return moved;
}
export function applyRegistration(current, payload, uid, now = Date.now(), login = null) {
  assert(typeof uid === 'string' && uid.length > 0, 'Sign in before registering.');
  assert(current?.settings, 'The admin must initialize tournament settings first.');
  const window = registrationWindow(current.settings, current.calendar, now);
  assert(window.open, window.reason);
  for (const [key, label] of [['whatsappPhone', 'captain'], ['ace1Phone', 'Ace 1'], ['ace2Phone', 'Ace 2']]) assert(Object.hasOwn(payload || {}, key), `Enter ${label}’s WhatsApp number to register.`);
  const team = validateRegistration(payload, current.settings, current.tierConfig || {}, rulesOf(current).utrGapLimit);
  const state = structuredClone(current), previous = state.registrations?.[team.teamId];
  if (previous) {
    const { ownerUid, registeredAt, owners, captainUid, captainUsername, ...saved } = previous;
    assert(ownerUid === uid && canonical(saved) === canonical(team), 'This registration identifier is already in use.');
    return { state, result: { teamId: previous.teamId, assignedTier: previous.assignedTier, combinedUtr: previous.combinedUtr, listedTiers: previous.listedTiers || [previous.assignedTier], waitlisted: waitlistInfo(state, previous, Object.keys(state.tiers || {}).filter(id => state.tiers[id].waitlist?.[previous.teamId])) } };
  }
  const already = Object.values(state.registrations || {}).filter(r => r.ownerUid === uid).length;
  assert(already < MAX_TEAMS_PER_BROWSER, `You have already registered ${MAX_TEAMS_PER_BROWSER} teams from this browser. Ask the tournament admin if you need to register more.`);
  const record = { ...team, ownerUid: uid, registeredAt: now, ...(login ? { captainUid: login.uid, captainUsername: login.username, owners: { [login.uid]: true } } : {}) };
  state.registrations ||= {}; state.registrations[team.teamId] = record;
  state.teamsByOwner ||= {}; state.teamsByOwner[uid] ||= {}; state.teamsByOwner[uid][team.teamId] = true;
  if (login) { state.teamsByOwner[login.uid] ||= {}; state.teamsByOwner[login.uid][team.teamId] = true; }
  const waitlisted = seatTeam(state, record);
  return { state, result: { teamId: record.teamId, assignedTier: record.assignedTier, combinedUtr: record.combinedUtr, listedTiers: record.listedTiers, created: true, waitlisted: waitlistInfo(state, record, waitlisted) } };
}
// Admin: the early-bird dates and late surcharge (shown on the rules, the registration page and a site-wide bar).
export function applyEarlyBird(current, payload) {
  let plan;
  try { plan = validateEarlyBird(payload); }
  catch (error) { throw new ValidationError(error.message); }   // so the server answers with the clear message, not "internal"
  return { state: { ...structuredClone(current || initialState()), earlyBird: plan }, result: { earlyBird: plan } };
}
export function applyConfiguration(current, payload) {
  exact(payload, ['settings', 'tierConfig', 'expectedRevision'], 'Invalid configuration request.');
  const state = structuredClone(current || initialState());
  assert(payload.expectedRevision === (current?.configRevision || 0), 'Configuration changed in another session. Reload settings before saving.');
  const settings = validateSettings(payload.settings), tiers = validateTierConfig(payload.tierConfig);
  const removed = Object.keys(state.tierConfig || {}).filter(id => !Object.hasOwn(tiers, id));
  assert(!Object.values(state.registrations || {}).some(team => (team.listedTiers || [team.assignedTier]).some(id => removed.includes(id))), 'A removed tier still has teams. Deactivate it, save, and recalculate before removing it.');
  state.settings = settings; state.tierConfig = tiers; state.configRevision = (current?.configRevision || 0) + 1;
  for (const id of removed) if (state.tiers) delete state.tiers[id];
  if (state.tiers) for (const [tierId, tier] of Object.entries(state.tiers)) for (const teamId of Object.keys(tier.teams || {})) { const team = state.registrations?.[teamId]; if (team) tier.teams[teamId] = publicRecord(team, settings); }
  return { state, result: { configRevision: state.configRevision } };
}
export function applyRecalculation(current) {
  assert(current?.settings, 'Save the initial tournament configuration first.');
  validateTierConfig(current.tierConfig || {});
  const state = structuredClone(current), summary = { reviewed: 0, moved: 0, unchanged: 0, unassigned: 0 };
  state.tiers = {}; state.teamsByOwner = {};
  for (const team of Object.values(state.registrations || {}).sort((a, b) => a.registeredAt - b.registeredAt)) {   // earliest registrations keep their places
    for (const uid of [team.ownerUid, ...Object.keys(team.owners || {})].filter(Boolean)) { state.teamsByOwner[uid] ||= {}; state.teamsByOwner[uid][team.teamId] = true; }
    for (const key of ['captain', 'ace1', 'ace2']) if (Number.isInteger(team[key].singlesUtr)) team[key].utr = playerUtr(team[key].singlesUtr, team[key].doublesUtr ?? null, rulesOf(state).utrGapLimit);
    const total = team.captain.utr + team.ace1.utr + team.ace2.utr;
    const assigned = assignSelectedTier(total, state.tierConfig, team.selectedTier);
    summary.reviewed++; if (assigned === (team.assignedTier ?? null) && JSON.stringify(listedTiers(total, state.tierConfig, team.selectedTier)) === JSON.stringify(team.listedTiers || (team.assignedTier ? [team.assignedTier] : []))) summary.unchanged++; else summary.moved++;
    if (!assigned) summary.unassigned++;
    team.combinedUtr = total; team.assignedTier = assigned; team.listedTiers = listedTiers(total, state.tierConfig, team.selectedTier);
    seatTeam(state, team);
  }
  return { state, result: summary };
}
export function registrationsCsv(teams, tiers, { captainOnly = false } = {}) {
  const columns = ['Team ID', 'Captain first name', 'Captain WhatsApp', 'Captain UTR', 'Ace 1 full name', 'Ace 1 WhatsApp', 'Ace 1 UTR', 'Ace 2 full name', 'Ace 2 WhatsApp', 'Ace 2 UTR', 'Combined UTR', 'Selected tier', 'Assigned tier', 'Registered at', 'Captain last name'];
  const cell = value => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  const rows = Object.values(teams || {}).map(t => [t.teamId, t.captain.firstName, t.whatsappPhone || '', formatUtr(t.captain.utr), t.ace1.fullName, t.ace1Phone || '', formatUtr(t.ace1.utr), t.ace2.fullName, t.ace2Phone || '', formatUtr(t.ace2.utr), formatUtr(t.combinedUtr), tiers[t.selectedTier]?.name || t.selectedTier, tiers[t.assignedTier]?.name || 'Unassigned', new Date(t.registeredAt).toISOString(), t.captain.lastName || '']);
  // Captain-only exports drop both Aces (name, WhatsApp, UTR): columns 4–9.
  const keep = (row) => (captainOnly ? row.filter((_, i) => i < 4 || i > 9) : row);
  return [columns, ...rows].map(row => keep(row).map(cell).join(',')).join('\r\n');
}

export function validateLeagueRules(value) {
  exact(value, Object.keys(DEFAULT_LEAGUE_RULES), 'Invalid league rules.');
  assert(integer(value.utrGapLimit, 0, 1650), 'The singles/doubles gap must be between 0.00 and 16.50.');
  assert(integer(value.pointsPerWin, 1, 10), 'Points per encounter win must be 1–10.');
  assert(integer(value.playoffThreshold, 2, 64), 'The playoff team threshold must be 2–64.');
  assert(integer(value.playoffSpotsSmall, 2, 4) && integer(value.playoffSpotsLarge, 2, 4), 'Playoff spots must be 2, 3 or 4.');
  assert(integer(value.singlesMinPercent, 0, MAX_SINGLES_PERCENT), `The singles minimum must be 0–${MAX_SINGLES_PERCENT}%. Every encounter has one singles match shared by three players, so a higher minimum cannot work for everyone (30% is the default).`);
  assert(integer(value.tierCapacity, 0, 64), 'Teams per tier must be 0–64 (0 = no limit). Teams beyond it join the waitlist.');
  assert(typeof value.challengeEnabled === 'boolean', 'Turn the challenge rule on or off.');
  for (const key of ['challengerFrom', 'challengerTo', 'targetFrom', 'targetTo']) assert(integer(value[key], 1, 64), 'Challenge positions must be 1–64.');
  assert(value.challengerFrom <= value.challengerTo && value.targetFrom <= value.targetTo && value.targetTo < value.challengerFrom, 'Challengers must sit below the teams they can challenge.');
  assert(integer(value.challengeCutoffRounds, 0, 52), 'The challenge cutoff must be 0–52 rounds.');
  return { ...value };
}
export function applyLeagueRules(current, payload) {
  assert(current?.settings, 'Save the initial tournament configuration first.');
  const state = structuredClone(current);
  state.leagueRules = validateLeagueRules(payload);
  const promoted = promoteWaitlist(state);   // a higher limit seats waiting teams straight away
  return { state, result: { leagueRules: state.leagueRules, promoted } };
}
