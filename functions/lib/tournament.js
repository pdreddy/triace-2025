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
export function playerUtr(singlesUtr, doublesUtr = null) {
  if (doublesUtr == null) return singlesUtr;
  return Math.abs(singlesUtr - doublesUtr) > UTR_GAP_LIMIT ? Math.round((singlesUtr + doublesUtr) / 2) : Math.max(singlesUtr, doublesUtr);
}
export function parseUtr(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) throw new ValidationError('Enter a numeric UTR with up to two decimal places.');
  return Math.round(Number(text) * 100);
}
function assert(condition, message) { if (!condition) throw new ValidationError(message); }
function exact(value, keys, message) { assert(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), message); }
function integer(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
function name(value, label, max = 80) { assert(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value), `${label} is required (up to ${max} characters).`); return value.trim(); }
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
    assert(/^[a-z][a-z0-9_-]{0,39}$/.test(id) && !['higher', 'constructor', 'prototype'].includes(id), 'Tier IDs must use lowercase letters, numbers, hyphens or underscores, and cannot be "higher".');
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
function player(value, captain, settings) {
  exact(value, [captain ? 'firstName' : 'fullName', 'singlesUtr', 'doublesUtr'], 'Invalid player fields.');
  const key = captain ? 'firstName' : 'fullName';
  const label = captain ? 'Captain first name' : 'Ace full name';
  const clean = name(value[key], label, captain ? 40 : 80);
  if (captain) assert(!/\s/.test(clean), 'Enter only the captain’s first name, without a surname.');
  assert(integer(value.singlesUtr, settings.minPlayerUtr, settings.maxPlayerUtr), `${label}: UTR must be ${formatUtr(settings.minPlayerUtr)}–${formatUtr(settings.maxPlayerUtr)}.`);
  assert(value.doublesUtr === null || integer(value.doublesUtr, settings.minPlayerUtr, settings.maxPlayerUtr), `${label}: optional doubles UTR must be within the individual limits.`);
  return { [key]: clean, singlesUtr: value.singlesUtr, doublesUtr: value.doublesUtr, utr: playerUtr(value.singlesUtr, value.doublesUtr) };
}
export function validateRegistration(payload, settings, tiers) {
  validateSettings(settings); validateTierConfig(tiers);
  assert(settings.registrationEnabled, 'Registration is currently closed.');
  exact(payload, ['teamId', 'captain', 'ace1', 'ace2', 'selectedTier', 'consent', 'rulesAccepted'], 'Invalid registration fields.');
  assert(typeof payload.teamId === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(payload.teamId), 'Invalid registration identifier.');
  assert(payload.consent === true, 'Player consent is required.');
  assert(payload.rulesAccepted === true, 'Read and accept the tournament rules before registering.');
  assert(payload.selectedTier === 'higher' || payload.selectedTier === 'both' || (typeof payload.selectedTier === 'string' && Object.hasOwn(tiers, payload.selectedTier) && tiers[payload.selectedTier].active), 'Select an active tier or the higher-tier interest option.');
  const captain = player(payload.captain, true, settings), ace1 = player(payload.ace1, false, settings), ace2 = player(payload.ace2, false, settings);
  const combinedUtr = captain.utr + ace1.utr + ace2.utr, assignedTier = assignSelectedTier(combinedUtr, tiers, payload.selectedTier);
  assert(assignedTier, 'Your team does not qualify for the selected tier. Choose an eligible tier or contact the tournament admin.');
  return { teamId: payload.teamId, captain, ace1, ace2, combinedUtr, selectedTier: payload.selectedTier, assignedTier, listedTiers: listedTiers(combinedUtr, tiers, payload.selectedTier), rulesAccepted: true };
}
export function publicRecord(team, settings = DEFAULT_SETTINGS) {
  return { teamId: team.teamId, captainFirstName: team.captain.firstName, captainUtr: team.captain.utr, ace1Utr: team.ace1.utr, ace2Utr: team.ace2.utr, ...(!settings.aceNameMaskingEnabled && team.rulesAccepted === true ? { ace1Name: team.ace1.fullName, ace2Name: team.ace2.fullName } : {}), combinedUtr: team.combinedUtr, assignedTier: team.assignedTier, registeredAt: team.registeredAt };
}
export function initialState() { return { settings: { ...DEFAULT_SETTINGS }, tierConfig: structuredClone(DEFAULT_TIERS), configRevision: 1, registrations: {}, tiers: {} }; }
export function publicState(state) { return { settings: state.settings, tierConfig: state.tierConfig || {}, configRevision: state.configRevision || 0, tiers: state.tiers || {} }; }
function canonical(value) { return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).filter(key => item[key] !== null && item[key] !== undefined).sort().map(key => [key, item[key]])) : item); }
export function applyRegistration(current, payload, uid, now = Date.now()) {
  assert(typeof uid === 'string' && uid.length > 0, 'Sign in before registering.');
  assert(current?.settings, 'The admin must initialize tournament settings first.');
  const team = validateRegistration(payload, current.settings, current.tierConfig || {});
  const state = structuredClone(current), previous = state.registrations?.[team.teamId];
  if (previous) {
    const { ownerUid, registeredAt, ...saved } = previous;
    assert(ownerUid === uid && canonical(saved) === canonical(team), 'This registration identifier is already in use.');
    return { state, result: { teamId: previous.teamId, assignedTier: previous.assignedTier, combinedUtr: previous.combinedUtr, listedTiers: previous.listedTiers || [previous.assignedTier] } };
  }
  const record = { ...team, ownerUid: uid, registeredAt: now };
  state.registrations ||= {}; state.registrations[team.teamId] = record;
  state.tiers ||= {};
  for (const tierId of team.listedTiers) { state.tiers[tierId] ||= { teams: {} }; state.tiers[tierId].teams ||= {}; state.tiers[tierId].teams[team.teamId] = publicRecord(record, state.settings); }
  return { state, result: { teamId: record.teamId, assignedTier: record.assignedTier, combinedUtr: record.combinedUtr, listedTiers: record.listedTiers } };
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
  state.tiers = {};
  for (const team of Object.values(state.registrations || {})) {
    for (const key of ['captain', 'ace1', 'ace2']) if (Number.isInteger(team[key].singlesUtr)) team[key].utr = playerUtr(team[key].singlesUtr, team[key].doublesUtr ?? null);
    const total = team.captain.utr + team.ace1.utr + team.ace2.utr;
    const assigned = assignSelectedTier(total, state.tierConfig, team.selectedTier);
    summary.reviewed++; if (assigned === (team.assignedTier ?? null) && JSON.stringify(listedTiers(total, state.tierConfig, team.selectedTier)) === JSON.stringify(team.listedTiers || (team.assignedTier ? [team.assignedTier] : []))) summary.unchanged++; else summary.moved++;
    if (!assigned) summary.unassigned++;
    team.combinedUtr = total; team.assignedTier = assigned; team.listedTiers = listedTiers(total, state.tierConfig, team.selectedTier);
    for (const tierId of team.listedTiers) { state.tiers[tierId] ||= { teams: {} }; state.tiers[tierId].teams[team.teamId] = publicRecord(team, state.settings); }
  }
  return { state, result: summary };
}
export function registrationsCsv(teams, tiers) {
  const columns = ['Team ID', 'Captain first name', 'Captain UTR', 'Ace 1 full name', 'Ace 1 UTR', 'Ace 2 full name', 'Ace 2 UTR', 'Combined UTR', 'Selected tier', 'Assigned tier', 'Registered at'];
  const cell = value => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  const rows = Object.values(teams || {}).map(t => [t.teamId, t.captain.firstName, formatUtr(t.captain.utr), t.ace1.fullName, formatUtr(t.ace1.utr), t.ace2.fullName, formatUtr(t.ace2.utr), formatUtr(t.combinedUtr), tiers[t.selectedTier]?.name || t.selectedTier, tiers[t.assignedTier]?.name || 'Unassigned', new Date(t.registeredAt).toISOString()]);
  return [columns, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}
