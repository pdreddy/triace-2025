import os from 'node:os';
import { defineConfig } from '@playwright/test';

// Demo servers start on demand in tests/browser/fixtures.js.
// The browser tests run in parallel: each worker gets its own demo server (its own port and a fresh data folder per spec), so
// teams one test registers never use up room for another. A spec file always runs inside a single worker, in order.
// By default half the CPU cores, at most 4 (each worker is a server plus a browser); PW_WORKERS=1 runs one at a time.
const WORKERS = Math.max(1, Number(process.env.PW_WORKERS) || Math.min(4, Math.floor(os.cpus().length / 2)));
export default defineConfig({
  testDir: './tests/browser', workers: WORKERS, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:3100', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  reporter: 'list', timeout: 45000, expect: { timeout: 15000 }
});
