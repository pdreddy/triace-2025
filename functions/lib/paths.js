// Where tournament data lives in the Realtime Database. Both the web app (VITE_DB_*) and the
// Cloud Functions (TRAICE_DB_*) read these, so Season 2 (the live tournament and its closed
// seasons) and Season 1 (the imported legacy season) sit in the same database.
export const DEFAULT_DB_ROOT = 'traice2_0';
const SEGMENT = /^[A-Za-z0-9_-]+$/; // Realtime Database keys cannot contain . $ # [ ] /

export function cleanPath(value, label) {
  const path = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!path || !path.split('/').every(part => SEGMENT.test(part))) throw new Error(`${label} “${value}” is not a valid database path. Use letters, numbers, - and _, separated by /.`);
  return path;
}

export function resolveDbPaths({ root, season1 } = {}) {
  const resolvedRoot = cleanPath(root || DEFAULT_DB_ROOT, 'Database root');
  const resolvedSeason1 = cleanPath(season1 || `${resolvedRoot}/season1`, 'Season 1 path');
  return { root: resolvedRoot, season1: resolvedSeason1, season1UnderRoot: resolvedSeason1.startsWith(`${resolvedRoot}/`) };
}
