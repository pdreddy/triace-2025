import { expect, test } from '@playwright/test';
test('installed app keeps the exact rules document available offline', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const rules = page.frameLocator('iframe[title="Complete Triace 2.0 tournament rules"]');
  await expect(rules.getByRole('heading', { name: /Triace 2.0/i })).toBeVisible();
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(rules.getByRole('heading', { name: /Triace 2.0/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
