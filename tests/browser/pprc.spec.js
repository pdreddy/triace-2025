import { test, expect, acceptRulesFast } from './fixtures.js';
import fs from 'node:fs';
import { buildMultiClub } from '../../functions/lib/pprcMigrate.js';

const court = (label, type, a, b, ga, gb) => ({ label, type, players: { team1: a, team2: b }, g1: ga, g2: gb, winnerTeamNum: ga > gb ? 1 : 2 });
let n = 0; // distinct totals, so the migration does not treat the matches as one match listed twice
const match = (ts, t1, t2, lines) => ({ ts, t1, t2, g1: 8, g2: 3 + n++, s1: 1, s2: 0, status: 'APPROVED', lines });
const day = (y, m, d) => Date.UTC(y, m, d);
function fixture({ newbie = false } = {}) {
  const koc1 = {}, koc3 = {}, tri = {};
  for (let i = 0; i < 3; i++) koc1[`o${i}`] = match(day(2024, 11, 1 + i), 'Rudra', 'Agni', [court('Singles 1', 'singles', ['Dinkar Bhardwaj'], ['Rajesh Mishra'], 8, 3)]);
  for (let i = 0; i < 3; i++) koc1[`p${i}`] = match(day(2025, 5, 1 + i), 'Rudra', 'Agni', [court('Singles 1', 'singles', ['Dinkar Bhardwaj'], ['Rajesh Mishra'], 3, 8)]);
  for (let i = 0; i < 8; i++) koc3[`k${i}`] = match(day(2026, 6, 1 + i), 'Rudra', 'Agni', [court('Doubles 1', 'doubles', ['Dinkar Bhardwaj', 'Krishna Vennapusa'], ['Rajesh Mishra', 'Hari Mothukuri'], 8, 5)]);
  for (let i = 0; i < 2; i++) tri[`t${i}`] = match(day(2026, 8, 1 + i), 'Team A', 'Team B', [court('S1', 'singles', ['Dinkar Bhardwaj'], ['Rajesh Mishra'], 8, 2)]);
  const names = ['Dinkar Bhardwaj', 'Krishna Vennapusa', 'Rajesh Mishra', 'Hari Mothukuri'];
  if (newbie) { names.push('Newbie Player'); for (let i = 0; i < 3; i++) koc1[`n${i}`] = match(day(2025, 7, 1 + i), 'Rudra', 'Agni', [court('Singles 1', 'singles', ['Newbie Player'], ['Rajesh Mishra'], 8, 4)]); }
  return buildMultiClub({
    koc_users_grades: names.map((name, i) => ({ name, s: 6 - i * 0.3, d: 6 - i * 0.3 })),
    KOC2DB: koc1, koc_s3: { matches: koc3 }, TriAceDBNEW: tri
  }).tree;
}

test('PPRC profile: latest ten with the game type, older matches by year, a year opens on click', async ({ page }) => {
  const tree = fixture(), requested = [];
  await page.route('**/pprc-db/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/pprc-db\/|\.json$/g, '');
    requested.push(path);
    const value = path.split('/').reduce((node, key) => (node == null ? node : node[key]), tree);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(value ?? null) });
  });

  await page.goto('/pprc');
  await expect(page.getByTestId('pprc-list').locator('li')).toHaveCount(4);
  await page.getByLabel('Search players').fill('dinkar');
  await expect(page.getByTestId('pprc-list').locator('li')).toHaveCount(1);
  await page.getByLabel('Club').selectOption('triace');
  await expect(page.getByTestId('pprc-list').locator('li')).toHaveCount(1);
  await page.getByRole('link', { name: 'Dinkar Bhardwaj' }).click();

  await expect(page.getByRole('heading', { name: 'Dinkar Bhardwaj' })).toBeVisible();
  const recent = page.getByTestId('pprc-recent').getByTestId('pprc-match');
  await expect(recent).toHaveCount(10);
  await expect(recent.first()).toContainText('Triace');
  await expect(recent.first()).toContainText('Season 1');
  await expect(recent.nth(2)).toContainText('KOC');
  await expect(recent.nth(2)).toContainText('With Krishna Vennapusa');
  await expect(page.getByTestId('pprc-year-2025')).toContainText('3 matches');
  await expect(page.getByTestId('pprc-year-2024')).toContainText('3 matches');
  expect(requested.some(p => p.includes('ratingHistory'))).toBe(false); // nothing from the years is downloaded until one is opened

  await page.getByTestId('pprc-year-2025').locator('summary').click();
  await expect(page.getByTestId('pprc-year-2025').getByTestId('pprc-match')).toHaveCount(3);
  expect(requested.filter(p => p.includes('ratingHistory'))).toHaveLength(1);
  await expect(page.getByTestId('pprc-year-2024').getByTestId('pprc-match')).toHaveCount(0);
});

test('PPRC pages explain when the data cannot be read', async ({ page }) => {
  await page.route('**/pprc-db/**', route => route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"Permission denied"}' }));
  await page.goto('/pprc');
  await expect(page.getByText('The player data is not readable yet.')).toBeVisible();
});

// The demo server is shared by every spec and a tier holds a limited number of teams, so a test that registers a team
// withdraws it afterwards instead of leaving later specs without room.
const withdraw = (page, teamId) => page.request.post('/api/withdraw-team', { data: { teamId } });

const acceptRules = acceptRulesFast;

test('registration finds players already in PPRC, links them, and carries their ratings', async ({ page }) => {
  const tree = fixture();
  await page.route('**/pprc-db/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/pprc-db\/|\.json$/g, '');
    const value = path.split('/').reduce((node, key) => (node == null ? node : node[key]), tree);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(value ?? null) });
  });
  await acceptRules(page);
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Register team ↗' })).toBeEnabled();
  await page.getByLabel('Captain first name', { exact: true }).fill('John');
  await page.getByLabel('Captain last name (private)').fill('Tester');
  await page.getByLabel('Captain WhatsApp number (private)').fill('+15551234567');
  await page.getByLabel('Ace 1 WhatsApp number (private)').fill('+15551234568');
  await page.getByLabel('Ace 2 WhatsApp number (private)').fill('+15551234569');
  await page.getByLabel('Ace 2 full name').fill('Secret Beta');
  await page.locator('#captain-utr').fill('6'); await page.locator('#ace2-utr').fill('6');

  await page.getByLabel('Ace 1 full name').fill('krishna ven');
  const suggest = page.getByTestId('pprc-suggest');
  await expect(suggest).toContainText('Krishna Vennapusa');
  await expect(suggest).toContainText('KOC');
  await suggest.getByRole('button', { name: /Krishna Vennapusa/ }).click();
  await expect(page.getByTestId('pprc-linked')).toContainText('Krishna Vennapusa');
  await expect(page.getByLabel('Ace 1 full name')).toHaveValue('Krishna Vennapusa');
  await expect(page.locator('#ace1-utr')).not.toHaveValue('');
  expect(Number(await page.locator('#ace1-utr').inputValue())).toBeGreaterThan(1);

  await page.getByLabel('Ace 1 full name').fill('Krishna Vennapusa x');
  await expect(page.getByTestId('pprc-linked')).toHaveCount(0); // editing the name unlinks it
  await page.getByLabel('Ace 1 full name').fill('krishna ven');
  await page.getByTestId('pprc-suggest').getByRole('button', { name: /Krishna Vennapusa/ }).click();
  await page.getByRole('checkbox', { name: /permission to register/ }).check();
  const sent = page.waitForRequest(r => r.url().includes('register') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Register team ↗' }).click();
  const body = JSON.parse((await sent).postData());
  expect(body.pprcIds).toEqual({ ace1: 'p_krishna_vennapusa' });
  await expect(page.getByRole('status').filter({ hasText: 'Team registered successfully' })).toBeVisible();
  expect((await withdraw(page, body.teamId)).ok()).toBe(true);
});

test('registration still works when the shared player list cannot be read', async ({ page }) => {
  await page.route('**/pprc-db/**', route => route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"Permission denied"}' }));
  await acceptRules(page);
  await page.goto('/register');
  await page.getByLabel('Ace 1 full name').fill('Someone Else');
  await expect(page.getByTestId('pprc-suggest')).toHaveCount(0);
  await expect(page.getByLabel('Ace 1 full name')).toHaveValue('Someone Else');
});

async function login(page) {
  await page.goto('/admin/login');
  await page.getByLabel('Username or email').fill('reddi2026');
  await page.getByLabel('Password', { exact: true }).fill('local-e2e-test-password');
  await page.getByRole('button', { name: 'Sign in ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('button', { name: 'Save configuration ↗' })).toBeEnabled();
}
const serveMaster = (page, tree) => page.route('**/pprc-db/**', route => {
  const path = new URL(route.request().url()).pathname.replace(/^\/pprc-db\/|\.json$/g, '');
  const value = path.split('/').reduce((node, key) => (node == null ? node : node[key]), tree);
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(value ?? null) });
});

test('admin links registered players to PPRC; the tier list shows PPRC with a tick after more than 5 matches, otherwise NR', async ({ browser }) => {
  const tree = fixture({ newbie: true });
  const player = await (await browser.newContext()).newPage(), admin = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await serveMaster(player, tree); await serveMaster(admin, tree);

  await acceptRules(player);
  await player.goto('/register');
  await expect(player.getByRole('button', { name: 'Register team ↗' })).toBeEnabled();
  await player.getByLabel('Captain first name', { exact: true }).fill('LinkCap');
  await player.getByLabel('Captain last name (private)').fill('Tester');
  await player.getByLabel('Captain WhatsApp number (private)').fill('+15551234567');
  await player.getByLabel('Ace 1 WhatsApp number (private)').fill('+15551234568');
  await player.getByLabel('Ace 2 WhatsApp number (private)').fill('+15551234569');
  await player.getByLabel('Ace 1 full name').fill('Dinkar Bhardwaj');
  await player.getByLabel('Ace 2 full name').fill('Newbie Player');
  for (const key of ['captain', 'ace1', 'ace2']) await player.locator(`#${key}-utr`).fill('6');
  await player.getByRole('checkbox', { name: /permission to register/ }).check();
  const registered = player.waitForRequest(r => r.url().includes('register') && r.method() === 'POST');
  await player.getByRole('button', { name: 'Register team ↗' }).click();
  const teamId = JSON.parse((await registered).postData()).teamId;
  await expect(player.getByRole('status').filter({ hasText: 'Team registered successfully' })).toBeVisible();

  await login(admin);
  const section = admin.getByTestId('pprc-admin');
  const row = label => section.locator('tbody tr').filter({ hasText: 'LinkCap’s team' }).filter({ hasText: label });
  await expect(row('Dinkar Bhardwaj')).toContainText('Ace 1');
  await row('Dinkar Bhardwaj').getByRole('button', { name: /Link Dinkar Bhardwaj/ }).click();
  await expect(admin.getByText(/PPRC: 1 linked/)).toBeVisible();
  await row('Newbie Player').getByRole('button', { name: /Link Newbie Player/ }).click();
  await expect(row('Newbie Player')).toContainText('3 matches');
  await expect(row('Newbie Player')).toContainText('NR');
  await expect(row('Dinkar Bhardwaj').getByLabel(/PPRC .*verified/)).toHaveCount(1);
  await expect(section).toContainText('2 of ');

  const card = page => page.locator('.team-card').filter({ hasText: 'LinkCap’s team' });
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/tiers');
  await expect(card(visitor).getByLabel(/PPRC .*verified/)).toHaveCount(1);
  await expect(card(visitor).getByLabel(/PPRC .*verified/)).toContainText('PPRC 5.');
  await expect(card(visitor).locator('.pprc-badge.ok svg.verified-seal')).toHaveCount(1);
  await expect(card(visitor).getByLabel('PPRC not rated')).toHaveCount(2);
  await expect(card(visitor)).not.toContainText('p_dinkar');

  const download = admin.waitForEvent('download');
  await admin.getByRole('button', { name: 'Export for PPRC' }).click();
  const exported = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
  const mine = exported.players.filter(p => p.name === 'Dinkar Bhardwaj' || p.name === 'Newbie Player');
  expect(mine.map(p => p.pprcId).sort()).toEqual(['p_dinkar_bhardwaj', 'p_newbie_player']);

  await admin.getByRole('button', { name: 'Refresh linked' }).click();
  await expect(admin.getByText(/Refreshed \d+ linked players/)).toBeVisible();
  await row('Dinkar Bhardwaj').getByRole('button', { name: 'Unlink' }).click();
  await expect(admin.getByText(/PPRC: 0 linked, 1 unlinked/)).toBeVisible();
  await visitor.reload();
  await expect(card(visitor).getByLabel(/PPRC .*verified/)).toHaveCount(0);
  await expect(card(visitor).getByLabel('PPRC not rated')).toHaveCount(3);
  expect((await withdraw(player, teamId)).ok()).toBe(true);
});
