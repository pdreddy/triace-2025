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
