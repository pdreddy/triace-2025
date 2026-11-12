import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySinglesLadder, canChallenge, sundayDeadline, validateScore } from '../../functions/lib/singlesLadder.js';
const now = Date.parse('2026-11-12T18:00:00Z');
const admin = { uid: 'organizer', admin: true }, a = { uid: 'ua' }, b = { uid: 'ub' };
function fixture() {
  let state = {};
  for (const [playerId, name] of [['p1','One'],['p2','Two'],['p3','Three'],['p4','Four'],['p5','Five']]) state = applySinglesLadder(state, { action:'enroll', playerId, name }, admin, now, playerId).state;
  state = applySinglesLadder(state, { action:'link', playerId:'p4', uid:'ua' }, admin, now, 'linka').state;
  state = applySinglesLadder(state, { action:'link', playerId:'p2', uid:'ub' }, admin, now, 'linkb').state;
  return applySinglesLadder(state, { action:'open' }, admin, now, 'open').state;
}
const run = (s, p, who = a, t = now, id = 'c1') => applySinglesLadder(s, p, who, t, id).state;
test('challenge ranges match reference policy, including top-three and streak exception', () => {
  assert.equal(canChallenge(1,4,0,8),true); assert.equal(canChallenge(3,6,0,8),true);
  assert.equal(canChallenge(5,1,0,8),false); assert.equal(canChallenge(5,1,2,8),true);
  assert.equal(canChallenge(5,6,2,8),false); assert.equal(canChallenge(2,2,0,8),false);
});
test('Chicago deadline handles daylight saving transitions', () => {
  assert.equal(new Date(sundayDeadline(Date.parse('2026-03-07T18:00Z'))).toISOString(),'2026-03-09T04:59:59.999Z');
  assert.equal(new Date(sundayDeadline(Date.parse('2026-10-31T18:00Z'))).toISOString(),'2026-11-02T05:59:59.999Z');
});
test('account linking and enrollment require organizers, cannot claim by name', () => {
  const s=fixture(); assert.throws(()=>run(s,{action:'link',playerId:'p1',uid:'ua'}),/Organizer/);
  assert.throws(()=>run(s,{action:'challenge',opponentId:'p2'},{uid:'unknown'}),/enrolled/);
  assert.throws(()=>run(s,{action:'link',playerId:'p2',uid:'ua'},admin),/already linked/);
});
test('challenges use authoritative state, block concurrent matches and preserve input', () => {
  const s=fixture(), copy=structuredClone(s), next=run(s,{action:'challenge',opponentId:'p2',rank:1});
  assert.deepEqual(s,copy); assert.equal(next.singlesLadder.challenges.c1.ranks.challenger,4);
  assert.throws(()=>run(next,{action:'challenge',opponentId:'p1'}),/active challenge/);
  assert.equal(next.singlesLadder.challenges.c1.respondBy,now+48*3600000);
});
test('only opponent can accept within response deadline',()=>{
  const s=run(fixture(),{action:'challenge',opponentId:'p2'});
  assert.throws(()=>run(s,{action:'respond',challengeId:'c1',accept:true}),/opponent/);
  assert.throws(()=>run(s,{action:'respond',challengeId:'c1',accept:true},b,now+49*3600000),/48 hours/);
  const expired=run(s,{action:'expire',challengeId:'c1'},b,now+49*3600000);
  assert.equal(expired.singlesLadder.challenges.c1.status,'expired');
});
function submitted() {
  let s=run(fixture(),{action:'challenge',opponentId:'p2'});
  s=run(s,{action:'respond',challengeId:'c1',accept:true},b);
  return run(s,{action:'submit',challengeId:'c1',winnerId:'p4',score:'6-4 6-3'});
}
test('confirmation changes standings once, records audit, blocks early rematches',()=>{
  const s=submitted(); assert.throws(()=>run(s,{action:'confirm',challengeId:'c1'}),/other player/);
  const result=run(s,{action:'confirm',challengeId:'c1'},b);
  assert.equal(result.singlesLadder.entries.p4.rank,2); assert.equal(result.singlesLadder.entries.p2.rank,3);
  assert.equal(result.singlesLadder.entries.p4.points,5); assert.equal(result.singlesLadder.entries.p2.points,1);
  assert.deepEqual(Object.values(result.singlesLadder.entries).map(x=>x.rank).sort(),[1,2,3,4,5]);
  assert.throws(()=>run(result,{action:'confirm',challengeId:'c1'},b),/other player/);
  assert.throws(()=>run(result,{action:'challenge',opponentId:'p2'}),/14 days/);
});
test('disputes freeze results until organizer resolves; cannot close with pending dispute',()=>{
  let s=run(submitted(),{action:'dispute',challengeId:'c1'},b);
  assert.equal(s.singlesLadder.entries.p4.points,0);
  assert.throws(()=>run(s,{action:'close'},admin),/active challenges/);
  assert.throws(()=>run(s,{action:'resolve',challengeId:'c1',winnerId:'p2'},a),/Organizer/);
  s=run(s,{action:'resolve',challengeId:'c1',winnerId:'p2',reason:'Verified by organizer'},admin);
  assert.equal(s.singlesLadder.entries.p2.points,4);
});
test('late results lose bonuses; only organizer approves requested extension',()=>{
  let s=run(fixture(),{action:'challenge',opponentId:'p2'});
  s=run(s,{action:'respond',challengeId:'c1',accept:true},b);
  const deadline=s.singlesLadder.challenges.c1.deadline;
  assert.throws(()=>run(s,{action:'approveExtension',challengeId:'c1',until:deadline+86400000},admin),/No extension/);
  s=run(s,{action:'extension',challengeId:'c1'});
  assert.throws(()=>run(s,{action:'approveExtension',challengeId:'c1',until:deadline+86400000}),/Organizer/);
  s=run(s,{action:'submit',challengeId:'c1',winnerId:'p4',score:'6-4 6-3'},a,deadline+1);
  s=run(s,{action:'confirm',challengeId:'c1'},b,deadline+2);
  assert.equal(s.singlesLadder.entries.p4.points,3);
});

test('score validation rejects impossible sets, unfinished matches and forged winners', () => {
  assert.throws(() => validateScore('0-0 0-0', true), /Invalid tennis/);
  assert.throws(() => validateScore('6-4 3-6', true), /Winner/);
  assert.throws(() => validateScore('6-4 6-3', false), /Winner/);
  assert.doesNotThrow(() => validateScore('6-4 3-6 10-8', true));
});
test('organizer rank decisions preserve contiguous ranks; exemptions prevent challenges',()=>{
  let s=fixture();
  assert.throws(()=>run(s,{action:'adjustRank',playerId:'p5',rank:1,reason:'Seed correction'}),/Organizer/);
  s=run(s,{action:'adjustRank',playerId:'p5',rank:1,reason:'Seed correction'},admin);
  assert.equal(s.singlesLadder.entries.p5.rank,1);
  assert.deepEqual(Object.values(s.singlesLadder.entries).map(e=>e.rank).sort(),[1,2,3,4,5]);
  s=run(s,{action:'exempt',playerId:'p2',until:now+86400000,reason:'Medical leave'},admin);
  assert.throws(()=>run(s,{action:'challenge',opponentId:'p2'}),/exemption/);
});
