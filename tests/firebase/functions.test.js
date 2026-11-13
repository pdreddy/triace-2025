import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { randomUUID } from 'node:crypto';
import { initialState } from '../../functions/lib/tournament.js';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'; process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= '127.0.0.1:9000';
const authURL = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, functionsURL = `http://${process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001'}`;
const app=initializeApp({projectId:'demo-traice-2',databaseURL:'https://demo-traice-2-default-rtdb.firebaseio.com'}),database=getDatabase(app),auth=getAuth(app);
let guestToken,adminToken;
async function token(admin=false){const email=`${randomUUID()}@example.test`,password='emulator-test-only-password';const user=await auth.createUser({email,password});if(admin)await auth.setCustomUserClaims(user.uid,{admin:true});const response=await fetch(`${authURL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});const result=await response.json();assert.ok(result.idToken);return result.idToken;}
async function call(name,data,bearer=guestToken){const response=await fetch(`${functionsURL}/demo-traice-2/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify({data})});return {status:response.status,...await response.json()};}
const team=()=>({teamId:randomUUID(),whatsappPhone:'+15551234567',ace1Phone:'+15551234568',ace2Phone:'+15551234569', captain:{firstName:'John',singlesUtr:600,doublesUtr:null},ace1:{fullName:'Secret Alpha',singlesUtr:600,doublesUtr:null},ace2:{fullName:'Secret Beta',singlesUtr:600,doublesUtr:null},selectedTier:'higher',consent:true,rulesAccepted:true});
before(async()=>{guestToken=await token();adminToken=await token(true);});
after(async()=>{await deleteApp(app);});
beforeEach(async()=>{await database.ref('traice2_0').set(initialState());});
test('first visitor initializes an empty tournament without changing later admin settings',async()=>{await database.ref('traice2_0').remove();const first=await call('bootstrapTournament',{},null);assert.equal(first.status,200);assert.equal(first.result.created,true);const saved=(await database.ref('traice2_0').get()).val();assert.equal(saved.tierConfig.goat.minCombinedUtr,1750);assert.equal(saved.settings.registrationEnabled,true);await database.ref('traice2_0/tierConfig/goat/active').set(false);const again=await call('bootstrapTournament',{},null);assert.equal(again.status,200);assert.equal(again.result.created,false);assert.equal((await database.ref('traice2_0/tierConfig/goat/active').get()).val(),false);});
test('callable registration authenticates and atomically saves correct private and public records',async()=>{const payload=team();assert.equal((await call('registerTeam',payload,null)).status,401);const result=await call('registerTeam',payload);assert.equal(result.status,200);assert.equal(result.result.assignedTier,'goat');const value=(await database.ref('traice2_0').get()).val();assert.equal(value.registrations[payload.teamId].ace1.fullName,'Secret Alpha');assert.ok(!JSON.stringify(value.tiers).includes('Secret Alpha'));assert.equal(Object.keys(value.tiers.goat.teams).length,1);const repeat=await call('registerTeam',payload);assert.equal(repeat.status,200);});
test('non-admin cannot mutate settings or recalculate; server rejects forged or invalid submissions',async()=>{const state=initialState();assert.equal((await call('saveConfiguration',{settings:state.settings,tierConfig:state.tierConfig,expectedRevision:1})).status,403);assert.equal((await call('recalculateTiers',{})).status,403);const bad=team();bad.assignedTier='goat';assert.notEqual((await call('registerTeam',bad)).status,200);const invalid=team();invalid.ace1.singlesUtr=0;assert.notEqual((await call('registerTeam',invalid)).status,200);});
test('admin config and recalculation move public entries and synchronize private assignment',async()=>{const payload=team();await call('registerTeam',payload);const state=initialState();state.tierConfig.goat.active=false;state.tierConfig.rising.maxCombinedUtr=2000;assert.equal((await call('saveConfiguration',{settings:state.settings,tierConfig:state.tierConfig,expectedRevision:1},adminToken)).status,200);const result=await call('recalculateTiers',{},adminToken);assert.equal(result.status,200);assert.deepEqual(result.result,{reviewed:1,moved:1,unchanged:0,unassigned:0});const value=(await database.ref('traice2_0').get()).val();assert.equal(value.tiers.goat,undefined);assert.equal(value.registrations[payload.teamId].assignedTier,'rising');assert.equal(Object.keys(value.tiers.rising.teams).length,1);});
test('registering creates a captain login; the admin can reset it; withdrawing deletes it',async()=>{
 const payload=team(),result=await call('registerTeam',payload);assert.equal(result.status,200);
 const {username,password}=result.result.login;assert.match(username,/^johnsec\d*$/);assert.match(password,/^trijoh\d{4}$/);   // no last name sent: the fixed prefix
 const email=`${username}@captain.traice.local`,user=await auth.getUserByEmail(email);assert.equal(user.uid,`cap_${payload.teamId}`);
 const value=(await database.ref('traice2_0').get()).val();assert.equal(value.registrations[payload.teamId].captainUsername,username);assert.equal(value.registrations[payload.teamId].owners[user.uid],true);
 assert.ok(!JSON.stringify(value).includes(password),'the password is never stored');assert.ok(!JSON.stringify(value.tiers).includes(username),'the username is not public');
 const signIn=pw=>fetch(`${authURL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw,returnSecureToken:true})});
 assert.equal((await signIn(password)).status,200);
 const repeat=await call('registerTeam',payload);assert.equal(repeat.status,200);assert.equal(repeat.result.login,undefined,'a repeated request issues no second login');
 assert.equal((await call('resetCaptainLogin',{teamId:payload.teamId})).status,403);
 const reset=await call('resetCaptainLogin',{teamId:payload.teamId},adminToken);assert.equal(reset.status,200);assert.equal(reset.result.username,username);assert.notEqual(reset.result.password,password);
 assert.equal((await signIn(password)).status,400);const fresh=await signIn(reset.result.password);assert.equal(fresh.status,200);
 const captainToken=(await fresh.json()).idToken;
 assert.equal((await call('withdrawTeam',{teamId:payload.teamId},captainToken)).status,200);
 await assert.rejects(auth.getUserByEmail(email));
});
test('a refused registration leaves no orphan login',async()=>{
 const bad=team();bad.ace1.singlesUtr=0;const before=(await auth.listUsers()).users.length;
 assert.notEqual((await call('registerTeam',bad)).status,200);assert.equal((await auth.listUsers()).users.length,before);
});

test('health diagnostics require no login and leave tournament data and Auth users unchanged', async () => {
 const before = (await database.ref('traice2_0').get()).val();
 const users = (await auth.listUsers()).users.map(user => user.uid).sort();
 const result = await call('healthCheck', {}, null);
 assert.equal(result.status, 200);
 assert.deepEqual(result.result, { ok: true, service: 'traice' });
 assert.deepEqual((await database.ref('traice2_0').get()).val(), before);
 assert.deepEqual((await auth.listUsers()).users.map(user => user.uid).sort(), users);
});

// ---------- Singles Ladder ----------
const ladder = (data, bearer = adminToken) => call('ladderAction', data, bearer);
const ladderNode = async path => (await database.ref(`traice2_0/ladder/${path}`).get()).val();
async function ladderSeason(players) {
  assert.equal((await ladder({ action: 'createSeason', seasonId: 's1', name: 'Emulator season', reason: 'emulator test' })).status, 200);
  for (const [playerId, uid, utr] of players) {
    await database.ref(`pprcMaster/players/${playerId}`).set({ name: `Name ${playerId}`, seed: { singles: utr, doubles: utr } });
    assert.equal((await ladder({ action: 'enroll', seasonId: 's1', playerId, reason: 'emulator test' })).status, 200);
    if (uid) assert.equal((await ladder({ action: 'link', uid, playerId, reason: 'emulator test' })).status, 200);
  }
}
test('Ladder: organizer actions need the current admin; names and UTRs come from the PPRC list, never the request', async () => {
  await database.ref('pprcMaster/players/ladder_p1').set({ name: 'Real Name', seed: { singles: 6.4, doubles: 6 } });
  assert.equal((await ladder({ action: 'createSeason', seasonId: 's1', name: 'Forged', reason: 'emulator test' }, null)).status, 401);
  assert.notEqual((await ladder({ action: 'createSeason', seasonId: 's1', name: 'Forged', reason: 'emulator test' }, guestToken)).status, 200);
  assert.equal(await ladderNode('index'), null);
  assert.equal((await ladder({ action: 'createSeason', seasonId: 's1', name: 'Emulator season', reason: 'emulator test' })).status, 200);
  assert.equal((await ladder({ action: 'enroll', seasonId: 's1', playerId: 'ladder_p1', reason: 'emulator test' }, guestToken)).status, 403);
  assert.notEqual((await ladder({ action: 'enroll', seasonId: 's1', playerId: 'not_in_pprc', reason: 'emulator test' })).status, 200);
  assert.equal((await ladder({ action: 'enroll', seasonId: 's1', playerId: 'ladder_p1', name: 'Forged Name', utr: 16, rank: 1, points: 99, reason: 'emulator test' })).status, 200);
  assert.deepEqual(await ladderNode('public/s1/players/ladder_p1'), { name: 'Real Name', utr: 6.4, rank: 1, points: 0, streak: 0, wins: 0, losses: 0, eligible: true, verified: false, joinedAt: (await ladderNode('public/s1/players/ladder_p1/joinedAt')) });
  assert.notEqual((await ladder({ action: 'link', uid: 'missing_account', playerId: 'ladder_p1', reason: 'emulator test' })).status, 200);
  // Verified comes from the PPRC match history the server reads, never from the request.
  await database.ref('pprcMaster/players/ladder_p2').set({ name: 'Played Before', seed: { singles: 5 } });
  await database.ref('pprcMaster/ratings/ladder_p2').set({ played: { singles: 4, doubles: 0 }, wins: 3, losses: 1 });
  assert.equal((await ladder({ action: 'enroll', seasonId: 's1', playerId: 'ladder_p2', verified: false, reason: 'emulator test' })).status, 200);
  assert.equal(await ladderNode('public/s1/players/ladder_p2/verified'), true);
  assert.notEqual((await ladder({ action: 'enroll', seasonId: 's1', playerId: 'ladder_p2' })).status, 200);   // no reason, no action
  assert.equal((await ladder({ action: 'link', uid: 'x', playerId: 'ladder_p1', reason: 'emulator test' }, guestToken)).status, 403);
  // Rules: only organizers, validated on the server, versioned and audited; the stored rules are never replaced by defaults.
  const rules = await ladderNode('public/s1/rules');
  assert.equal(rules.version, 1);
  const values = structuredClone(rules.values); values.points.win = 7;
  assert.notEqual((await ladder({ action: 'saveRules', seasonId: 's1', values, baseVersion: 1, reason: 'forged' }, guestToken)).status, 200);
  const invalid = structuredClone(values); invalid.points.loss = 9;
  assert.notEqual((await ladder({ action: 'saveRules', seasonId: 's1', values: invalid, baseVersion: 1, reason: 'invalid combination' })).status, 200);
  assert.equal((await ladder({ action: 'saveRules', seasonId: 's1', values, baseVersion: 1, reason: 'committee vote' })).status, 200);
  assert.deepEqual([(await ladderNode('public/s1/rules')).version, (await ladderNode('public/s1/rules/values/points/win')), (await ladderNode('public/s1/rulesHistory/v1/values/points/win'))], [2, 7, 3]);
  const audit = Object.values(await ladderNode('audit')).filter(a => a.action === 'saveRules');
  assert.equal(audit.length, 1);
  assert.deepEqual([audit[0].reason, audit[0].before.points_win, audit[0].after.points_win, audit[0].actor.uid], ['committee vote', 3, 7, (await auth.verifyIdToken(adminToken)).uid]);
});
test('Ladder: concurrent challenges create exactly one; ownership is the linked sign-in; scores are confirmed once', async () => {
  const playerUid = (await auth.verifyIdToken(guestToken)).uid, organizerUid = (await auth.verifyIdToken(adminToken)).uid, strangerToken = await token();
  await ladderSeason([['ladder_one', organizerUid, 7], ['ladder_two', playerUid, 6.5], ['ladder_three', null, 6]]);
  // Not active yet, then an unlinked account, then an anonymous-style stranger.
  assert.notEqual((await ladder({ action: 'challenge', seasonId: 's1', opponentId: 'ladder_one' }, guestToken)).status, 200);
  assert.equal((await ladder({ action: 'setStatus', seasonId: 's1', status: 'active', reason: 'open the season' })).status, 200);
  assert.notEqual((await ladder({ action: 'challenge', seasonId: 's1', opponentId: 'ladder_one' }, strangerToken)).status, 200);
  // Five simultaneous requests, to two different opponents: the transaction lets exactly one through.
  const burst = await Promise.all([1, 2, 3, 4, 5].map(i => ladder({ action: 'challenge', seasonId: 's1', opponentId: i % 2 ? 'ladder_one' : 'ladder_three', playerId: 'ladder_one', challengerId: 'ladder_one' }, guestToken)));
  assert.equal(burst.filter(r => r.status === 200).length, 1);
  const challenges = await ladderNode('public/s1/challenges');
  assert.equal(Object.keys(challenges).length, 1);
  const [challengeId, challenge] = Object.entries(challenges)[0];
  assert.equal(challenge.challengerId, 'ladder_two');                       // the sign-in decides who is challenging
  assert.deepEqual([challenge.rules.version, challenge.rules.values.points.win], [1, 3]);
  if (challenge.opponentId !== 'ladder_one') return;                        // the other opponent won the race: nothing more to play here
  // A retried request (same opId) is applied once.
  const accept = { action: 'respond', seasonId: 's1', challengeId, accept: true, opId: 'retry-accept-1' };
  assert.equal((await ladder(accept)).status, 200);
  const retried = await ladder(accept);
  assert.deepEqual([retried.status, retried.result.duplicate], [200, true]);
  assert.notEqual((await ladder({ action: 'submit', seasonId: 's1', challengeId, winnerId: 'ladder_two', score: '6-4 6-3' }, strangerToken)).status, 200);
  assert.equal((await ladder({ action: 'submit', seasonId: 's1', challengeId, winnerId: 'ladder_two', score: '6-4 6-3' }, guestToken)).status, 200);
  assert.notEqual((await ladder({ action: 'confirm', seasonId: 's1', challengeId }, guestToken)).status, 200);   // not your own report
  const confirms = await Promise.all([1, 2, 3].map(() => ladder({ action: 'confirm', seasonId: 's1', challengeId })));
  assert.equal(confirms.filter(r => r.status === 200).length, 1);
  const season = await ladderNode('public/s1');
  assert.deepEqual([season.players.ladder_two.rank, season.players.ladder_two.points, season.players.ladder_one.rank, season.players.ladder_one.points], [1, 4, 2, 1]);
  assert.equal(season.challenges[challengeId].status, 'completed');
  assert.equal(Object.keys(season.points).length, 3);
  // Frozen: players are stopped on the server.
  assert.equal((await ladder({ action: 'setStatus', seasonId: 's1', status: 'frozen', reason: 'final review' })).status, 200);
  assert.notEqual((await ladder({ action: 'challenge', seasonId: 's1', opponentId: 'ladder_three' }, guestToken)).status, 200);
  // TRIACE data is untouched by ladder transactions.
  assert.deepEqual((await database.ref('traice2_0/settings').get()).val(), initialState().settings);
});
