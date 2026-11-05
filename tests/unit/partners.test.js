import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, publicState } from '../../functions/lib/tournament.js';
import { applyCreatePost, applyExpressInterest, applyClosePost, validatePost, LIMITS } from '../../functions/lib/partners.js';

const settings = initialState().settings, gap = 175;
const player = (extra = {}) => ({ kind: 'player', firstName: 'Maya', singlesUtr: 625, doublesUtr: null, note: 'Free weekday evenings', whatsapp: '+1 (555) 010-2000', ...extra });
const team = (extra = {}) => ({ kind: 'team', firstName: 'Ravi', singlesUtr: 700, doublesUtr: 760, note: '', whatsapp: '+15550103000', needs: 1, wantMin: 500, wantMax: 800, ...extra });
const post = (state, payload, uid = 'u1', id = 'post_000001', now = 1000) => applyCreatePost(state, payload, uid, now, id);
const interest = (extra = {}) => ({ postId: 'post_000001', name: 'Sam', whatsapp: '+15550104000', message: 'I can play Saturdays', ...extra });

test('a player posts: the public record has no contact details, the private one does', () => {
  const { state, result } = post(initialState(), player());
  assert.equal(result.postId, 'post_000001');
  const pub = state.partnerPosts.post_000001;
  assert.deepEqual([pub.kind, pub.firstName, pub.singlesUtr, pub.utr, pub.interested], ['player', 'Maya', 625, 625, 0]);
  assert.equal(JSON.stringify(publicState(state).partnerPosts).includes('5550102000'), false, 'the phone number is never public');
  assert.equal(state.partnerPrivate.post_000001.whatsapp, '+15550102000');   // normalised
  assert.equal(state.partnerPrivate.post_000001.ownerUid, 'u1');
  assert.deepEqual(state.partnerByOwner.u1, { post_000001: true });
});

test('the counted UTR follows the singles/doubles gap rule', () => {
  assert.equal(post(initialState(), player({ singlesUtr: 600, doublesUtr: 700 })).state.partnerPosts.post_000001.utr, 700);   // higher counts
  assert.equal(post(initialState(), player({ singlesUtr: 500, doublesUtr: 800 })).state.partnerPosts.post_000001.utr, 650);   // gap over 1.75: average
});

test('a team captain says how many players are needed and the UTR range wanted', () => {
  const pub = post(initialState(), team()).state.partnerPosts.post_000001;
  assert.deepEqual([pub.kind, pub.needs, pub.wantMin, pub.wantMax], ['team', 1, 500, 800]);
  assert.equal(post(initialState(), team({ wantMin: null, wantMax: null })).state.partnerPosts.post_000001.wantMin, null);
});

test('posts are validated', () => {
  const bad = (payload, pattern) => assert.throws(() => validatePost(payload, settings, gap), pattern, JSON.stringify(payload));
  bad(player({ kind: 'other' }), /looking for a team or for players/);
  bad(player({ firstName: '' }), /Enter your first name/);
  bad(player({ firstName: 'R2D2' }), /letters only/);
  bad(player({ singlesUtr: 0 }), /Singles UTR must be between/);
  bad(player({ singlesUtr: 5000 }), /Singles UTR must be between/);
  bad(player({ doublesUtr: 9999 }), /Doubles UTR is out of range/);
  bad(player({ note: 'call me http://spam.example' }), /cannot contain links/);
  bad(player({ note: 'visit www.spam.example' }), /cannot contain links/);
  bad(player({ note: 'x'.repeat(LIMITS.note + 1) }), /at most 160/);
  bad(player({ whatsapp: '12345' }), /WhatsApp number/);
  bad(team({ needs: 3 }), /1 or 2/);
  bad(team({ wantMin: 900, wantMax: 600 }), /cannot be above/);
  bad(team({ wantMax: 9999 }), /out of range/);
  bad({ ...player(), extra: 1 }, /Invalid post/);
  bad(null, /Fill in the form/);
  const { post: clean } = validatePost(player({ note: '  lots   of   spaces  ' }), settings, gap);
  assert.equal(clean.note, 'lots of spaces');
});

test('limits: two open posts per person, an id is needed, no empty tournament', () => {
  let state = post(initialState(), player(), 'u1', 'post_000001').state;
  state = post(state, team(), 'u1', 'post_000002').state;
  assert.throws(() => post(state, player(), 'u1', 'post_000003'), /2 open posts/);
  assert.ok(post(state, player(), 'u2', 'post_000003'), 'another person can still post');
  assert.throws(() => post(initialState(), player(), 'u1', 'bad id'), /Invalid post identifier/);
  assert.throws(() => post(initialState(), player(), '', 'post_000009'), /Open the page again/);
  assert.throws(() => post({}, player(), 'u1', 'post_000009'), /not set up/);
});

test('showing interest swaps contact details and updates the count', () => {
  const state = post(initialState(), player()).state;
  const { state: next, result } = applyExpressInterest(state, interest(), 'u2', 2000, 'int_0000001');
  assert.equal(result.contact, '+15550102000', 'the replier gets the poster’s WhatsApp number');
  assert.equal(result.firstName, 'Maya');
  const reply = next.partnerPrivate.post_000001.interests.int_0000001;
  assert.deepEqual([reply.name, reply.whatsapp, reply.message, reply.uid], ['Sam', '+15550104000', 'I can play Saturdays', 'u2']);
  assert.equal(next.partnerPosts.post_000001.interested, 1);
  assert.equal(JSON.stringify(publicState(next)).includes('5550104000'), false, 'the replier’s number is private too');
});

test('interest rules: not your own post, only once, valid details, bounded', () => {
  const state = post(initialState(), player()).state;
  assert.throws(() => applyExpressInterest(state, interest(), 'u1', 2000, 'int_0000001'), /your own post/);
  const once = applyExpressInterest(state, interest(), 'u2', 2000, 'int_0000001').state;
  assert.throws(() => applyExpressInterest(once, interest(), 'u2', 3000, 'int_0000002'), /already showed interest/);
  assert.throws(() => applyExpressInterest(state, interest({ postId: 'nope' }), 'u2', 2000, 'int_0000001'), /no longer on the board/);
  assert.throws(() => applyExpressInterest(state, interest({ name: '' }), 'u2', 2000, 'int_0000001'), /Enter your name/);
  assert.throws(() => applyExpressInterest(state, interest({ whatsapp: 'abc' }), 'u2', 2000, 'int_0000001'), /WhatsApp number/);
  assert.throws(() => applyExpressInterest(state, interest({ message: 'see https://x.example' }), 'u2', 2000, 'int_0000001'), /cannot contain links/);
  let busy = state;
  for (let i = 0; i < LIMITS.interestsPerPost; i++) busy = applyExpressInterest(busy, interest({ name: 'Sam' }), `v${i}`, 2000, `int_${String(i).padStart(7, '0')}`).state;
  assert.throws(() => applyExpressInterest(busy, interest(), 'late', 2000, 'int_9999999'), /enough replies/);
});

test('one person cannot contact more than the limit of posts', () => {
  let state = initialState();
  for (let i = 0; i < LIMITS.interestsPerUser + 1; i++) state = post(state, player(), `poster${i}`, `post_${String(i).padStart(6, '0')}`).state;
  for (let i = 0; i < LIMITS.interestsPerUser; i++) state = applyExpressInterest(state, interest({ postId: `post_${String(i).padStart(6, '0')}` }), 'eager', 2000, `int_${String(i).padStart(7, '0')}`).state;
  assert.throws(() => applyExpressInterest(state, interest({ postId: `post_${String(LIMITS.interestsPerUser).padStart(6, '0')}` }), 'eager', 2000, 'int_8888888'), /contacted a lot/);
});

test('only the poster or the admin can remove a post, and it all goes', () => {
  const state = post(initialState(), player()).state;
  assert.throws(() => applyClosePost(state, { postId: 'post_000001' }, 'u2'), /Only the person who posted/);
  assert.throws(() => applyClosePost(state, { postId: 'nope' }, 'u1'), /already gone/);
  for (const [uid, admin] of [['u1', false], ['someone', true]]) {
    const next = applyClosePost(state, { postId: 'post_000001' }, uid, admin).state;
    assert.equal(next.partnerPosts.post_000001, undefined);
    assert.equal(next.partnerPrivate.post_000001, undefined);
    assert.equal(next.partnerByOwner.u1.post_000001, undefined);
  }
  // a removed post frees a slot
  assert.ok(post(applyClosePost(post(post(initialState(), player(), 'u1', 'post_000001').state, player(), 'u1', 'post_000002').state, { postId: 'post_000001' }, 'u1').state, player(), 'u1', 'post_000003'));
});

test('old posts are cleaned up when anyone posts', () => {
  const old = post(initialState(), player(), 'u1', 'post_000001', 1000).state;
  const later = 1000 + LIMITS.expireDays * 1.5 * 86400000 + 1;
  const next = post(old, player(), 'u2', 'post_000002', later).state;
  assert.equal(next.partnerPosts.post_000001, undefined);
  assert.ok(next.partnerPosts.post_000002);
  assert.deepEqual(next.partnerByOwner.u1, {});
});
