import { test, expect } from '@playwright/test';

test('Champions tab shows Season 1 winners and runners-up for both tiers with full names', async ({ page }) => {
  await page.goto('/champions');
  await expect(page.getByRole('heading', { name: /Season\s+champions/i })).toBeVisible();
  const goat = page.locator('.winner-card', { hasText: 'GOAT tier' }), rising = page.locator('.winner-card', { hasText: 'Rising Aces' });
  await expect(goat.getByRole('heading', { name: 'Team A1' })).toBeVisible();
  await expect(goat.getByText('Yogesh')).toBeVisible();
  await expect(goat.locator('.runner-up')).toContainText('Team A2');
  await expect(rising.getByRole('heading', { name: 'Team A5' })).toBeVisible();
  await expect(rising.getByText('Hari Mothkuri')).toBeVisible();
  await expect(rising.locator('.runner-up')).toContainText('Team B5');
  await expect(page.locator('.champ-season .winner-card')).toHaveCount(2);
});

test('Season 1 opens on Super Six, with the group stage table, members and form', async ({ page }) => {
  await page.goto('/history');
  await page.getByRole('link', { name: /Season 1/ }).click();
  await expect(page.getByRole('heading', { name: 'Season 1' })).toBeVisible();
  await expect(page.locator('.six-week')).toHaveCount(3);
  await expect(page.getByText('Scoring system')).toBeVisible();
  await page.getByRole('button', { name: 'Group stage' }).click();
  const groupA = page.locator('.published').first();
  await expect(groupA.locator('tbody tr')).toHaveCount(9);
  await expect(groupA.locator('tbody tr').first()).toContainText('Team A2');
  await expect(groupA.locator('tbody tr').first()).toContainText('Prashant');
  await expect(groupA.locator('tbody tr').first().locator('td.form-col .form i')).toHaveCount(5);
  await expect(page.getByText('Grand final')).toHaveCount(0);
});

test('admin sees the Firebase section and can copy Season 1 into the database', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel(/username/i).fill('reddi2026');
  await page.getByLabel(/password/i).fill('local-e2e-test-password');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  const panel = page.locator('#admin-firebase');
  await expect(panel).toContainText('Bundled snapshot');
  await panel.getByRole('button', { name: 'Copy Season 1 into Firebase' }).click();
  await expect(panel).toContainText('Firebase · 73 matches');
  await page.goto('/champions');
  await expect(page.locator('.winner-card', { hasText: 'GOAT tier' }).getByRole('heading', { name: 'Team A1' })).toBeVisible();
});
