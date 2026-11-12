// Deliberately hardcoded to a demo project and loopback emulators; never reads production credentials.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { applySinglesLadder } from '../functions/lib/singlesLadder.js';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
const app = initializeApp({ projectId: 'demo-traice-2', databaseURL: 'https://demo-traice-2-default-rtdb.firebaseio.com' });
const db = getDatabase(app), auth = getAuth(app), root = db.ref('traice2_0');
if ((await root.child('singlesLadder').get()).exists()) throw new Error('Local ladder already exists; preserving it.');
const accounts = [];
for (let n = 1; n <= 4; n++) {
  const uid = `ladder_demo_${n}`, username = `ladder${n}`, playerId = `ladder_demo_player_${n}`, name = `Demo Player ${n}`;
  let account = await auth.getUser(uid).catch(() => null);
  if (!account) account = await auth.createUser({ uid, email: `${username}@captain.traice.local`, password: 'ladder1234' });
  if (!(await db.ref(`pprcMaster/players/${playerId}`).get()).exists()) await db.ref(`pprcMaster/players/${playerId}`).set({ id: playerId, name });
  accounts.push({ uid, username, playerId, name });
}
await root.transaction(current => {
  if (current?.singlesLadder) return;
  let state = current || {};
  for (const a of accounts) {
    state = applySinglesLadder(state, { action:'enroll', playerId:a.playerId, name:a.name }, { uid:'demo_seed',admin:true }, Date.now(), `enroll_${a.uid}`).state;
    state = applySinglesLadder(state, { action:'link', playerId:a.playerId, uid:a.uid }, { uid:'demo_seed',admin:true }, Date.now(), `link_${a.uid}`).state;
  }
  return applySinglesLadder(state,{action:'open'}, {uid:'demo_seed',admin:true}, Date.now(),'open_demo').state;
});
console.log('Local ladder ready. Player usernames: ladder1–ladder4. Password for newly created accounts: ladder1234.');
process.exit(0);
