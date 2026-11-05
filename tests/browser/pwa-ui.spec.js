import { test, expect } from '@playwright/test';

// Every page must feel right in an installed phone app: no sideways scrolling, inputs that don't make iOS zoom, tappable controls.
const ROUTES = ['/', '/tiers', '/league', '/players', '/champions', '/partners', '/history', '/history/s1', '/captain', '/admin/login', '/team/none', '/no-such-page'];
const SIZES = [[320, 568], [360, 740], [390, 844]];

for (const [width, height] of SIZES) {
  test(`every page suits an installed phone app at ${width}x${height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForTimeout(500);
      const result = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth - innerWidth,
        smallInputs: [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea')].filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.getAttribute('aria-label') || e.id || e.name),
        tinyTargets: [...document.querySelectorAll('a, button, [role=tab]')].filter(e => { const r = e.getBoundingClientRect(); return e.offsetParent && r.width > 0 && (r.height < 32 || r.width < 32) && !e.closest('.deck-dots') && !e.matches('.meter-key'); }).map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30))
      }));
      expect(result.overflowX, `${route} scrolls sideways`).toBeLessThanOrEqual(0);
      expect(result.smallInputs, `${route} has inputs under 16px (iOS would zoom in)`).toEqual([]);
      expect(result.tinyTargets, `${route} has tap targets under 32px`).toEqual([]);
    }
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('the sign-in pages are one compact card', async ({ page }) => {
  for (const route of ['/admin/login', '/captain']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    const card = page.locator('.auth-card');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box.height, `${route} card is compact`).toBeLessThan(480);
    expect(box.width).toBeLessThanOrEqual(400);
    expect(await page.evaluate(() => document.querySelector('main').scrollHeight <= document.querySelector('main').clientHeight + 1)).toBeTruthy();
  }
});

test('the top bar fits at tablet, laptop and desktop widths, with the Find a partner tab', async ({ page }) => {
  for (const [width, label] of [[820, 'Partner'], [1024, 'Find a partner'], [1280, 'Find a partner'], [1440, 'Find a partner'], [1920, 'Find a partner']]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/partners');
    const tab = page.locator('.tabs a[href="/partners"]');
    await expect(tab).toBeVisible();
    await expect(tab).toHaveText(new RegExp(`^${label}$`, 'i'));
    await expect(tab).toHaveAttribute('aria-label', 'Find a partner');
    const overflow = await page.evaluate(() => { const bar = document.querySelector('.topbar-inner'); return bar.scrollWidth - bar.clientWidth; });
    expect(overflow, `the top bar overflows at ${width}px`).toBeLessThanOrEqual(0);
  }
});
