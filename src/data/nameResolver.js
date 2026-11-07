// Matches hand-typed names (Season 1) to the shared PPRC player list; pure, so it is unit-tested.
import decisions from '../../scripts/migration/name-decisions.json' with { type: 'json' };
import { createRegistry, playerIdFor, resolveName } from '../../functions/lib/pprc.js';

const IGNORE = '__ignore__';

export function makeResolver(list = []) {
  const registry = createRegistry(list.map(p => ({ id: p.id, name: p.name })));
  const decided = (raw, teamId) => {
    const hit = (teamId && decisions[`Team ${String(teamId).toUpperCase()}::${raw}`]) ?? decisions[raw];
    return hit && hit !== IGNORE ? hit : null;
  };
  const named = (name, id) => (registry.byId.has(id) ? { name: registry.byId.get(id).name, id } : { name, id: null });
  return function resolve(rawName, teamId) {
    const raw = String(rawName || '').trim();
    if (!raw) return { name: '', id: null };
    const choice = decided(raw, teamId);
    if (choice) return named(choice, playerIdFor(choice));
    const found = resolveName(registry, raw);
    return found.id ? named(raw, found.id) : { name: raw, id: null };
  };
}
