import { applyLadder, isKey as isLadderKey } from './lib/singlesLadder/engine.js';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getStorage } from 'firebase-admin/storage';
import { registrationsText } from './lib/backupText.js';
import { randomUUID, randomInt } from 'node:crypto';
import { applyCreatePost, applyExpressInterest, applyClosePost, applyMarkPicked, applyReopenPost } from './lib/partners.js';
import { applyRegistration, applyEarlyBird, applyConfiguration, applyRecalculation, applyLeagueRules, applyCalendar, bootstrapState, ValidationError } from './lib/tournament.js';
import { applyGenerateFixtures, applyGeneratePlayoffs, applySubmitResult, applyReviewResult, applyManageSeason, applySetSchedule, applyMoveFixture, applyIssueChallenge, applyUpdateTeam, applyLinkPprc, applyWithdrawTeam, applySetCaptainLogin, applyAutoSchedule, applyAddBuffer } from './lib/league.js';
import { applyUtrUpdates, validateUtrUpdates } from './lib/pprcSync.js';
import { clean } from './lib/pprcImport.js';
import { adminStatus } from './lib/adminAccess.js';
import { adminEmail, adminUsername, validateAdminUsername, newAdminPassword, checkRemoval } from './lib/admins.js';
import { getAuth } from 'firebase-admin/auth';
import { usernameAttempt, newPassword, loginNames, captainUid, loginEmail } from './lib/captainLogin.js';
import { runRegistration } from './lib/registerFlow.js';
import { resolveDbPaths } from './lib/paths.js';
import { validateLegacySeason } from './lib/legacy.js';
// The CLI otherwise chooses the legacy project-ID namespace, while the web emulator config
// and seed scripts use the default-rtdb namespace. Keep local callables in that same database.
const demoProject = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (process.env.FUNCTIONS_EMULATOR === 'true' && demoProject?.startsWith('demo-')) initializeApp({ projectId: demoProject, databaseURL: `https://${demoProject}-default-rtdb.firebaseio.com` });
else initializeApp();
// TRAICE_DB_ROOT / TRAICE_DB_SEASON1_PATH come from functions/.env (see functions/.env.example).
const paths = resolveDbPaths({ root: process.env.TRAICE_DB_ROOT, season1: process.env.TRAICE_DB_SEASON1_PATH });
const options = { region: 'us-central1', maxInstances: 10, timeoutSeconds: 60 };
function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
}
// The token's admin claim is only a hint (it can be an hour old); the account record decides, so removing an admin takes effect at once.
async function currentAdmin(request) {
  if (request.auth?.token?.admin !== true) return false;
  return adminStatus(await getAuth().getUser(request.auth.uid).catch(() => null), request.auth.token).admin;
}
async function requireAdmin(request) {
  requireAuth(request);
  if (!(await currentAdmin(request))) throw new HttpsError('permission-denied', 'Administrator access is required.');
}
// `operation(state, { now })`: the time (and any random id the caller made beforehand) is fixed once per request, so every
// retry of the transaction computes exactly the same result from the same inputs.
async function mutate(operation, path = paths.root) {
  let outcome, updateError, attempts = 0, rootBytes = 0;
  const startedAt = Date.now(), ctx = { now: startedAt };
  const root = getDatabase().ref(path);
  let listener;
  try {
    // Keep a value listener alive so the transaction starts with authoritative
    // state rather than an empty local cache. Root reads use the Admin SDK only.
    await new Promise((resolve, reject) => { listener = () => resolve(); root.on('value', listener, reject); });
    const transaction = await root.transaction(current => {
      attempts++;
      try { if (attempts > 1) rootBytes = JSON.stringify(current ?? null).length; const result = operation(current, ctx); updateError = null; outcome = result.result; return result.state; }
      catch (error) { updateError = error; return undefined; }
    }, undefined, false);
    if (!transaction.committed && updateError) throw updateError;
    if (!transaction.committed) throw new HttpsError('aborted', 'The update could not complete. Please retry.');
    // Contention is measured, not guessed: retries mean unrelated writes collided on the tournament root.
    const elapsed = Date.now() - startedAt;
    if (attempts > 1 || elapsed > 3000) console.info('Tournament transaction', { attempts, elapsedMs: elapsed, rootBytes: rootBytes || undefined });
    return outcome;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ValidationError) throw new HttpsError('failed-precondition', error.message);
    console.error('Tournament update failed', { name: error.name, code: error.code });
    throw new HttpsError('internal', 'Could not save the update. Please retry.');
  } finally { if (listener) root.off('value', listener); }
}

// Read-only deployment probe. It intentionally does not initialize data or require a sign-in.
export const healthCheck = onCall(options, async () => ({ ok: true, service: 'traice' }));

export const bootstrapTournament = onCall(options, async () => {
  if ((await getDatabase().ref(`${paths.root}/settings`).get()).exists()) return { created: false };
  return mutate(bootstrapState);
});
export const importSeason1 = onCall(options, async request => {
  await requireAdmin(request);
  try { validateLegacySeason(request.data?.season); } catch (error) { throw new HttpsError('failed-precondition', error.message); }
  const target = getDatabase().ref(paths.season1), existing = (await target.get()).val();
  // Defence in depth: only ever replace a previous Season 1 import, never other data that happens to sit at the path.
  if (existing != null && !(existing.id === 's1' && existing.legacy === true)) throw new HttpsError('failed-precondition', `The database already has other data at “${paths.season1}”. Choose a different Season 1 path.`);
  await target.set(request.data.season);
  return { path: paths.season1 };
});
const TEAM_ID = /^[a-zA-Z0-9_-]{16,80}$/;
// Creates the captain's Email/Password account (uid is derived from the team, so a retry finds it). Retries if the username is taken.
async function createCaptainAccount(uid, names, password = newPassword(names)) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const username = usernameAttempt(names, attempt);   // arjuraj, then arjuraj2, arjuraj3 ... if taken
    try { await getAuth().createUser({ uid, email: loginEmail(username), password, displayName: `${username} (captain)` }); return { username, password }; }
    catch (error) { if (error.code !== 'auth/email-already-exists') throw error; }
  }
  throw new HttpsError('aborted', 'Could not create a login. Please retry.');
}
// Registering also creates the captain's login (username + 8-character password), returned once for the captain to save.
// If the login cannot be created the team is still registered (loginPending) and the admin creates it with Reset login.
export const registerTeam = onCall(options, async request => {
  requireAuth(request);
  const teamId = request.data?.teamId;
  if (typeof teamId !== 'string' || !TEAM_ID.test(teamId)) throw new HttpsError('failed-precondition', 'Invalid registration identifier.');
  return runRegistration({
    teamId, names: loginNames(request.data),
    createAccount: createCaptainAccount,
    deleteAccount: uid => getAuth().deleteUser(uid),
    register: login => mutate((state, { now }) => applyRegistration(state, request.data, request.auth.uid, now, login)),
    log: error => console.error('Captain login provisioning needs reconciliation', { code: error?.code })
  });
});
export const saveConfiguration = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyConfiguration(state, request.data)); });
export const recalculateTiers = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyRecalculation(state)); });
export const generateFixtures = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyGenerateFixtures(state, request.data)); });
export const submitResult = onCall(options, async request => { requireAuth(request); return mutate(state => applySubmitResult(state, request.data, request.auth.uid, request.auth.token.admin === true)); });
export const reviewResult = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyReviewResult(state, request.data)); });
export const generatePlayoffs = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyGeneratePlayoffs(state, request.data)); });
// Find a partner: public posts, private contact details, and a swap of WhatsApp numbers when someone replies.
const newId = () => randomUUID().replaceAll('-', '').slice(0, 20);
export const createPartnerPost = onCall(options, async request => { requireAuth(request); const id = newId(); return mutate((state, { now }) => applyCreatePost(state, request.data, request.auth.uid, now, id)); });
export const expressInterest = onCall(options, async request => { requireAuth(request); const id = newId(); return mutate((state, { now }) => applyExpressInterest(state, request.data, request.auth.uid, now, id)); });
export const closePartnerPost = onCall(options, async request => { requireAuth(request); return mutate(state => applyClosePost(state, request.data, request.auth.uid, request.auth?.token?.admin === true)); });
export const markPartnerPicked = onCall(options, async request => { requireAuth(request); return mutate(state => applyMarkPicked(state, request.data, request.auth.uid, request.auth?.token?.admin === true)); });
export const reopenPartnerPost = onCall(options, async request => { requireAuth(request); return mutate(state => applyReopenPost(state, request.data, request.auth.uid, request.auth?.token?.admin === true)); });
export const saveEarlyBird = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyEarlyBird(state, request.data)); });
export const saveCalendar = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyCalendar(state, request.data)); });
export const autoSchedule = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyAutoSchedule(state, request.data)); });
export const addBufferWeeks = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyAddBuffer(state, request.data)); });
export const saveLeagueRules = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyLeagueRules(state, request.data)); });
export const manageSeason = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyManageSeason(state, request.data)); });
export const setSchedule = onCall(options, async request => { await requireAdmin(request); return mutate(state => applySetSchedule(state, request.data)); });
export const moveFixture = onCall(options, async request => { await requireAdmin(request); return mutate(state => applyMoveFixture(state, request.data)); });
export const issueChallenge = onCall(options, async request => { requireAuth(request); const admin = await currentAdmin(request); return mutate(state => applyIssueChallenge(state, request.data, request.auth.uid, admin)); });
export const updateTeam = onCall(options, async request => { requireAuth(request); const admin = await currentAdmin(request); return mutate(state => applyUpdateTeam(state, request.data, request.auth.uid, admin)); });
// Admin: update PPRC players' UTRs from a file (the browser has already matched the names), then re-rate everyone from the
// stored matches. Writes only under pprcMaster (and an import log); never touches clubs or traice2_0.
export const syncPprcUtr = onCall({ ...options, timeoutSeconds: 120, memory: '512MiB' }, async request => {
  await requireAdmin(request);
  let updates;
  try { updates = validateUtrUpdates(request.data?.updates); } catch (error) { throw new HttpsError('invalid-argument', error.message); }
  const db = getDatabase(), read = async path => (await db.ref(path).get()).val() || {};
  const [players, nameIndex, ratings, clubs] = await Promise.all([read('pprcMaster/players'), read('pprcMaster/nameIndex'), read('pprcMaster/ratings'), read('pprcClubs')]);
  if (!Object.keys(players).length) throw new HttpsError('failed-precondition', 'The PPRC list has not been imported yet.');
  let result;
  try { result = applyUtrUpdates({ pprcMaster: { players, nameIndex, ratings }, clubs }, updates); } catch (error) { throw new HttpsError('failed-precondition', error.message); }
  const writes = {};
  for (const [id, player] of Object.entries(result.changedPlayers)) writes[`pprcMaster/players/${id}`] = player;
  for (const [key, id] of Object.entries(result.newIndex)) writes[`pprcMaster/nameIndex/${key}`] = id;
  for (const [id, history] of Object.entries(result.utrHistory)) for (const [at, value] of Object.entries(history)) writes[`pprcMaster/utrHistory/${id}/${at}`] = value;
  await db.ref().update(clean(writes));
  for (const [node, value] of Object.entries(result.derived)) await db.ref(`pprcMaster/${node}`).set(clean(value));
  await db.ref(`importLog/${Date.now()}`).set({ at: Date.now(), source: 'utr upload', by: request.auth.uid, ...result.summary });
  return result.summary;
});
export const linkPprc = onCall(options, async request => { requireAuth(request); const admin = await currentAdmin(request); return mutate(state => applyLinkPprc(state, request.data, admin)); });
export const withdrawTeam = onCall(options, async request => {
  requireAuth(request);
  const admin = await currentAdmin(request);
  const result = await mutate(state => applyWithdrawTeam(state, request.data, request.auth.uid, admin));
  await getAuth().deleteUser(captainUid(result.teamId)).catch(() => {});   // the team is gone, so is its login
  return result;
});
// Admin: give a team's captain a new password (and sign out their old sessions). The password is returned once and never stored.
export const resetCaptainLogin = onCall(options, async request => {
  await requireAdmin(request);
  const teamId = request.data?.teamId;
  if (typeof teamId !== 'string' || !TEAM_ID.test(teamId)) throw new HttpsError('invalid-argument', 'Choose a team.');
  const record = (await getDatabase().ref(`${paths.root}/registrations/${teamId}`).get()).val();
  if (!record) throw new HttpsError('not-found', 'That team no longer exists.');
  const names = loginNames(record), uid = captainUid(teamId), password = newPassword(names);
  let username = record.captainUsername;
  try {
    if (username) await getAuth().updateUser(uid, { password });
    else throw Object.assign(new Error('no login yet'), { code: 'auth/user-not-found' });
    await getAuth().revokeRefreshTokens(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') { console.error('Captain login reset failed', { code: error.code }); throw new HttpsError('internal', 'Could not reset the login. Please retry.'); }
    ({ username } = await createCaptainAccount(uid, names, password));   // the team has no login yet, or it was removed
    await mutate(state => applySetCaptainLogin(state, { teamId, uid, username }));
  }
  return { teamId, username, password };
});

// ---------- Administrators ----------
// An administrator is an Email/Password account (<name>@traice.local) with the `admin` claim. The password is returned once and never stored.
async function listAdminUsers() {
  const admins = []; let token;
  do {
    const page = await getAuth().listUsers(1000, token);
    for (const user of page.users) if (user.customClaims?.admin === true) admins.push({ uid: user.uid, email: user.email || '', username: adminUsername(user.email), createdAt: Date.parse(user.metadata.creationTime) || null, lastSignIn: Date.parse(user.metadata.lastSignInTime) || null, disabled: user.disabled });
    token = page.pageToken;
  } while (token);
  return admins.sort((a, b) => a.username.localeCompare(b.username));
}
const asRefusal = fn => { try { return fn(); } catch (error) { throw new HttpsError('failed-precondition', error.message); } };
export const listAdmins = onCall(options, async request => {
  await requireAdmin(request);
  return { admins: (await listAdminUsers()).map(a => ({ ...a, you: a.uid === request.auth.uid })) };
});
export const createAdmin = onCall(options, async request => {
  await requireAdmin(request);
  const username = asRefusal(() => validateAdminUsername(request.data?.username)), password = newAdminPassword(max => randomInt(max));
  try {
    const user = await getAuth().createUser({ email: adminEmail(username), password, displayName: `${username} (admin)` });
    await getAuth().setCustomUserClaims(user.uid, { admin: true });
    return { uid: user.uid, username, password };
  } catch (error) {
    if (error.code === 'auth/email-already-exists') throw new HttpsError('failed-precondition', `“${username}” already has an account. Choose another name.`);
    console.error('Admin creation failed', { code: error.code });
    throw new HttpsError('internal', 'Could not create the admin. Please retry.');
  }
});
export const resetAdminPassword = onCall(options, async request => {
  await requireAdmin(request);
  const uid = request.data?.uid;
  if (typeof uid !== 'string' || !uid || uid.length > 128) throw new HttpsError('invalid-argument', 'Choose an admin.');
  const admins = await listAdminUsers(), admin = admins.find(a => a.uid === uid);
  if (!admin) throw new HttpsError('not-found', 'That person is not an administrator.');
  const password = newAdminPassword(max => randomInt(max));
  await getAuth().updateUser(uid, { password }); await getAuth().revokeRefreshTokens(uid);
  return { uid, username: admin.username, password };
});
export const removeAdmin = onCall(options, async request => {
  await requireAdmin(request);
  const uid = request.data?.uid;
  if (typeof uid !== 'string' || !uid || uid.length > 128) throw new HttpsError('invalid-argument', 'Choose an admin.');
  const admins = await listAdminUsers();
  asRefusal(() => checkRemoval(admins, uid, request.auth.uid));
  await getAuth().setCustomUserClaims(uid, { admin: false }); await getAuth().revokeRefreshTokens(uid);
  return { uid };
});

// ---------- Automatic backups ----------
// Every 6 hours, and on demand from Admin, a copy of the whole tournament is saved to the project's Cloud Storage bucket under traice-backups/
// (a .json with everything and a readable .txt of the registrations). The newest 80 of each are kept. Only the Admin SDK can read these files
// unless your Storage rules say otherwise: keep the Storage rules closed (the default is "no access").
const BACKUP_DIR = 'traice-backups', KEEP = 80;
async function runBackup() {
  const root = (await getDatabase().ref(paths.root).get()).val();
  if (!root) throw new HttpsError('failed-precondition', 'There is nothing to back up yet.');
  const season1 = paths.season1UnderRoot ? undefined : (await getDatabase().ref(paths.season1).get()).val();
  const bucket = getStorage().bucket(), stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const json = `${BACKUP_DIR}/traice-${stamp}.json`, txt = `${BACKUP_DIR}/traice-${stamp}.txt`;
  await bucket.file(json).save(JSON.stringify({ backedUpAt: new Date().toISOString(), rootPath: paths.root, root, season1 }, null, 2), { contentType: 'application/json' });
  await bucket.file(txt).save(registrationsText(root.registrations, root.tierConfig), { contentType: 'text/plain; charset=utf-8' });
  for (const ext of ['.json', '.txt']) {                       // keep the newest KEEP of each kind
    const [files] = await bucket.getFiles({ prefix: `${BACKUP_DIR}/traice-` });
    const old = files.map(f => f.name).filter(n => n.endsWith(ext)).sort().reverse().slice(KEEP);
    await Promise.all(old.map(name => bucket.file(name).delete().catch(() => {})));
  }
  return { bucket: bucket.name, json, txt, teams: Object.keys(root.registrations || {}).length };
}
export const scheduledBackup = onSchedule({ schedule: 'every 6 hours', region: 'us-central1', timeoutSeconds: 120, maxInstances: 1 }, async () => {
  try { const result = await runBackup(); console.log('Backup saved', result); }
  catch (error) { console.error('Scheduled backup failed', { name: error.name, code: error.code, message: error.message }); throw error; }
});
export const backupNow = onCall(options, async request => {
  await requireAdmin(request);
  try { return await runBackup(); }
  catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Backup failed', { name: error.name, code: error.code, message: error.message });
    throw new HttpsError('internal', 'The backup could not be saved. Check that Cloud Storage is set up for this project (Firebase Console → Storage → Get started).');
  }
});

// ---------- Singles Ladder ----------
// One callable for every ladder change. It reuses the same sign-in, the same current-admin check and the same atomic
// transaction as the tournament, but the transaction covers only the `ladder` node, so ladder play and TRIACE never
// contend. The policy is functions/lib/singlesLadder/engine.js; the browser supplies no names, UTRs, roles or time.
const LADDER_PATH = `${paths.root}/ladder`;
const ladderMutate = (payload, actor, id) => mutate((state, { now }) => { const out = applyLadder(state, payload, actor, { now, id }); return { state: JSON.parse(JSON.stringify(out.state)), result: out.result }; }, LADDER_PATH);
// "Verified PPRC Player": the person already has a match on record in TRIACE, KOC or the Ladder.
const pprcVerified = rating => ((rating?.played?.singles || 0) + (rating?.played?.doubles || 0) + (rating?.wins || 0) + (rating?.losses || 0)) > 0;
const pprcUtr = player => (Number.isFinite(player?.seed?.singles) && player.seed.singles >= 0 && player.seed.singles <= 16.5 ? player.seed.singles : null);
export const ladderAction = onCall(options, async request => {
  requireAuth(request);
  if (request.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('permission-denied', 'Sign in with your player account.');
  const admin = await currentAdmin(request), data = request.data;
  const payload = data && typeof data === 'object' && !Array.isArray(data) ? { ...data } : {};
  // Facts the server looks up itself, for organizers only: the canonical PPRC player, and the sign-in account being linked.
  if (['enroll', 'syncPlayers', 'link'].includes(payload.action)) {
    if (!admin) throw new HttpsError('permission-denied', 'Organizer access is required.');
    const db = getDatabase();
    if (payload.action === 'enroll') {
      if (!isLadderKey(payload.playerId)) throw new HttpsError('invalid-argument', 'Choose a player.');
      const player = (await db.ref(`pprcMaster/players/${payload.playerId}`).get()).val();
      if (!player?.name || player.mergedInto || player.retired) throw new HttpsError('failed-precondition', 'Choose a current player from the PPRC list.');
      payload.name = player.name; payload.utr = pprcUtr(player);
      payload.verified = pprcVerified((await db.ref(`pprcMaster/ratings/${payload.playerId}`).get()).val());
    } else if (payload.action === 'syncPlayers') {
      if (!isLadderKey(payload.seasonId)) throw new HttpsError('invalid-argument', 'Choose a season.');
      const ids = Object.keys((await db.ref(`${LADDER_PATH}/public/${payload.seasonId}/players`).get()).val() || {});
      const records = await Promise.all(ids.map(async id => Promise.all([db.ref(`pprcMaster/players/${id}`).get(), db.ref(`pprcMaster/ratings/${id}`).get()]).then(([player, rating]) => ({ player: player.val(), rating: rating.val() }))));
      payload.players = Object.fromEntries(ids.map((id, i) => [id, records[i].player ? { name: records[i].player.name, utr: pprcUtr(records[i].player), verified: pprcVerified(records[i].rating) } : null]).filter(([, value]) => value));
    } else {
      if (!isLadderKey(payload.uid)) throw new HttpsError('invalid-argument', 'Choose a sign-in account.');
      const account = await getAuth().getUser(payload.uid).catch(() => null);
      if (!account || account.disabled || !account.providerData.length) throw new HttpsError('failed-precondition', 'Choose an existing, enabled sign-in account.');
    }
  }
  return ladderMutate(payload, { uid: request.auth.uid, admin }, newId());
});
// Hourly: unanswered challenges and inactivity, for every running season, exactly as the season's rules say.
export const ladderSweep = onSchedule({ schedule: 'every 60 minutes', region: 'us-central1', timeoutSeconds: 120, maxInstances: 1 }, async () => {
  const seasons = (await getDatabase().ref(`${LADDER_PATH}/index/seasons`).get()).val() || {};
  for (const [seasonId, season] of Object.entries(seasons)) if (season.status === 'active') await ladderMutate({ action: 'sweep', seasonId }, { uid: 'system', system: true }, newId());
});
