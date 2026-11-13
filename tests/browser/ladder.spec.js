// The Singles Ladder end to end on the local demo server, which runs the same rules engine as the Cloud Function.
// The roster is the development fixture (scripts/ladder-dev-fixtures.mjs); nothing here touches Firebase.
import { test, expect } from './fixtures.js';

async function adminLogin(page) {
  await page.goto('/admin/login');
  await page.getByLabel('Username or email').fill('reddi2026');
  await page.getByLabel('Password', { exact: true }).fill('local-e2e-test-password');
  await page.getByRole('button', { name: 'Sign in ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}
// Tests in this file share one demo server, so the season may already exist.
async function ensureSeason(page) {
  await page.goto('/ladder/organizer');
  const create = page.getByRole('button', { name: 'Create demo season' }), title = page.getByRole('heading', { name: 'Demo Season', level: 1 });
  await expect(create.or(title)).toBeVisible();
  if (await create.isVisible()) await create.click();
  await expect(title).toBeVisible();
}
const signInAs = async (page, n) => { expect((await page.request.post('/api/ladder-demo-login', { data: { playerId: `ladder_demo_${n}` } })).ok()).toBeTruthy(); };

test('with no season the ladder says so instead of showing made-up standings', async ({ page }) => {
  await page.goto('/ladder');
  await expect(page.getByText('No ladder season yet')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Ladder standings' })).toHaveCount(0);
  await page.goto('/home');
  await expect(page.getByText('No ladder season has been created yet.')).toBeVisible();
  await page.goto('/ladder/organizer');
  await expect(page.getByText('Organizers only')).toBeVisible();
  // The backend refuses organizer actions from a visitor and from a signed-in non-organizer.
  expect((await page.request.post('/api/ladder-action', { data: { action: 'createSeason', name: 'Forged' } })).status()).toBe(401);
});

test('organizer creates the season; players challenge, accept, report and confirm; standings move', async ({ page }) => {
  await adminLogin(page);
  await ensureSeason(page);

  // Demo Player 3 (#2) was challenged by Demo Player 5 (#5).
  await signInAs(page, 3);
  await page.goto('/ladder');
  const me = page.getByTestId('my-ladder-card');
  await expect(me.getByText('#2', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Ladder standings' }).getByRole('listitem')).toHaveCount(12);
  await me.getByRole('button', { name: 'Accept' }).click();
  await me.getByRole('button', { name: 'Report score' }).click();
  await me.getByLabel(/^Score/).fill('6-4 6-9');
  await me.getByRole('button', { name: 'Send for confirmation' }).click();
  await expect(me.getByRole('alert')).toContainText('not a valid tennis set score');      // refused by the backend
  await me.getByLabel(/^Score/).fill('6-4 6-2');
  await me.getByRole('button', { name: 'Send for confirmation' }).click();
  await page.goto('/ladder/matches');
  await expect(page.getByText('Waiting for Demo Player 5 to confirm.')).toBeVisible();
  // A non-organizer player cannot use organizer actions, even by calling the backend directly.
  expect((await page.request.post('/api/ladder-action', { data: { seasonId: 'demo', action: 'adjust', playerId: 'ladder_demo_3', rank: 1, reason: 'forged' } })).status()).toBe(400);

  // Demo Player 5 confirms: on time, challenger beat a higher-ranked player, so the two swap.
  await signInAs(page, 5);
  await page.goto('/ladder');
  const five = page.getByTestId('my-ladder-card');
  await expect(five.getByText('#5', { exact: true })).toBeVisible();
  await five.getByRole('button', { name: 'Confirm result' }).click();
  await expect(five.getByText('#2', { exact: true })).toBeVisible();
  await page.goto('/home');
  const card = page.getByRole('link', { name: /Active Singles Ladder/ });
  await expect(card.getByText('#2 of 12')).toBeVisible();
  await expect(card.getByText('Pending challenges')).toBeVisible();

  // Now a top player with no active challenge: challenge the player above.
  await page.goto('/ladder');
  await page.getByRole('button', { name: 'Challenge Demo Player 1' }).click();
  await expect(five.getByText('Your move')).toHaveCount(0);
  await page.goto('/ladder/matches');
  await expect(page.getByText('Waiting for an answer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw challenge' })).toBeVisible();
  await page.goto('/ladder/activity');
  await expect(page.getByText('Successful challenge', { exact: true })).toBeVisible();
  await expect(page.getByText('Upset bonus', { exact: true })).toBeVisible();
});

test('organizer rules settings validate, preview and version changes; the Rules page follows', async ({ page }) => {
  await adminLogin(page);
  await ensureSeason(page);
  await page.getByRole('tab', { name: 'Rules settings' }).click();
  const form = page.getByRole('form', { name: 'Rules settings' }), save = form.getByRole('button', { name: 'Save rules' });
  await expect(save).toBeDisabled();
  await form.getByLabel('Positions above', { exact: true }).fill('0');
  await expect(form.getByText('Enter a whole number from 1 to 50.', { exact: true })).toBeVisible();
  await form.getByLabel('Positions above', { exact: true }).fill('5');
  await form.getByLabel('Unlocked positions above').fill('4');                           // a streak must unlock more than the normal range
  await expect(form.getByText(/A streak must unlock more than the normal 5 positions/).first()).toBeVisible();
  await form.getByLabel('Unlocked positions above').fill('0');
  await expect(form.getByRole('cell', { name: 'Challenge range: Positions above' })).toBeVisible();
  await expect(form.getByText('You may challenge a player up to 5 positions above you.')).toBeVisible();
  await expect(save).toBeDisabled();                                                     // a reason is required
  await form.getByLabel(/Reason for the change/).fill('Committee vote');
  await save.click();
  await expect(form.getByText('Saved as rules version 2.')).toBeVisible();
  await page.getByRole('tab', { name: 'Audit' }).click();
  await expect(page.getByText('Reason: Committee vote')).toBeVisible();
  await page.goto('/ladder/rules');
  await expect(page.getByText('Rules version 2')).toBeVisible();
  await expect(page.getByText('You may challenge a player up to 5 positions above you.')).toBeVisible();

  // Season freeze stops players; CSV export works.
  await page.goto('/ladder/organizer');
  await page.getByLabel('Reason (kept in the audit log)').fill('End of season review');
  await page.getByRole('button', { name: 'Freeze season' }).click();
  await expect(page.getByText('Frozen', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download standings' }).click()]);
  expect(download.suggestedFilename()).toBe('ladder-demo-season-standings.csv');
  await signInAs(page, 8);
  expect((await page.request.post('/api/ladder-action', { data: { seasonId: 'demo', action: 'challenge', opponentId: 'ladder_demo_7' } })).status()).toBe(400);
  await page.goto('/ladder');
  await expect(page.getByText(/The season is frozen/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Challenge / })).toHaveCount(0);
});

test('phone layout: no sideways scrolling on Home or the Ladder', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await adminLogin(page);
  await ensureSeason(page);
  for (const path of ['/home', '/ladder', '/ladder/matches', '/ladder/rules', '/ladder/organizer']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'PPRC Player Home' })).toBeVisible();
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(0);
    const signOut = page.getByRole('button', { name: 'Sign out' });
    expect((await signOut.boundingBox()).x + (await signOut.boundingBox()).width, `${path} header fits`).toBeLessThanOrEqual(360);
  }
});

test('Ladder 2026: champions and playoffs, the four groups, PPRC names linked to profiles', async ({ page }) => {
  await page.goto('/ladder');
  await page.getByRole('navigation', { name: 'Ladder navigation' }).getByRole('link', { name: '2026' }).click();
  await expect(page).toHaveURL(/\/ladder\/2026$/);
  await expect(page.getByRole('heading', { name: 'Ladder 2026', level: 1 })).toBeVisible();
  await expect(page.getByText('62 players · 96 results')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Champion to be decided' })).toBeVisible();      // no final in the results yet
  await expect(page.locator('.l26-match')).toHaveCount(2);                                         // the two quarter-finals played so far
  await expect(page.getByRole('tab')).toHaveCount(5);
  await page.getByRole('tab', { name: 'Group B' }).click();
  const record = page.getByRole('list', { name: 'Group B record' });
  await expect(record.getByRole('link', { name: 'Vivekvardhan Reddy Mereddy' })).toHaveAttribute('href', '/pprc/p_vivekvardhan_reddy_mereddy');
  await expect(record.getByRole('link', { name: 'Joel Kodoru' })).toBeVisible();
  await expect(page.getByText('Joel Kodooru')).toHaveCount(0);                                     // the typed spelling is never shown
  await expect(page.getByText('Awaiting confirmation')).toHaveCount(2);
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
