import { resolveDbPaths } from '../../functions/lib/paths.js';
const env = import.meta.env;
// Build-time settings: VITE_DB_ROOT and VITE_DB_SEASON1_PATH (see .env.example).
export const dbPaths = () => resolveDbPaths({ root: env.VITE_DB_ROOT, season1: env.VITE_DB_SEASON1_PATH });
