// Project-owner tool: save a full backup of the tournament (registrations with private details, fixtures, results, calendar,
// rules, partner board, Season 1) to a timestamped JSON file under backups/. Read-only: it never changes the database.
//   GOOGLE_CLOUD_PROJECT=<project> node scripts/backup.cjs        (or: npm run backup)
// Needs Google Application Default Credentials (gcloud auth application-default login). The file holds phone numbers: keep it private.
// backups/ is git-ignored. Optional: TRAICE_DB_ROOT, TRAICE_DB_SEASON1_PATH, TRAICE_DATABASE_URL, TRAICE_BACKUP_DIR.
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

function fromEnvFile() {
  try { return Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()])); } catch { return {}; }
}
async function main() {
  const file = fromEnvFile(), project = process.env.GOOGLE_CLOUD_PROJECT || file.VITE_FIREBASE_PROJECT_ID;
  if (!project) throw new Error('Usage: GOOGLE_CLOUD_PROJECT=your-project node scripts/backup.cjs');
  const databaseURL = process.env.TRAICE_DATABASE_URL || file.VITE_FIREBASE_DATABASE_URL || `https://${project}-default-rtdb.firebaseio.com`;
  const root = process.env.TRAICE_DB_ROOT || file.VITE_DB_ROOT || 'traice2_0', season1 = process.env.TRAICE_DB_SEASON1_PATH || file.VITE_DB_SEASON1_PATH || `${root}/season1`;
  initializeApp({ credential: applicationDefault(), projectId: project, databaseURL });
  const db = getDatabase(), read = async p => (await db.ref(p).get()).val();
  const data = { root: await read(root) };
  if (!season1.startsWith(`${root}/`)) data.season1 = await read(season1);
  if (!data.root) throw new Error(`Nothing found at “${root}” in ${databaseURL}. Check the project and database path.`);
  const teams = Object.keys(data.root.registrations || {}).length;
  const dir = process.env.TRAICE_BACKUP_DIR || path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const out = path.join(dir, `traice-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(out, JSON.stringify({ backedUpAt: new Date().toISOString(), project, databaseURL, rootPath: root, season1Path: season1, ...data }, null, 2), { mode: 0o600 });
  console.log(`Backup saved: ${out}\n  ${teams} registrations, ${Object.keys(data.root.fixtures || {}).length} tiers with fixtures.\n  It contains private phone numbers: keep it safe and do not commit it.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
