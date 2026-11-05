import { defineConfig } from '@playwright/test';
// Offline / installability test against a production build:  npm run test:pwa
export default defineConfig({
  testDir: './tests/pwa', workers: 1, fullyParallel: false, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:3200', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  webServer: { command: 'node scripts/pwa-server.mjs', url: 'http://127.0.0.1:3200/manifest.webmanifest', timeout: 120000, reuseExistingServer: false }
});
