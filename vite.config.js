import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { demoPlugin } from './scripts/demo-plugin.mjs';
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const privateFiles = { name: 'traice-private-files', configureServer(server) { server.middlewares.use((req, res, next) => { let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.statusCode = 400; res.end('Invalid URL'); return; } if (/(^|\/)(?:\.env(?:[./]|$)|\.local-demo(?:\/|$))/.test(pathname)) { res.statusCode = 403; res.end('Private local files are not served.'); return; } next(); }); } };
  return { plugins: [privateFiles, react(), ...(mode === 'demo' ? [demoPlugin(env)] : [])], server: { host: '127.0.0.1', port: 3000, strictPort: true, cors: false, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local-demo/**', '**/state.json', '**/state.json.tmp', path.resolve(env.TRAICE_DEMO_DATA_DIR || '.local-demo') + '/**'] } }, preview: { host: '127.0.0.1', port: 3000 }, build: { sourcemap: false } };
});
