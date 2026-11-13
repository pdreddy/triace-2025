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
  await page.goto('/ladder/admin');
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
  await page.goto('/ladder/organizer');                                                   // the earlier address still works
  await expect(page).toHaveURL(/\/ladder\/admin$/);
  await expect(page.getByText('Organizers only')).toBeVisible();
  // The backend refuses organizer actions from a visitor and from a signed-in non-organizer.
  expect((await page.request.post('/api/ladder-action', { data: { action: 'createSeason', name: 'Forged', reason: 'forged' } })).status()).toBe(401);
});

test('organizer creates the season; players challenge, accept, report and confirm; standings move', async ({ page, browser }) => {
  await adminLogin(page);
  await ensureSeason(page);

  // Demo Player 3 (#2) was challenged by Demo Player 5 (#5).
  await signInAs(page, 3);
  await page.goto('/ladder');
  const me = page.getByTestId('my-ladder-card');
  await expect(me.getByText('#2', { exact: true })).toBeVisible();
  const list = page.getByRole('list', { name: 'Ladder standings' });
  await expect(list.getByRole('listitem')).toHaveCount(16);
  await expect(list.getByText('Verified PPRC Player', { exact: true })).toHaveCount(12);   // 12 fixture players have a PPRC match on record
  await expect(list.getByText('Unverified', { exact: true })).toHaveCount(4);
  await me.getByRole('button', { name: 'Accept' }).click();
  await me.getByRole('button', { name: 'Report score' }).click();
  await me.getByLabel(/^Score/).fill('6-4 4-6 6-3');
  await me.getByRole('button', { name: 'Send for confirmation' }).click();
  await expect(me.getByRole('alert')).toContainText('10-point match tiebreak');           // a full third set is not this season's format
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
  const loserContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const loserPage = await loserContext.newPage();
  await signInAs(loserPage, 3);
  await loserPage.goto('/ladder/matches');
  await expect(loserPage.getByText('Waiting for Demo Player 5 to confirm.')).toBeVisible();
  await five.getByRole('button', { name: 'Confirm result' }).click();
  const result = page.getByRole('dialog', { name: 'Up you go!' });
  await expect(result).toBeVisible();
  await expect(result).toContainText('Down the snake');
  await expect(result).toContainText('#5 → #2');
  await expect(result).toContainText('#2 → #5');
  await page.screenshot({ path: 'work/ladder-result-desktop.png' });
  await result.getByRole('button', { name: 'Back to the ladder' }).click();
  const loserResult = loserPage.getByRole('dialog', { name: 'The climb continues.' });
  await expect(loserResult).toBeVisible();
  await loserPage.setViewportSize({ width: 320, height: 740 });
  await loserPage.emulateMedia({ reducedMotion: 'reduce' });
  expect(await loserResult.locator('.result-loser-token').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  expect(await loserPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await loserPage.screenshot({ path: 'work/ladder-result-mobile.png' });
  await loserPage.keyboard.press('Escape');
  await expect(loserPage.getByRole('dialog')).toHaveCount(0);
  await loserContext.close();
  await expect(five.getByText('#2', { exact: true })).toBeVisible();
  await page.goto('/home');
  const card = page.getByRole('link', { name: /Active Singles Ladder/ });
  await expect(card.getByText('#2 of 16')).toBeVisible();
  await expect(card.getByText('Pending challenges')).toBeVisible();

  // Historical results never replay when the ladder is opened again.
  await page.goto('/ladder');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Now a top player with no active challenge: challenge the player above.
  await page.getByRole('button', { name: 'Challenge Demo Player 1', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send challenge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Challenge sent!' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Back to ladder', exact: true }).click();
  await expect(five.getByText('Your move')).toHaveCount(0);
  await page.goto('/ladder/matches');
  await expect(page.getByText('Waiting for an answer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw challenge' })).toBeVisible();
  await page.goto('/ladder/activity');
  await expect(page.getByText('Successful challenge', { exact: true })).toBeVisible();
  await expect(page.getByText('Upset bonus', { exact: true })).toBeVisible();
});

test('blocked opponents stay visible with reasons, demo switching finds a playable opponent, and the dialog respects reduced motion', async ({ page }) => {
  await adminLogin(page);
  await ensureSeason(page);
  await signInAs(page, 10);
  await page.goto('/ladder');
  await expect(page.getByRole('heading', { name: 'No opponents available right now' })).toBeVisible();
  const list = page.getByRole('list', { name: 'Ladder standings' });
  await expect(list.getByRole('button', { name: 'Challenge Demo Player 9: Busy', exact: true })).toBeDisabled();
  await expect(list.getByRole('button', { name: 'Challenge Demo Player 12: Rematch cooldown', exact: true })).toBeDisabled();
  await expect(list.getByRole('button', { name: 'Challenge Demo Player 8: Outside your range', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'work/ladder-blocked-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Try as Demo Player 16' }).click();
  await expect(page.getByTestId('my-ladder-card').getByRole('heading', { name: 'Demo Player 16' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose opponent' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(3);
  const trigger = page.getByRole('button', { name: 'Challenge Demo Player 15', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Make your move.' })).toBeVisible();
  await page.screenshot({ path: 'work/ladder-challenge-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.locator('.duel-ball').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'work/ladder-challenge-mobile.png' });
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBeTruthy();
  await dialog.getByRole('button', { name: 'Send challenge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Challenge sent!' })).toBeVisible();
  await dialog.getByRole('link', { name: 'View match' }).click();
  await expect(page).toHaveURL(/\/ladder\/matches$/);
  await expect(page.getByText('Waiting for an answer')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Match progress' }).first()).toBeVisible();
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
  await page.goto('/ladder/admin');
  await page.getByLabel('Reason (kept in the audit log)').first().fill('End of season review');
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
  for (const path of ['/home', '/ladder', '/ladder/matches', '/ladder/rules', '/ladder/admin']) {
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
