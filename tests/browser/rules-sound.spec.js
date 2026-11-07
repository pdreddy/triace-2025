import { test, expect } from '@playwright/test';

// A stand-in for the Web Audio API that counts the sounds the page asks for.
const FAKE_AUDIO = () => {
  const calls = { oscillators: 0, noise: 0, resumed: 0 };
  window.__audio = calls;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = extra => ({ connect: n => n, disconnect() {}, start() {}, stop() {}, ...extra });
  window.AudioContext = class {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.state = 'running'; }
    resume() { calls.resumed++; return Promise.resolve(); }
    createBuffer(_, length) { return { getChannelData: () => new Float32Array(length) }; }
    createOscillator() { calls.oscillators++; return node({ frequency: param(), type: '' }); }
    createBufferSource() { calls.noise++; return node({ buffer: null }); }
    createBiquadFilter() { return node({ frequency: param(), Q: { value: 0 }, type: '' }); }
    createGain() { return node({ gain: param() }); }
  };
};
const sounds = page => page.evaluate(() => window.__audio.oscillators + window.__audio.noise);

test('flash cards play a slice and ball bounces when they change, and the sound can be muted', async ({ page }) => {
  await page.addInitScript(FAKE_AUDIO);
  await page.goto('/');
  await expect(page.locator('.rule-card')).toHaveCount(10);
  await expect.poll(() => sounds(page)).toBeGreaterThan(0);          // welcome sound on the first card
  const before = await sounds(page);
  await page.getByRole('button', { name: 'Next rule card' }).click();
  await expect.poll(() => sounds(page)).toBeGreaterThan(before + 8);  // slice + swoosh + six bounces
  const toggle = page.locator('.sound-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();                                               // mute
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const muted = await sounds(page);
  await page.getByRole('button', { name: 'Next rule card' }).click();
  await page.waitForTimeout(400);
  expect(await sounds(page)).toBe(muted);
  await page.reload();                                                // the choice is remembered
  await expect(page.locator('.sound-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('flash cards still work when the browser has no audio', async ({ page }) => {
  await page.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; });
  await page.goto('/');
  await expect(page.locator('.rule-card')).toHaveCount(10);
  await page.getByRole('button', { name: 'Next rule card' }).click();
  await expect(page.locator('.rule-card.active')).toContainText('Team composition');
});
