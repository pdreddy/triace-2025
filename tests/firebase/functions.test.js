import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { randomUUID } from 'node:crypto';
import { initialState } from '../../functions/lib/tournament.js';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9000';
const app=initializeApp({projectId:'demo-traice-2',databaseURL:'https://demo-traice-2-default-rtdb.firebaseio.com'}),database=getDatabase(app),auth=getAuth(app);
let guestToken,adminToken;
async function token(admin=false){const email=`${randomUUID()}@example.test`,password='emulator-test-only-password';const user=await auth.createUser({email,password});if(admin)await auth.setCustomUserClaims(user.uid,{admin:true});const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});const result=await response.json();assert.ok(result.idToken);return result.idToken;}
async function call(name,data,bearer=guestToken){const response=await fetch(`http://127.0.0.1:5001/demo-traice-2/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify({data})});return {status:response.status,...await response.json()};}
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
 const {username,password}=result.result.login;assert.match(username,/^john-[a-z2-9]{4}$/);assert.match(password,/^[a-z2-9]{8}$/);
 const email=`${username}@captain.traice.local`,user=await auth.getUserByEmail(email);assert.equal(user.uid,`cap_${payload.teamId}`);
 const value=(await database.ref('traice2_0').get()).val();assert.equal(value.registrations[payload.teamId].captainUsername,username);assert.equal(value.registrations[payload.teamId].owners[user.uid],true);
 assert.ok(!JSON.stringify(value).includes(password),'the password is never stored');assert.ok(!JSON.stringify(value.tiers).includes(username),'the username is not public');
 const signIn=pw=>fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw,returnSecureToken:true})});
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
