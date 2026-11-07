import { test, expect } from '@playwright/test';
import { buildMultiClub } from '../../functions/lib/pprcMigrate.js';

const court = (label, type, a, b, ga, gb) => ({ label, type, players: { team1: a, team2: b }, g1: ga, g2: gb, winnerTeamNum: ga > gb ? 1 : 2 });
let n = 0; // distinct totals, so the migration does not treat the matches as one match listed twice
const match = (ts, t1, t2, lines) => ({ ts, t1, t2, g1: 8, g2: 3 + n++, s1: 1, s2: 0, status: 'APPROVED', lines });
const day = (y, m, d) => Date.UTC(y, m, d);
function fixture() {
  const koc1 = {}, koc3 = {}, tri = {};
  for (let i = 0; i < 3; i++) koc1[`o${i}`] = match(day(2024, 11, 1 + i), 'Rudra', 'Agni', [court('Singles 1', 'singles', ['Dinkar Bhardwaj'], ['Rajesh Mishra'], 8, 3)]);
  for (let i = 0; i < 3; i++) koc1[`p${i}`] = match(day(2025, 5, 1 + i), 'Rudra', 'Agni', [court('Singles 1', 'singles', ['Dinkar Bhardwaj'], ['Rajesh Mishra'], 3, 8)]);
  for (let i = 0; i < 8; i++) koc3[`k${i}`] = match(day(2026, 6, 1 + i), 'Rudra', 'Agni', [court('Doubles 1', 'doubles', ['Dinkar Bhardwaj', 'Krishna Vennapusa'], ['Rajesh Mishra', 'Hari Mothukuri'], 8, 5)]);
  for (let i = 0; i < 2; i++) tri[`t${i}`] = match(day(2026, 8, 1 + i), 'Team A', 'Team B', [court('S1', 'singles', ['Dinkar Bhardwaj'], ['Rajesh Mishra'], 8, 2)]);
  return buildMultiClub({
    koc_users_grades: ['Dinkar Bhardwaj', 'Krishna Vennapusa', 'Rajesh Mishra', 'Hari Mothukuri'].map((name, i) => ({ name, s: 6 - i * 0.3, d: 6 - i * 0.3 })),
    KOC2DB: koc1, koc_s3: { matches: koc3 }, TriAceDBNEW: tri
  }).tree;
}

test('PPRC profile: latest ten with the game type, older matches by year, a year opens on click', async ({ page }) => {
  const tree = fixture(), requested = [];
  await page.route('**/multiclub-890ea-default-rtdb.firebaseio.com/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/|\.json$/g, '');
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
  await page.route('**/multiclub-890ea-default-rtdb.firebaseio.com/**', route => route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"Permission denied"}' }));
  await page.goto('/pprc');
  await expect(page.getByText('The player data is not readable yet.')).toBeVisible();
});

async function acceptRules(page) {
  await page.goto('/');
  for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Next rule card' }).click();
  await page.getByRole('checkbox', { name: /read all sections/ }).check();
  await page.getByRole('button', { name: 'Agree to rules' }).click();
}

test('registration finds players already in PPRC, links them, and carries their ratings', async ({ page }) => {
  const tree = fixture();
  await page.route('**/multiclub-890ea-default-rtdb.firebaseio.com/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/|\.json$/g, '');
    const value = path.split('/').reduce((node, key) => (node == null ? node : node[key]), tree);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(value ?? null) });
  });
  await acceptRules(page);
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Register team ↗' })).toBeEnabled();
  await page.getByLabel('Captain first name', { exact: true }).fill('John');
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
  expect(JSON.parse((await sent).postData()).pprcIds).toEqual({ ace1: 'p_krishna_vennapusa' });
  await expect(page.getByRole('status').filter({ hasText: 'Team registered successfully' })).toBeVisible();
});

test('registration still works when the shared player list cannot be read', async ({ page }) => {
  await page.route('**/multiclub-890ea-default-rtdb.firebaseio.com/**', route => route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"Permission denied"}' }));
  await acceptRules(page);
  await page.goto('/register');
  await page.getByLabel('Ace 1 full name').fill('Someone Else');
  await expect(page.getByTestId('pprc-suggest')).toHaveCount(0);
  await expect(page.getByLabel('Ace 1 full name')).toHaveValue('Someone Else');
});
