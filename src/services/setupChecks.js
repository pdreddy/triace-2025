import { diagnose } from './diagnose.js';

// Diagnostics receive only read operations. Never probe a write endpoint with an
// empty payload: some valid commands (such as saveCalendar({})) change state.
export async function runSetupChecks({ report, config, paths, read, currentUser, claims, health }) {
  const step = async (id, label, check) => {
    report({ id, label, status: 'running' });
    try { report({ id, label, ...(await check()) }); }
    catch (error) {
      report({ id, label, status: 'fail', detail: error?.message || String(error), fix: diagnose(`${error?.code || ''} ${error?.message || ''}`) });
    }
  };
  await step('config', 'Firebase project', async () => ({ status: 'ok', detail: `${config.projectId} · ${new URL(config.databaseURL).host} · data under ${paths.root}` }));
  await step('database', 'Database is readable', async () => (await read(`${paths.root}/settings`))
    ? { status: 'ok', detail: 'tournament settings found' }
    : { status: 'warn', detail: 'reachable, but tournament settings are not initialized' });
  for (const [label, path] of [['Early-bird rules', `${paths.root}/earlyBird`], ['Partner board rules', `${paths.root}/partnerPosts`], ['Season 1 data rules', paths.season1]]) {
    await step(`rules-${path}`, `${label} published`, async () => { await read(path); return { status: 'ok', detail: 'readable' }; });
  }
  await step('backend', 'Backend health endpoint', async () => {
    const result = await health();
    if (result?.ok !== true || result?.service !== 'traice') throw new Error('The backend returned an invalid health response.');
    return { status: 'ok', detail: 'backend answers; this does not verify every deployed function' };
  });
  report({ id: 'password', label: 'Sign-in providers', status: 'warn', detail: 'Provider settings are not tested by signing in. Verify admin and captain sign-in on their sign-in pages.' });
  await step('account', 'This browser’s account', async () => {
    const user = currentUser();
    if (!user || user.isAnonymous) return { status: 'ok', detail: 'not signed in as admin (sign in at /admin/login)' };
    return (await claims(user)).admin === true
      ? { status: 'ok', detail: `${user.email} is an administrator` }
      : { status: 'warn', detail: `${user.email} is signed in but has no admin role` };
  });
}
