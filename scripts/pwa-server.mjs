// Builds a production copy into dist-pwa and serves it, for the offline test. Firebase is pointed at an
// unreachable address so the test never touches your real project or creates users in it.
import { spawnSync, spawn } from 'node:child_process';
const port = process.env.PWA_PORT || '3200';
const env = { ...process.env, VITE_FIREBASE_API_KEY: 'pwa-test', VITE_FIREBASE_AUTH_DOMAIN: 'localhost', VITE_FIREBASE_DATABASE_URL: 'http://127.0.0.1:9', VITE_FIREBASE_PROJECT_ID: 'pwa-test', VITE_FIREBASE_APP_ID: 'pwa-test', VITE_USE_EMULATORS: 'false' };
const build = spawnSync('npx', ['vite', 'build', '--outDir', 'dist-pwa', '--emptyOutDir'], { env, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-pwa', '--port', port, '--strictPort'], { env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.kill(); process.exit(0); });
server.on('exit', code => process.exit(code ?? 0));
