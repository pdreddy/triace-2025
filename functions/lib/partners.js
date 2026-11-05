// "Find a partner": players looking for a team, and captains looking for players, with their UTR.
// Public fields (name, UTR, note) live in partnerPosts; the poster's WhatsApp number and everyone who showed interest live in
// partnerPrivate, readable only by the poster and the admin. Interested people get the poster's WhatsApp link back,
// and the poster sees theirs, so nobody's number is published. Like the other modules: apply* functions take the whole state.
import { ValidationError, playerUtr, normalizeWhatsAppPhone, rulesOf } from './tournament.js';

export const KINDS = ['player', 'team'];                       // player: wants a team · team: a captain wants players
export const LIMITS = { postsPerUser: 2, postsTotal: 300, interestsPerPost: 25, interestsPerUser: 20, note: 160, message: 200, name: 40, expireDays: 30 };
const DAY = 86400000;
const ID = /^[A-Za-z0-9_-]{8,40}$/;
const NAME = /^[\p{L}][\p{L} .'’-]{0,39}$/u;
const LINK = /https?:\/\/|www\.|\.(com|net|org|io|me|ly)\b/i;

function assert(condition, message) { if (!condition) throw new ValidationError(message); }
const inRange = (value, settings) => Number.isInteger(value) && value >= settings.minPlayerUtr && value <= settings.maxPlayerUtr;
const text = (value, max, label, { required = false } = {}) => {
  assert(typeof value === 'string', `${label} must be text.`);
  const clean = value.replace(/\s+/g, ' ').trim();
  assert(!required || clean.length > 0, `Enter ${label.toLowerCase()}.`);
  assert(clean.length <= max, `${label} can be at most ${max} characters.`);
  assert(!LINK.test(clean), `${label} cannot contain links.`);
  return clean;
};

export function validatePost(payload, settings, gap) {
  const base = ['kind', 'firstName', 'singlesUtr', 'doublesUtr', 'note', 'whatsapp'], team = ['needs', 'wantMin', 'wantMax'];
  assert(payload && typeof payload === 'object' && !Array.isArray(payload), 'Fill in the form to post.');
  assert(base.every(key => Object.hasOwn(payload, key)) && Object.keys(payload).every(key => base.includes(key) || team.includes(key)), 'Invalid post.');
  assert(KINDS.includes(payload.kind), 'Choose whether you are looking for a team or for players.');
  const firstName = text(payload.firstName, LIMITS.name, 'Your first name', { required: true });
  assert(NAME.test(firstName), 'Use letters only for your first name.');
  assert(inRange(payload.singlesUtr, settings), `Singles UTR must be between ${(settings.minPlayerUtr / 100).toFixed(2)} and ${(settings.maxPlayerUtr / 100).toFixed(2)}.`);
  assert(payload.doublesUtr == null || inRange(payload.doublesUtr, settings), 'Doubles UTR is out of range. Leave it empty if you do not have one.');
  const post = {
    kind: payload.kind, firstName, singlesUtr: payload.singlesUtr, doublesUtr: payload.doublesUtr ?? null,
    utr: playerUtr(payload.singlesUtr, payload.doublesUtr ?? null, gap),
    note: text(payload.note ?? '', LIMITS.note, 'The note')
  };
  if (payload.kind === 'team') {
    assert(payload.needs === 1 || payload.needs === 2, 'Say how many players you need: 1 or 2.');
    for (const key of ['wantMin', 'wantMax']) assert(payload[key] == null || inRange(payload[key], settings), 'The UTR range you want is out of range.');
    assert(payload.wantMin == null || payload.wantMax == null || payload.wantMin <= payload.wantMax, 'The lowest UTR you want cannot be above the highest.');
    Object.assign(post, { needs: payload.needs, wantMin: payload.wantMin ?? null, wantMax: payload.wantMax ?? null });
  }
  return { post, whatsapp: normalizeWhatsAppPhone(payload.whatsapp) };
}

function prune(state, now) {
  for (const [id, post] of Object.entries(state.partnerPosts || {})) {
    if (now - post.createdAt <= LIMITS.expireDays * 1.5 * DAY) continue;
    removePost(state, id);
  }
}
function removePost(state, id) {
  const owner = state.partnerPrivate?.[id]?.ownerUid;
  delete state.partnerPosts?.[id]; delete state.partnerPrivate?.[id];
  if (owner && state.partnerByOwner?.[owner]) delete state.partnerByOwner[owner][id];
}

export function applyCreatePost(current, payload, uid, now = Date.now(), id) {
  assert(typeof uid === 'string' && uid, 'Open the page again, then retry.');
  assert(current?.settings, 'The tournament is not set up yet.');
  assert(typeof id === 'string' && ID.test(id), 'Invalid post identifier.');
  const state = structuredClone(current);
  prune(state, now);
  assert(!state.partnerPosts?.[id], 'This post already exists.');
  const mine = Object.keys(state.partnerByOwner?.[uid] || {}).filter(postId => state.partnerPosts?.[postId]);
  assert(mine.length < LIMITS.postsPerUser, `You can have ${LIMITS.postsPerUser} open posts at a time. Remove one first.`);
  assert(Object.keys(state.partnerPosts || {}).length < LIMITS.postsTotal, 'The board is full right now. Please try again later.');
  const { post, whatsapp } = validatePost(payload, current.settings, rulesOf(current).utrGapLimit);
  state.partnerPosts ||= {}; state.partnerPrivate ||= {}; state.partnerByOwner ||= {};
  state.partnerPosts[id] = { id, ...post, createdAt: now, interested: 0 };
  state.partnerPrivate[id] = { ownerUid: uid, whatsapp, interests: {} };
  state.partnerByOwner[uid] ||= {}; state.partnerByOwner[uid][id] = true;
  return { state, result: { postId: id } };
}

// Someone shows interest: the poster gets their name and number; they get the poster's WhatsApp number back in the result.
export function applyExpressInterest(current, payload, uid, now = Date.now(), interestId) {
  assert(typeof uid === 'string' && uid, 'Open the page again, then retry.');
  assert(typeof interestId === 'string' && ID.test(interestId), 'Invalid identifier.');
  assert(payload && typeof payload === 'object' && !Array.isArray(payload), 'Fill in the form.');
  const post = current?.partnerPosts?.[payload.postId], secret = current?.partnerPrivate?.[payload.postId];
  assert(post && secret, 'That post is no longer on the board.');
  assert(secret.ownerUid !== uid, 'This is your own post.');
  assert(!Object.values(secret.interests || {}).some(i => i.uid === uid), 'You already showed interest in this post.');
  assert(Object.keys(secret.interests || {}).length < LIMITS.interestsPerPost, 'This post has enough replies already.');
  const total = Object.values(current.partnerPrivate).reduce((n, s) => n + Object.values(s.interests || {}).filter(i => i.uid === uid).length, 0);
  assert(total < LIMITS.interestsPerUser, 'You have contacted a lot of posts already. Wait for replies first.');
  const name = text(payload.name, LIMITS.name, 'Your name', { required: true }), message = text(payload.message ?? '', LIMITS.message, 'The message');
  assert(NAME.test(name), 'Use letters only for your name.');
  const whatsapp = normalizeWhatsAppPhone(payload.whatsapp);
  const state = structuredClone(current);
  state.partnerPrivate[payload.postId].interests[interestId] = { id: interestId, uid, name, whatsapp, message, at: now };
  state.partnerPosts[payload.postId].interested = Object.keys(state.partnerPrivate[payload.postId].interests).length;
  return { state, result: { postId: payload.postId, firstName: post.firstName, contact: secret.whatsapp } };
}

export function applyClosePost(current, payload, uid, isAdmin = false) {
  const secret = current?.partnerPrivate?.[payload?.postId];
  assert(secret && current.partnerPosts?.[payload.postId], 'That post is already gone.');
  assert(isAdmin || (uid && secret.ownerUid === uid), 'Only the person who posted it, or the admin, can remove it.');
  const state = structuredClone(current);
  removePost(state, payload.postId);
  return { state, result: { postId: payload.postId } };
}
