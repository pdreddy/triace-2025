import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/pwa',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 375, height: 812 }, serviceWorkers: 'allow', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4174', port: 4174, reuseExistingServer: false },
  reporter: 'list',
  timeout: 30000
});
