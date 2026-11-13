import { test, expect } from './fixtures.js';
import { groupAPractice, GROUP_A_PASSWORD, GROUP_A_SEASON } from '../../scripts/group-a-practice.mjs';
test.use({ practiceProfile: 'group-a' });
const profile = groupAPractice();
async function login(page, username) {
  await page.goto('/player-login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(GROUP_A_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/ladder');
}

test('six actual Group A players have working password logins, isolated permissions and private credentials', async ({ browser, baseURL }) => {
  test.setTimeout(90000);
  for (const account of profile.accounts) {
    const context = await browser.newContext({ baseURL });
    try {
      const page = await context.newPage();
      await login(page, account.username);
      await expect(page.getByTestId('my-ladder-card').getByRole('heading', { name: account.name, exact: true })).toBeVisible();
      const user = await (await page.request.get('/api/session')).json();
      expect(user.player).toBe(true); expect(user.captain).toBeUndefined(); expect(user.admin).toBe(false);
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      expect((await page.request.get('/api/ladder?path=audit')).status()).toBe(403);
      expect((await page.request.post('/api/admin-create', { data: { username: 'forged' } })).status()).toBe(403);
      const pub = await (await page.request.get('/api/public')).text();
      expect(pub).not.toContain(GROUP_A_PASSWORD); expect(pub).not.toContain('playerLogins'); expect(pub).not.toContain('"hash"'); expect(pub).not.toContain(account.uid);
      const unknown = await page.request.post('/api/player-login', { data: { username: '__proto__', password: GROUP_A_PASSWORD } });
      expect(unknown.status()).toBe(401);
      expect((await page.request.post('/api/player-login', { data: { username: account.username, password: 'GROUPA2026' } })).status()).toBe(401);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toBeVisible();
    } finally { await context.close(); }
  }
});

test('the three actual Group A match references complete through accept, report and confirm in separate player browsers', async ({ browser, baseURL }) => {
  test.setTimeout(120000);
  for (const [index, match] of profile.practice.matches.entries()) {
    const homeContext = await browser.newContext({ baseURL }), awayContext = await browser.newContext({ baseURL });
    try {
      const home = await homeContext.newPage(), away = await awayContext.newPage();
      await login(home, profile.accounts.find(a => a.playerId === match.homeId).username);
      await login(away, profile.accounts.find(a => a.playerId === match.awayId).username);
      await away.getByTestId('my-ladder-card').getByRole('button', { name: 'Accept', exact: true }).click();
      const card = home.getByTestId('my-ladder-card');
      await card.getByRole('button', { name: 'Report score', exact: true }).click();
      await card.getByRole('combobox', { name: 'Winner', exact: true }).selectOption(match.winnerId);
      await card.getByLabel(/^Score/).fill(match.score);
      await card.getByRole('button', { name: 'Send for confirmation' }).click();
      await away.getByTestId('my-ladder-card').getByRole('button', { name: 'Confirm result', exact: true }).click();
      await expect(home.getByRole('dialog')).toBeVisible(); await expect(away.getByRole('dialog')).toBeVisible();
      await expect(home.getByRole('dialog')).toContainText(match.winner);
      if (index === 0) {
        await expect(home.getByRole('dialog')).toContainText('Up you go!');
        await home.screenshot({ path: 'work/group-a-result.png' });
      }
      const saved = await (await home.request.get(`/api/ladder?path=public%2F${GROUP_A_SEASON}%2Fchallenges%2F${match.challengeId}`)).json();
      expect(saved.status).toBe('completed'); expect(saved.result.score).toBe(match.score); expect(saved.result.winnerId).toBe(match.winnerId);
      await home.getByRole('dialog').getByRole('button', { name: 'Back to the ladder' }).click();
      await away.getByRole('dialog').getByRole('button', { name: 'Back to the ladder' }).click();
      await home.goto('/ladder/2026'); await home.getByRole('tab', { name: 'Group A', exact: true }).click();
      await expect(home.getByRole('list', { name: 'Group A record' })).toBeVisible();
    } finally { await homeContext.close(); await awayContext.close(); }
  }
});

test('two completed practice rounds expose the snake and ladder replay on desktop and mobile', async ({ page }) => {
  await page.goto('/ladder');
  const guide = page.getByRole('region', { name: 'Group A practice guide' });
  await expect(guide).toContainText('2 sample rounds · 6 completed matches');
  await expect(guide).toContainText('up to 5');
  await guide.getByRole('button', { name: 'Watch snake & ladder' }).click();
  const result = page.getByRole('dialog');
  await expect(result.locator('.result-board')).toBeVisible();
  await expect(result).toContainText('Down the snake');
  await expect(result).toContainText('Hari Mothukuri');
  await expect(result.locator('.result-winner-token')).toHaveCSS('animation-name', 'winner-climb');
  await expect(result.locator('.result-loser-token')).toHaveCSS('animation-name', 'snake-slide');
  await expect(result).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'work/group-a-snake-ladder.png' });
  await result.getByRole('button', { name: 'Back to the ladder' }).click();
  await expect(page.getByRole('region', { name: 'Latest ladder result' })).toBeVisible();
  await page.getByRole('button', { name: 'Replay on table' }).click();
  await expect(page.locator('.rank-trail.up').first()).toBeVisible();
  await expect(page.locator('.rank-trail.down').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await guide.getByRole('button', { name: 'Watch snake & ladder' }).click();
  await expect(result.locator('.result-board')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
