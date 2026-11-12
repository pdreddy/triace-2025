import { test, expect } from './fixtures.js';

async function login(page) {
  await page.goto('/admin/login');
  await page.getByLabel('Username or email').fill('reddi2026');
  await page.getByLabel('Password', { exact: true }).fill('local-e2e-test-password');
  await page.getByRole('button', { name: 'Sign in ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);   // sign-in lands on Player Home
  await page.goto('/admin');
}

test('admin: an overview first, one section at a time, the choice is remembered, and it fits a phone', async ({ page }) => {
  await login(page);
  const overview = page.getByTestId('admin-overview');
  await expect(overview).toBeVisible();
  await expect(overview).toContainText('Registration');
  await expect(overview).toContainText('Needs your attention');
  await expect(page.getByTestId('pprc-admin')).toBeHidden();

  await page.getByRole('tab', { name: 'PPRC' }).click();
  await expect(page.getByTestId('pprc-admin')).toBeVisible();
  await expect(overview).toBeHidden();

  await page.getByRole('tab', { name: 'Setup' }).click();
  await expect(page.locator('#goat-name')).toBeVisible();
  await expect(page.getByTestId('pprc-admin')).toBeHidden();

  await page.getByRole('tab', { name: 'All', exact: true }).click();
  await expect(page.locator('#goat-name')).toBeVisible();
  await expect(page.getByTestId('pprc-admin')).toBeVisible();

  await page.getByRole('tab', { name: 'Teams' }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Teams' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole('tab', { name: 'Teams' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('admin overview buttons jump to the right section', async ({ page }) => {
  await login(page);
  await page.getByTestId('admin-overview').getByRole('button', { name: /Open PPRC players/ }).click();
  await expect(page.getByTestId('pprc-admin')).toBeVisible();
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.getByTestId('admin-overview').getByRole('button', { name: /Change in Setup/ }).click();
  await expect(page.locator('#goat-name')).toBeVisible();
});
