import { before, after, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set } from 'firebase/database';
import { initialState } from '../../functions/lib/tournament.js';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-traice-2',database:{rules:await readFile('database.rules.json','utf8')}});});
after(async()=>env?.cleanup());
beforeEach(async()=>{await env.clearDatabase();await env.withSecurityRulesDisabled(async context=>set(ref(context.database(),'traice2_0'),initialState()));});
test('public may read only safe tier data and form configuration',async()=>{const db=env.unauthenticatedContext().database();for(const key of ['settings','tierConfig','tiers','configRevision'])await assertSucceeds(get(ref(db,`traice2_0/${key}`)));for(const key of ['traice2_0','traice2_0/registrations'])await assertFails(get(ref(db,key)));});
test('anonymous and admin clients cannot bypass callable validation through direct writes',async()=>{for(const context of [env.unauthenticatedContext(),env.authenticatedContext('guest'),env.authenticatedContext('admin',{admin:true})]){const db=context.database();for(const key of ['settings','tierConfig','registrations/fake','tiers/goat/teams/fake'])await assertFails(set(ref(db,`traice2_0/${key}`),{}));}});
test('only admin claims allow private reads',async()=>{const admin=env.authenticatedContext('owner',{admin:true}).database(),guest=env.authenticatedContext('guest').database();await assertSucceeds(get(ref(admin,'traice2_0/registrations')));await assertFails(get(ref(guest,'traice2_0/registrations')));});
test('ladder: standings and rules are public; identities, requests, notifications and the audit log are not; nobody writes directly', async () => {
  await env.withSecurityRulesDisabled(async c => { await set(ref(c.database(), 'traice2_0/ladder'), {
    index: { current: 's1', seasons: { s1: { name: 'S', status: 'active' } } },
    public: { s1: { players: { p1: { name: 'One', rank: 1 } }, rules: { version: 1 } } },
    private: { s1: { requests: { p1: { r1: { reason: 'private' } }, p2: { r2: { reason: 'private' } } }, notifications: { p1: { n1: { text: 'x' } }, p2: { n2: { text: 'y' } } } } },
    accounts: { alice: 'p1', bob: 'p2' }, audit: { a1: { action: 'adjust', reason: 'private' } }
  }); });
  const publicDb = env.unauthenticatedContext().database(), alice = env.authenticatedContext('alice').database(), admin = env.authenticatedContext('admin', { admin: true }).database();
  for (const path of ['index', 'public', 'public/s1/players', 'public/s1/rules']) await assertSucceeds(get(ref(publicDb, `traice2_0/ladder/${path}`)));
  for (const path of ['', 'accounts', 'accounts/alice', 'audit', 'private', 'private/s1/requests/p1', 'private/s1/notifications/p1', 'ops']) await assertFails(get(ref(publicDb, `traice2_0/ladder/${path}`)));
  for (const path of ['accounts/alice', 'private/s1/requests/p1', 'private/s1/notifications/p1']) await assertSucceeds(get(ref(alice, `traice2_0/ladder/${path}`)));
  for (const path of ['accounts', 'accounts/bob', 'private/s1/requests/p2', 'private/s1/notifications/p2', 'private/s1/requests', 'audit', '']) await assertFails(get(ref(alice, `traice2_0/ladder/${path}`)));
  for (const path of ['', 'audit', 'accounts', 'private/s1']) await assertSucceeds(get(ref(admin, `traice2_0/ladder/${path}`)));
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('alice'), env.authenticatedContext('admin', { admin: true })])
    for (const path of ['index/current', 'public/s1/players/p1/rank', 'public/s1/rules/values', 'public/s1/challenges/fake', 'accounts/alice', 'accounts/mallory', 'audit/a1', 'private/s1/requests/p1/r1/status']) await assertFails(set(ref(context.database(), `traice2_0/ladder/${path}`), 'forged'));
});
