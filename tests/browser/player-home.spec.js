import { test, expect } from './fixtures.js';
test('formats navigation and TRIACE routes remain available', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'Player Home' })).toBeVisible();
  await expect(page.getByText('Coming Soon', { exact: true })).toHaveCount(2);
  await page.getByRole('link', { name: /Active TRIACE 2.0/ }).click();
  await expect(page).toHaveURL(/\/triace$/);
  await page.getByRole('link', { name: 'All Formats', exact: true }).click();
  await page.getByRole('link', { name: /Active Singles Ladder/ }).click();
  await expect(page.getByRole('heading', { name: 'Singles Ladder', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'All Formats', exact: true })).toBeVisible();
});
test('admin login opens Player Home with organizer navigation', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Username or email').fill('reddi2026');
  await page.getByLabel('Password', { exact: true }).fill('local-e2e-test-password');
  await page.getByRole('button', { name: 'Sign in ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('link', { name: 'TRIACE organizer dashboard →' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});
