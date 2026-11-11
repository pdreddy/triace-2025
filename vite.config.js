import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { demoPlugin } from './scripts/demo-plugin.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// After the build, list every emitted JS/CSS file in dist/sw.js so all pages work offline, and version the cache by content.
const pwaPrecache = () => {
  let outDir = 'dist', files = [];
  return {
    name: 'traice-pwa-precache', apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    generateBundle(_, bundle) { files = Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).sort(); },
    closeBundle() {
      const file = path.resolve(outDir, 'sw.js');
      if (!existsSync(file)) return;
      const version = createHash('sha256').update(files.join('|')).update(readFileSync(file)).digest('hex').slice(0, 10);
      const urls = files.map(name => `/${name}`);
      writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_VERSION__', version).replace('/*__PRECACHE__*/[]', JSON.stringify(urls)));
    }
  };
};
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const privateFiles = { name: 'traice-private-files', configureServer(server) { server.middlewares.use((req, res, next) => { let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.statusCode = 400; res.end('Invalid URL'); return; } if (/(^|\/)(?:\.env(?:[./]|$)|\.local-demo(?:\/|$))/.test(pathname)) { res.statusCode = 403; res.end('Private local files are not served.'); return; } next(); }); } };
  return { plugins: [privateFiles, react(), pwaPrecache(), ...(mode === 'demo' ? [demoPlugin(env)] : [])], server: { host: '127.0.0.1', port: 3000, strictPort: true, cors: false, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local-demo/**', '**/state.json', '**/state.json.tmp', path.resolve(env.TRAICE_DEMO_DATA_DIR || '.local-demo') + '/**'] } }, preview: { host: '127.0.0.1', port: 3000 }, build: { sourcemap: false } };
});
