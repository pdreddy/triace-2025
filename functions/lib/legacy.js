// Validation for the Season 1 import. The admin's browser sends the season object; it is written
// to the configured Season 1 path. Shape checks only: this is admin-entered historical data.
import { ValidationError } from './tournament.js';

export const MAX_LEGACY_BYTES = 400000;
export function validateLegacySeason(season) {
  const fail = message => { throw new ValidationError(message); };
  if (!season || typeof season !== 'object' || Array.isArray(season)) fail('Send the Season 1 data to import.');
  if (season.id !== 's1' || season.legacy !== true) fail('This is not the Season 1 data.');
  if (typeof season.name !== 'string' || !season.name.trim() || season.name.length > 60) fail('Season 1 needs a name of 1–60 characters.');
  for (const key of ['tierConfig', 'tiers', 'fixtures', 'published']) if (!season[key] || typeof season[key] !== 'object') fail(`Season 1 data is missing “${key}”.`);
  const bytes = JSON.stringify(season).length;
  if (bytes > MAX_LEGACY_BYTES) fail(`Season 1 data is too large (${bytes} bytes).`);
  return season;
}
