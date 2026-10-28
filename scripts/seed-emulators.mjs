import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { initialState } from '../functions/lib/tournament.js';
const password = process.env.TRAICE_ADMIN_PASSWORD;
if (!password || password.length < 8) throw new Error('Set TRAICE_ADMIN_PASSWORD (8+ characters) in the shell. It is used only for the demo admin.');
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
const app = initializeApp({ projectId: 'demo-traice-2', databaseURL: 'https://demo-traice-2-default-rtdb.firebaseio.com' });
const auth = getAuth(app), email = 'reddi2026@traice.local';
let user; try { user = await auth.getUserByEmail(email); await auth.updateUser(user.uid, { password }); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; user = await auth.createUser({ email, password }); }
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
const node = getDatabase(app).ref('traice2_0');
if (!(await node.get()).exists()) await node.set(initialState());
console.log('Demo emulator admin and tournament are initialized. Existing registrations were preserved.');
process.exit(0);
