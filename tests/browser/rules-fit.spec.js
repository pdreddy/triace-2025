import { test, expect } from './fixtures.js';

// No rule card may scroll at any common screen size (phones, tablets, laptops, desktops).
const SIZES = [[320, 568], [360, 640], [375, 667], [390, 844], [414, 896], [430, 932], [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]];

for (const [width, height] of SIZES) {
  test(`all rule cards fit without scrolling at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/triace');
    await expect(page.locator('.rule-card')).toHaveCount(10);
    await expect.poll(() => page.locator('.rule-card-body').first().evaluate(el => el.dataset.fit)).toBeTruthy();   // fitted
    const count = 10;
    for (let i = 0; i < count; i++) {
      const body = page.locator('.rule-card-body').nth(i);
      const { vertical, horizontal, fit } = await body.evaluate(el => ({ vertical: el.scrollHeight - el.clientHeight, horizontal: el.scrollWidth - el.clientWidth, fit: Number(el.dataset.fit || 1) }));
      expect(vertical, `card ${i + 1} scrolls vertically by ${vertical}px (fit ${fit})`).toBeLessThanOrEqual(1);
      expect(horizontal, `card ${i + 1} scrolls sideways by ${horizontal}px`).toBeLessThanOrEqual(1);
      expect(fit, `card ${i + 1} shrank too far to read`).toBeGreaterThanOrEqual(0.5);
      if (i < count - 1) await page.getByRole('button', { name: 'Next rule card' }).click();
    }
  });
}

test('cards refit when the window is resized', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/triace');
  await expect(page.locator('.rule-card')).toHaveCount(10);
  await page.setViewportSize({ width: 375, height: 667 });
  await expect.poll(() => page.locator('.rule-card-body').first().evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => page.locator('.rule-card-body').first().evaluate(el => Number(el.dataset.fit))).toBeGreaterThan(0.7);
});
