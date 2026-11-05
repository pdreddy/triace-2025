import { test, expect } from '@playwright/test';

const PAGES = [
  ['/', /./],
  ['/register', /./],
  ['/tiers', /./],
  ['/league', /./],
  ['/players', /./],
  ['/champions', /./],
  ['/partners', /./],
  ['/history', /./],
  ['/history/s1', /./],
  ['/team/any-team', /./],
  ['/player/any-team/captain', /./],
  ['/admin/login', /./],
  ['/admin', /./],
  ['/no-such-page', /./]
];

test('installs once, then every page opens offline from the cache', async ({ page, context }) => {
  await page.goto('/');
  // The service worker installs, takes control, and precaches the build.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15000 }).toBeTruthy();
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter(n => n.startsWith('triace-shell-'));
    const urls = (await Promise.all(names.map(async n => (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname)))).flat();
    return { names, urls };
  });
  expect(cached.names).toHaveLength(1);
  expect(cached.urls).toEqual(expect.arrayContaining(['/', '/offline.html', '/manifest.webmanifest']));
  expect(cached.urls.some(u => /\/assets\/Champions-.*\.js$/.test(u))).toBeTruthy();   // a page never visited yet
  expect(cached.urls.some(u => /\/assets\/History-.*\.js$/.test(u))).toBeTruthy();

  // Installable: manifest is valid JSON with icons the browser can fetch.
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok(), icon.src).toBeTruthy();

  await context.setOffline(true);
  for (const [path] of PAGES) {
    await page.goto(path);
    await expect(page.locator('nav.tabs'), `${path} shows the app shell offline`).toBeVisible();
    await expect(page.locator('body')).not.toContainText('ERR_INTERNET_DISCONNECTED');
  }
  // Season 1 is bundled, so Champions and History have real content with no network and no saved data.
  await page.goto('/champions');
  await expect(page.getByRole('heading', { name: /Season\s+champions/i })).toBeVisible();
  await expect(page.locator('.winner-card', { hasText: 'GOAT tier' }).getByRole('heading', { name: 'Team A1' })).toBeVisible();
  await page.goto('/history/s1');
  await expect(page.getByRole('heading', { name: 'Season 1' })).toBeVisible();
  await expect(page.locator('.six-week')).toHaveCount(3);
  await expect(page.getByText(/offline/i).first()).toBeVisible();   // the offline banner
  await context.setOffline(false);
});

test('a deep link works on a fresh visit (server rewrites every route to the app)', async ({ page }) => {
  for (const path of ['/champions', '/history/s1', '/league']) {
    const response = await page.goto(path);
    expect(response.status(), path).toBe(200);
    await expect(page.locator('nav.tabs')).toBeVisible();
  }
});
