// Every spec imports test and expect from here: the same as Playwright's, except each worker talks to its own demo
// server (see playwright.config.js), so tests running side by side never share data.
import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

export const test = base.extend({
  demoServer: [async ({}, use, workerInfo) => {
    let activeFile, activeURL, stop;
    async function start() {
      const port = Number(process.env.PW_BASE_PORT || 3100) + workerInfo.parallelIndex;
      const url = `http://127.0.0.1:${port}`;
      // Fail on a busy port rather than accidentally testing somebody else's server.
      const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'demo', '--port', String(port)], {
        env: { ...process.env, TRAICE_ADMIN_PASSWORD: 'local-e2e-test-password',
          TRAICE_DEMO_DATA_DIR: `.local-demo/e2e-${process.pid}-${workerInfo.workerIndex}-${Date.now()}` },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      stop = shutdown;
      let output = '', failure;
      server.stdout.on('data', data => { output += data; });
      server.stderr.on('data', data => { output += data; });
      server.on('error', error => { failure = error; });
      try {
        const deadline = Date.now() + 30000;
        while (true) {
          if (failure || server.exitCode !== null) throw failure || new Error(`Demo exited: ${output}`);
          // Vite logs readiness only after successfully binding its port.
          if (output.includes(url)) {
            try {
              const response = await fetch(`${url}/api/session`, { signal: AbortSignal.timeout(1000) });
              if (response.ok && (await response.json()).uid) break;
            } catch { /* still starting */ }
          }
          if (Date.now() > deadline) throw new Error(`Demo did not become ready: ${output}`);
          await delay(50);
        }
        return url;
      } catch (error) {
        await shutdown();
        throw error;
      }
      async function shutdown() {
        if (server.exitCode === null) {
          const exited = once(server, 'exit');
          server.kill('SIGTERM');
          const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
          await exited;
          clearTimeout(timer);
        }
      }
    }
    try {
      await use(async file => {
        if (file !== activeFile) {
          if (stop) await stop();
          activeURL = await start();
          activeFile = file;
        }
        return activeURL;
      });
    } finally { if (stop) await stop(); }
  }, { scope: 'worker' }],
  baseURL: async ({ demoServer }, use, testInfo) => { await use(await demoServer(testInfo.file)); }
});
export { expect };

// Signs the visitor past the rules wall without flipping through all ten cards (that flow has its own test, the one
// named "rules cards must all be read and agreed"). Saves several seconds in every test that needs to register.
export async function acceptRulesFast(page) {
  await page.addInitScript(() => { try { sessionStorage.setItem('traice-rules-accepted-v1', 'yes'); } catch { /* storage blocked */ } });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Register team ↗' })).toBeVisible();
}

// The admin page now shows one section at a time (and the teams as a table). Specs written for the long page ask for
// everything at once, with the team cards, on screens wider than a phone; the layout spec and the phone test do not.
export async function showEverything(page) {
  await page.addInitScript(() => { try { if (window.innerWidth > 700) { localStorage.setItem('traice.admin.tab', 'all'); localStorage.setItem('traice.admin.teamsView', 'cards'); } } catch { /* storage blocked */ } });
}
