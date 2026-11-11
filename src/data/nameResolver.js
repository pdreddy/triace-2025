// Matches hand-typed names (Season 1) to the shared PPRC player list; pure, so it is unit-tested.
import decisions from '../../scripts/migration/name-decisions.json' with { type: 'json' };
import { createRegistry, nameKey, playerIdFor, resolveName } from '../../functions/lib/pprc.js';

const decidedBy = new Map(Object.entries(decisions).map(([k, v]) => [nameKey(k), v])); // spelling, case and punctuation do not matter
const IGNORE = '__ignore__';

export function makeResolver(list = []) {
  const registry = createRegistry(list.map(p => ({ id: p.id, name: p.name })));
  const byId = new Map(list.map(p => [p.id, p]));
  const decided = (raw, teamId) => {
    const hit = (teamId && decidedBy.get(nameKey(`Team ${teamId}::${raw}`))) ?? decidedBy.get(nameKey(raw));
    return hit && hit !== IGNORE ? hit : null;
  };
  const named = (name, id) => {
    if (!registry.byId.has(id)) return { name, id: null };
    const p = byId.get(id);
    return { name: p.name, id, ...(Number.isFinite(p.overall) && p.played > 5 ? { rating: p.overall, singles: p.singles, doubles: p.doubles, verified: true } : {}) }; // verified: more than 5 rated courts
  };
  return function resolve(rawName, teamId) {
    const raw = String(rawName || '').trim();
    if (!raw) return { name: '', id: null };
    const choice = decided(raw, teamId);
    if (choice) {
      const id = playerIdFor(choice);
      if (registry.byId.has(id)) return named(choice, id);
      const near = resolveName(registry, choice);
      return near.id ? named(choice, near.id) : { name: choice, id: null };
    }
    const found = resolveName(registry, raw);
    return found.id ? named(raw, found.id) : { name: raw, id: null };
  };
}
