// Where tournament data lives in the Realtime Database. Both the web app (VITE_DB_*) and the
// Cloud Functions (TRAICE_DB_*) read these, so Season 2 (the live tournament and its closed
// seasons) and Season 1 (the imported legacy season) sit in the same database.
export const DEFAULT_DB_ROOT = 'traice2_0';
const UNSAFE_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
const SHARED_PUBLIC_ROOTS = ['pprcMaster', 'pprcClubs'];
const SEGMENT = /^[A-Za-z0-9_-]+$/; // Realtime Database keys cannot contain . $ # [ ] /

// Every child node the tournament itself owns under the root. Season 1 may never be written on top of one.
export const RESERVED_ROOT_CHILDREN = ['settings', 'tierConfig', 'configRevision', 'tiers', 'registrations', 'teamsByOwner', 'fixtures', 'leagueRules', 'season', 'seasons', 'schedules', 'archive', 'earlyBird', 'calendar', 'partnerPosts', 'partnerPrivate', 'partnerByOwner', 'withdrawn', 'demoLogins', 'demoAdmins'];

export function cleanPath(value, label) {
  const path = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!path || !path.split('/').every(part => SEGMENT.test(part) && !UNSAFE_SEGMENTS.has(part))) throw new Error(`${label} “${value}” is not a valid database path. Use letters, numbers, - and _, separated by /.`);
  return path;
}
const startsWithPath = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

export function resolveDbPaths({ root, season1 } = {}) {
  const resolvedRoot = cleanPath(root || DEFAULT_DB_ROOT, 'Database root');
  const resolvedSeason1 = cleanPath(season1 || `${resolvedRoot}/season1`, 'Season 1 path');
  for (const shared of SHARED_PUBLIC_ROOTS) {
    if (startsWithPath(resolvedRoot, shared) || startsWithPath(resolvedSeason1, shared)) {
      throw new Error(`Tournament and Season 1 paths cannot overlap shared public data “${shared}”. Choose separate paths to protect private registrations and shared club records.`);
    }
  }
  // The Season 1 import replaces everything at its path, so it must never overlap live tournament data.
  if (resolvedSeason1 === resolvedRoot) throw new Error(`The Season 1 path cannot be the database root “${resolvedRoot}”: importing would replace the whole tournament.`);
  if (startsWithPath(resolvedRoot, resolvedSeason1)) throw new Error(`The Season 1 path “${resolvedSeason1}” contains the database root “${resolvedRoot}”: importing would replace the whole tournament.`);
  const underRoot = resolvedSeason1.startsWith(`${resolvedRoot}/`);
  if (underRoot) {
    const first = resolvedSeason1.slice(resolvedRoot.length + 1).split('/')[0];
    if (RESERVED_ROOT_CHILDREN.includes(first)) throw new Error(`The Season 1 path “${resolvedSeason1}” is inside “${first}”, which the tournament uses (${RESERVED_ROOT_CHILDREN.join(', ')}). Choose a different path, for example “${resolvedRoot}/season1”.`);
  }
  return { root: resolvedRoot, season1: resolvedSeason1, season1UnderRoot: underRoot };
}
