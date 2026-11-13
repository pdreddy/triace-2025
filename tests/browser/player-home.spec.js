import { test, expect } from './fixtures.js';
test('Player Home lists the formats; TRIACE and Ladder open with All Formats always visible', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'Player Home' })).toBeVisible();
  await expect(page.getByText('Coming Soon', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('link', { name: /PO|KOC/ })).toHaveCount(0);            // the Coming Soon cards are not links
  await page.getByRole('link', { name: /Active TRIACE 2.0/ }).click();
  await expect(page).toHaveURL(/\/triace$/);
  await expect(page.getByRole('link', { name: 'Traice 2.0 home' })).toBeVisible();    // TRIACE keeps its own brand
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'All Formats', exact: true }).click();
  await page.getByRole('link', { name: /Active Singles Ladder/ }).click();
  await expect(page).toHaveURL(/\/ladder$/);
  await expect(page.getByRole('heading', { name: 'Singles Ladder', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ladder navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'All Formats', exact: true })).toBeVisible();
});
test('direct URLs work on refresh; PO and KOC are reserved', async ({ page }) => {
  for (const [path, heading] of [['/home', 'Player Home'], ['/ladder', 'Singles Ladder'], ['/ladder/rules', 'Singles Ladder'], ['/po', /PO is coming soon/], ['/koc', /KOC is coming soon/]]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  }
  await page.goto('/triace');
  await expect(page.getByText('Official tournament rules').first()).toBeVisible();
});
test('existing TRIACE pages still open from their own navigation', async ({ page }) => {
  await page.goto('/triace');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const [link, url] of [['Tier list', /\/tiers$/], ['League', /\/league$/], ['Players', /\/players$/], ['Rankings', /\/rankings$/], ['Champions', /\/champions$/]]) {
    await nav.getByRole('link', { name: link }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('link', { name: 'All Formats', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
  await page.goto('/captain');
  await expect(page.getByRole('form', { name: 'Captain sign in' })).toBeVisible();
});
test('admin login opens Player Home with organizer navigation', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Username or email').fill('reddi2026');
  await page.getByLabel('Password', { exact: true }).fill('local-e2e-test-password');
  await page.getByRole('button', { name: 'Sign in ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('link', { name: 'Ladder admin dashboard →' })).toBeVisible();
  await page.getByRole('link', { name: 'TRIACE organizer dashboard →' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});
