import { test, expect, acceptRulesFast } from './fixtures.js';

// iPhone 15 size. Registration is one step per screen in a fixed-height page; the form and its Next button must stay
// reachable (the early-bird card once filled the screen and hid them), and search boxes must stay one line tall.
test.use({ viewport: { width: 393, height: 660 }, hasTouch: true, isMobile: true });

test('phone: registration Next button is reachable above the tab bar', async ({ page }) => {
  await acceptRulesFast(page);
  await page.goto('/register');
  const next = page.getByRole('button', { name: /^Next/ });
  await expect(next).toBeVisible();
  const box = await next.boundingBox(), tabs = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(tabs.y);
  expect(await page.locator('.step-panel.on').evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThan(150);
});

test('phone: search boxes are one line tall', async ({ page }) => {
  await page.goto('/players');
  const search = page.getByRole('searchbox', { name: 'Search players' });
  await expect(search).toBeVisible();
  expect((await search.boundingBox()).height).toBeLessThanOrEqual(56);
});
