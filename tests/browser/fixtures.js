// Every spec imports test and expect from here: the same as Playwright's, except each worker talks to its own demo
// server (see playwright.config.js), so tests running side by side never share data.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  baseURL: async ({}, use, testInfo) => { await use(`http://127.0.0.1:${3100 + testInfo.parallelIndex}`); }
});
export { expect };

// Signs the visitor past the rules wall without flipping through all ten cards (that flow has its own test, the one
// named "rules cards must all be read and agreed"). Saves several seconds in every test that needs to register.
export async function acceptRulesFast(page) {
  await page.addInitScript(() => { try { sessionStorage.setItem('traice-rules-accepted-v1', 'yes'); } catch { /* storage blocked */ } });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Register team ↗' })).toBeVisible();
}
