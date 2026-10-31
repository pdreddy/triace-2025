import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut, getIdTokenResult, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, ref, onValue, connectDatabaseEmulator } from 'firebase/database';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
const env = import.meta.env;
function errorMessage(error) { return error?.message?.replace(/^Firebase:\s*/, '').replace(/\s*\(auth\/[^)]+\)\.?$/, '') || 'The operation failed. Please retry.'; }
// Sign-in failures worth telling the admin apart (Firebase reports wrong password and unknown user the same way).
const LOGIN_ERRORS = {
  'auth/invalid-credential': 'Wrong password, or no account exists for this username in Firebase Authentication.',
  'auth/wrong-password': 'Wrong password.',
  'auth/user-not-found': 'No account exists for this username in Firebase Authentication.',
  'auth/operation-not-allowed': 'Email/Password sign-in is turned off. Enable it in Firebase Console → Authentication → Sign-in method.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
  'auth/user-disabled': 'This admin account is disabled in Firebase Authentication.',
  'auth/network-request-failed': 'Could not reach Firebase. Check your connection.'
};
export function createFirebaseService() {
  const config = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, databaseURL: env.VITE_FIREBASE_DATABASE_URL, projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID };
  if (!config.apiKey || !config.databaseURL || !config.projectId) throw new Error('Firebase setup is missing. Add the web configuration to .env.local, or run npm run demo.');
  const app = initializeApp(config), auth = getAuth(app), database = getDatabase(app), functions = getFunctions(app, 'us-central1');
  if (env.VITE_USE_EMULATORS === 'true') {
    if (!['localhost', '127.0.0.1'].includes(location.hostname) || !config.projectId.startsWith('demo-')) throw new Error('Emulators require a loopback hostname and a demo- project.');
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(database, '127.0.0.1', 9000); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  let stopped = false, anonymousPromise;
  const withError = fn => async (...args) => { try { return await fn(...args); } catch (error) { throw new Error(errorMessage(error)); } };
  return {
    mode: env.VITE_USE_EMULATORS === 'true' ? 'Firebase Emulators' : 'Firebase',
    subscribePublic(callback, onError) {
      const state = {}, ready = new Set(), keys = ['settings', 'tierConfig', 'configRevision', 'tiers'];
      const off = keys.map(key => onValue(ref(database, `traice2_0/${key}`), snapshot => { state[key] = snapshot.val() ?? (key === 'configRevision' ? 0 : key === 'settings' ? null : {}); ready.add(key); if (ready.size === keys.length) callback({ ...state }); }, error => onError(new Error(errorMessage(error)))));
      return () => off.forEach(unsubscribe => unsubscribe());
    },
    subscribeConnection(callback) { return onValue(ref(database, '.info/connected'), snapshot => callback(snapshot.val() === true)); },
    subscribeAuth(callback, onError) {
      stopped = false;
      const unsubscribe = onAuthStateChanged(auth, async user => {
        if (!user) {
          callback({ uid: null, admin: false, anonymous: true });
          if (!anonymousPromise) anonymousPromise = signInAnonymously(auth).catch(error => { if (!stopped) onError(new Error(errorMessage(error))); }).finally(() => { anonymousPromise = null; });
          return;
        }
        try { const token = await getIdTokenResult(user); if (!stopped && auth.currentUser?.uid === user.uid) callback({ uid: user.uid, email: user.email, admin: token.claims.admin === true, anonymous: user.isAnonymous }); }
        catch (error) { if (!stopped) onError(new Error(errorMessage(error))); }
      });
      return () => { stopped = true; unsubscribe(); };
    },
    subscribePrivate(callback, onError) { return onValue(ref(database, 'traice2_0/registrations'), snapshot => callback(snapshot.val() || {}), error => onError(new Error(errorMessage(error)))); },
    async login(username, password) {
      const alias = env.VITE_ADMIN_USERNAME || 'reddi2026', email = env.VITE_ADMIN_EMAIL || 'reddi2026@traice.local';
      try { await signInWithEmailAndPassword(auth, username.trim().toLowerCase() === alias.toLowerCase() ? email : username.trim(), password); }
      catch (error) { throw new Error(LOGIN_ERRORS[error?.code] || errorMessage(error)); }
    },
    logout: withError(() => signOut(auth)),
    register: withError(async payload => (await httpsCallable(functions, 'registerTeam')(payload)).data),
    saveConfiguration: withError(async payload => (await httpsCallable(functions, 'saveConfiguration')(payload)).data),
    recalculate: withError(async () => (await httpsCallable(functions, 'recalculateTiers')({})).data)
  };
}
