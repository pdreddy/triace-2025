import { test, expect, acceptRulesFast , showEverything } from './fixtures.js';

async function adminLogin(page) {
  await showEverything(page);await page.goto('/admin/login');
  await page.getByLabel(/username/i).fill('reddi2026');
  await page.getByLabel(/password/i).fill('local-e2e-test-password');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/home$/);   // sign-in lands on Player Home
  await page.goto('/admin');
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
  await expect(rising.getByText('Hari Mothukuri')).toBeVisible();
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

// ---- Early bird ----
const localDay = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const acceptRules = acceptRulesFast;
async function savePlan(page, { enabled = true, opens, ends, fee }) {
  const box = page.getByLabel('Show the early bird to visitors');
  if ((await box.isChecked()) !== enabled) await box.setChecked(enabled);
  await page.getByLabel('Early bird opens').fill(opens);
  await page.getByLabel('Last early-bird day').fill(ends);
  await page.getByLabel('Late fee (US$ more)').fill(String(fee));
  await page.getByRole('button', { name: 'Save early-bird settings' }).click();
  await expect(page.getByText('Early-bird settings saved', { exact: false })).toBeVisible();
}

test('early bird: shown on every page, editable by the admin without a rebuild', async ({ page, browser }) => {
  await adminLogin(page);
  await savePlan(page, { opens: localDay(-1), ends: localDay(3), fee: 25 });          // open now: 4 days left
  const visitor = await (await browser.newContext()).newPage();
  for (const route of ['/triace', '/tiers', '/league', '/champions', '/history', '/captain']) {
    await visitor.goto(route);
    const bar = visitor.locator('.early-bar');
    await expect(bar, `${route} shows the early-bird bar`).toBeVisible();
    await expect(bar).toContainText('4 days left');
    await expect(bar).toContainText('+$25');
  }
  await acceptRules(visitor);
  await visitor.goto('/register');
  const card = visitor.locator('.early-card');
  await expect(card).toContainText('Early-bird registration is open');
  await expect(card).toContainText('registration costs $25 more');
  await expect(card.locator('.early-steps li')).toHaveCount(3);
  await expect(card.locator('.early-steps li.current')).toHaveCount(1);
  await visitor.screenshot({ path: 'test-results/early-bird-register.png' });
  // the rules card shows it too
  await visitor.goto('/triace');
  await expect(visitor.locator('.rule-card.hero .early-bird')).toContainText('+$25');

  await savePlan(page, { opens: localDay(-10), ends: localDay(-2), fee: 25 });        // ended: the late fee applies now
  await visitor.goto('/register');
  await expect(visitor.locator('.early-card')).toContainText('Early-bird registration ended');
  await expect(visitor.locator('.early-card')).toContainText('costs $25 more');
  await expect(visitor.locator('.early-bar')).toHaveCount(0);                          // the top bar is only for open / coming up

  await savePlan(page, { opens: localDay(5), ends: localDay(9), fee: 10 });            // coming up
  await visitor.goto('/triace');
  await expect(visitor.locator('.early-bar')).toContainText('Opens in 5 days');

  await savePlan(page, { enabled: false, opens: localDay(5), ends: localDay(9), fee: 10 });   // off: nothing anywhere
  await visitor.goto('/triace');
  await expect(visitor.locator('.early-bar')).toHaveCount(0);
  await expect(visitor.locator('.rule-card.hero .early-bird')).toHaveCount(0);
  await visitor.goto('/register');
  await expect(visitor.locator('.early-card')).toHaveCount(0);

  await savePlan(page, { opens: '2026-11-06', ends: '2026-11-13', fee: 10 });          // put the real plan back
});

test('early bird: the admin cannot save an impossible plan', async ({ page }) => {
  await adminLogin(page);
  await page.getByLabel('Early bird opens').fill('2026-11-20');
  await page.getByLabel('Last early-bird day').fill('2026-11-13');
  await expect(page.getByText('cannot end before it opens')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save early-bird settings' })).toBeDisabled();
});

test('setup check page: in the demo it says there is no Firebase to check, and offers the report', async ({ page }) => {
  await page.goto('/status');
  await expect(page.getByRole('heading', { name: /Setup\s+check/i })).toBeVisible();
  await expect(page.getByText('Everything checked is working')).toBeVisible();
  await expect(page.getByText('there is no Firebase to check')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy report' })).toBeEnabled();
  await showEverything(page);await page.goto('/admin/login');
  await expect(page.getByRole('link', { name: 'Setup check' })).toBeVisible();
});
