// DEVELOPMENT ONLY. Seeds the demo ladder into the LOCAL Firebase emulators. The hosts and the demo- project are
// hardcoded: this script cannot reach a real project and never reads production credentials.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { DEMO_ROSTER, seedDemoLadder, demoUid } from './ladder-dev-fixtures.mjs';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
const app = initializeApp({ projectId: 'demo-traice-2', databaseURL: 'https://demo-traice-2-default-rtdb.firebaseio.com' });
const db = getDatabase(app), auth = getAuth(app), ladder = db.ref('traice2_0/ladder');
if ((await ladder.get()).exists()) throw new Error('A local ladder already exists; it is left as it is.');
for (const [playerId, record] of Object.entries(DEMO_ROSTER)) {
  const uid = demoUid(playerId), username = playerId.replaceAll('_', '');
  if (!(await auth.getUser(uid).catch(() => null))) await auth.createUser({ uid, email: `${username}@captain.traice.local`, password: 'ladder1234' });
  if (!(await db.ref(`pprcMaster/players/${playerId}`).get()).exists()) await db.ref(`pprcMaster/players/${playerId}`).set({ name: record.name, seed: { singles: record.utr, doubles: record.utr } });
}
await ladder.set(JSON.parse(JSON.stringify(seedDemoLadder(null, Date.now()))));
console.log('Local ladder ready. Sign in at /captain as ladderdemo1 … ladderdemo12 with password ladder1234 (emulator-only accounts).');
process.exit(0);
