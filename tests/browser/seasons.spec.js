import { test, expect } from '@playwright/test';

async function adminLogin(page) {
  await page.goto('/admin/login');
  await page.getByLabel(/username/i).fill('reddi2026');
  await page.getByLabel(/password/i).fill('local-e2e-test-password');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page.locator('#admin-firebase')).toBeVisible();
}
// Earlier tests in the shared demo may leave registration closed; make sure it is open.
async function openRegistration(page) {
  const box = page.getByLabel('Registration enabled');
  if (!(await box.isChecked())) { await box.check(); await page.getByRole('button', { name: 'Save configuration ↗' }).click(); await expect(page.getByText('Rules saved.', { exact: false })).toBeVisible(); }
}
const sampleTeam = (id, captain) => ({
  teamId: id, whatsappPhone: '+15550009001', ace1Phone: '+15550009002', ace2Phone: '+15550009003',
  captain: { firstName: captain, singlesUtr: 600, doublesUtr: null }, ace1: { fullName: `Hidden Ace One ${captain}`, singlesUtr: 600, doublesUtr: null }, ace2: { fullName: `Hidden Ace Two ${captain}`, singlesUtr: 600, doublesUtr: null },
  selectedTier: 'higher', consent: true, rulesAccepted: true });

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
  await expect(page.locator('.champ-season', { hasText: 'Season 1' }).locator('.winner-card')).toHaveCount(2);
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
  await adminLogin(page);
  const panel = page.locator('#admin-firebase');
  await expect(panel).toContainText('Bundled snapshot');
  await panel.getByRole('button', { name: 'Copy Season 1 into Firebase' }).click();
  await expect(panel).toContainText('Firebase · 73 matches');
  await page.goto('/champions');
  await expect(page.locator('.winner-card', { hasText: 'GOAT tier' }).getByRole('heading', { name: 'Team A1' })).toBeVisible();
});

test('admin can show captains only, which hides the other players in cards, search and export', async ({ page }) => {
  await adminLogin(page);
  await openRegistration(page);
  const reg = await page.request.post('/api/register', { data: sampleTeam('captain-only-test-0001', 'Zed') });
  expect(reg.ok(), await reg.text()).toBeTruthy();
  await page.reload();
  const card = page.locator('.team-admin', { hasText: 'Zed' });
  await page.getByLabel('Reveal Ace names in admin cards').check();
  await expect(card).toContainText('Hidden Ace One Zed');
  await page.getByLabel(/Captain only/).check();
  await expect(card).not.toContainText('Hidden Ace');
  await expect(card).not.toContainText('Ace 1 WhatsApp');
  await expect(card).toContainText('Captain WhatsApp');
  await expect(card).toContainText('Zed');
  await expect(page.getByLabel('Reveal Ace names in admin cards')).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel(/Captain only/)).toBeChecked();   // remembered
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export private CSV/ }).click()]);
  const csv = (await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
  expect(csv).toContain('Zed');
  expect(csv).not.toContain('Hidden Ace');
  expect(csv).not.toContain('Ace 1 full name');
});

test('League has Schedule and Score entry tabs', async ({ page }) => {
  await adminLogin(page);
  await openRegistration(page);
  expect((await page.request.post('/api/register', { data: sampleTeam('league-tabs-test-000001', 'Yan') })).ok()).toBeTruthy();
  await page.goto('/league');
  await expect(page.getByRole('tab', { name: 'Schedule' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Score entry' })).toBeVisible();
});
