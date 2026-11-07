import os from 'node:os';
import { defineConfig } from '@playwright/test';

// The browser tests run in parallel: each worker gets its own demo server (its own port and its own data folder), so
// teams one test registers never use up room for another. A spec file always runs inside a single worker, in order.
// By default half the CPU cores, at most 4 (each worker is a server plus a browser); PW_WORKERS=1 runs one at a time.
const WORKERS = Math.max(1, Number(process.env.PW_WORKERS) || Math.min(4, Math.floor(os.cpus().length / 2))), BASE_PORT = 3100, stamp = Date.now();
export default defineConfig({
  testDir: './tests/browser', workers: WORKERS, fullyParallel: false,
  use: { baseURL: `http://127.0.0.1:${BASE_PORT}`, launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  webServer: Array.from({ length: WORKERS }, (_, i) => ({
    command: `npm run demo -- --port ${BASE_PORT + i}`, port: BASE_PORT + i, reuseExistingServer: false,
    env: { TRAICE_ADMIN_PASSWORD: 'local-e2e-test-password', TRAICE_DEMO_DATA_DIR: `.local-demo/e2e-${stamp}-${i}` }
  })),
  reporter: 'list', timeout: 45000, expect: { timeout: 15000 }
});
