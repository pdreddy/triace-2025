import { test, expect } from './fixtures.js';
// Named zz- so it runs last: it leaves teams, fixtures and dates behind in the shared demo state, which other specs do not expect.

async function adminLogin(page, user = 'reddi2026', password = 'local-e2e-test-password') {
  await page.goto('/admin/login');
  await page.getByLabel(/username/i).fill(user);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page.locator('#admin-firebase')).toBeVisible();
}
const team = (id, captain, utr) => ({
  teamId: id, whatsappPhone: '+15550009101', ace1Phone: '+15550009102', ace2Phone: '+15550009103',
  captain: { firstName: captain, singlesUtr: utr, doublesUtr: null }, ace1: { fullName: `Ace One ${captain}`, singlesUtr: utr, doublesUtr: null }, ace2: { fullName: `Ace Two ${captain}`, singlesUtr: utr, doublesUtr: null },
  selectedTier: 'higher', consent: true, rulesAccepted: true });

test('admin sets the calendar, auto-schedules every tier with buffer weeks, and adds a buffer later', async ({ page }) => {
  await adminLogin(page);
  for (const [i, name] of ['Cal', 'Dee', 'Eli'].entries()) { const r = await page.request.post('/api/register', { data: team(`calendar-test-team-000${i}`, name, 600) }); expect(r.ok(), await r.text()).toBeTruthy(); }
  await page.reload();
  const card = page.locator('.calendar-admin');
  await card.getByLabel('Season (round 1) starts').fill('2027-01-04');
  await card.getByLabel('Buffer weeks').fill('1:1');
  await expect(card.locator('.early-preview')).toContainText('R2 Mon, Jan 18');   // round 1 + 1 week + 1 buffer week
  await card.getByRole('button', { name: 'Save calendar' }).click();
  await expect(card.getByText('Calendar saved')).toBeVisible();
  page.once('dialog', d => d.accept());
  await card.getByRole('button', { name: 'Auto-schedule all tiers' }).click();
  await expect(card.locator('.auto-result li').first()).toContainText('rounds from 2027-01-04');
  await card.getByLabel('Add buffer after round').fill('2');
  await card.getByRole('button', { name: /Add buffer/ }).click();
  await expect(card.getByText('Added a 1-week buffer after round 2')).toBeVisible();
  await page.reload();
  await expect(page.locator('.calendar-admin').getByLabel('Buffer weeks')).toHaveValue('1:1, 2:1');
});

test('registration closes itself after the last registration day', async ({ page }) => {
  await adminLogin(page);
  const card = page.locator('.calendar-admin');
  await card.getByLabel('Last registration day').fill('2020-01-01');
  await card.getByLabel('Season (round 1) starts').fill('2027-01-04');
  await card.getByRole('button', { name: 'Save calendar' }).click();
  await expect(card.getByText('Calendar saved')).toBeVisible();
  try {
    const refused = await page.request.post('/api/register', { data: team('calendar-closed-team-0001', 'Zoe', 600) });
    expect(refused.status()).toBe(400);
    expect(await refused.text()).toContain('Registration closed on 2020-01-01.');
  } finally {   // never leave registration closed for anything that runs after
    const reopened = await page.request.post('/api/calendar', { data: { registrationOpens: '', registrationCloses: '', seasonStart: '2027-01-04', roundDays: 7, buffers: [], playoffGapWeeks: 1 } });
    expect(reopened.ok()).toBeTruthy();
  }
});

test('admin adds another admin, who can sign in; resets and removes them', async ({ page, browser }) => {
  await adminLogin(page);
  const box = page.locator('.admins-admin');
  await box.getByLabel(/New admin/).fill('coadmin');
  await box.getByRole('button', { name: 'Add admin' }).click();
  const password = (await box.getByLabel('Admin password').textContent()).trim();
  expect(password).toMatch(/^[a-z2-9]{12}$/);
  const other = await (await browser.newContext()).newPage();
  await adminLogin(other, 'coadmin', password);
  await other.context().close();
  await box.getByRole('button', { name: 'Reset password' }).last().click();
  await expect(box.getByLabel('Admin password')).not.toHaveText(password);
  page.once('dialog', d => d.accept());
  await box.locator('li', { hasText: 'coadmin' }).getByRole('button', { name: 'Remove' }).click();
  await expect(box.locator('li', { hasText: 'coadmin' })).toHaveCount(0);
  await expect(box.locator('li', { hasText: '(you)' })).toHaveCount(1);
  await expect(box.locator('li', { hasText: '(you)' }).getByRole('button', { name: 'Remove' })).toHaveCount(0);
});

test('admin downloads a full backup file with the registrations', async ({ page }) => {
  await adminLogin(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download full backup/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^traice-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await (await import('node:fs/promises')).readFile(await file.path(), 'utf8'));
  expect(Object.keys(backup.registrations).length).toBeGreaterThan(0);
  expect(JSON.stringify(backup.registrations)).toContain('+1555');       // private phone numbers are in the admin's backup
  expect(backup.calendar.seasonStart).toBe('2027-01-04');
});
