// Opens the Realtime Database with the service account named in GOOGLE_APPLICATION_CREDENTIALS (firebase-admin is
// modular: it has no default export), and checks that it can really be reached, so a wrong URL, key or network fails
// with a clear message instead of waiting forever.
import fs from 'node:fs';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

export const withTimeout = (promise, ms, message) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

export async function openDatabase(databaseURL, { timeoutMs = Number(process.env.RTDB_TIMEOUT_MS) || 30000 } = {}) {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!key) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to the path of your service-account key file.');
  if (!fs.existsSync(key)) throw new Error(`The key file was not found: ${key}\nUse the real path of the JSON key you downloaded from Firebase (Project settings > Service accounts), for example ~/Downloads/multiclub-890ea-firebase-adminsdk-xxxxx.json. "/full/path/to/key.json" in the instructions is only a placeholder.`);
  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), databaseURL });
  const db = getDatabase(app);
  await withTimeout(db.ref('importLog').limitToFirst(1).once('value'), timeoutMs,
    `Could not reach ${databaseURL} within ${Math.round(timeoutMs / 1000)} seconds. Check the database URL, your internet connection, and that the key file belongs to this Firebase project.`);
  return db;
}
