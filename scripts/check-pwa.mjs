// Checks the built app (dist/) is installable and works offline. Run after `npm run build`:  npm run check:pwa
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'dist');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) failed++; };
const read = file => readFileSync(path.join(dist, file), 'utf8');
const has = file => existsSync(path.join(dist, file.replace(/^\//, '')));
const pngSize = file => { const b = readFileSync(path.join(dist, file.replace(/^\//, ''))); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

if (!has('index.html')) { console.error(`No build found in ${dist}. Run npm run build first.`); process.exit(2); }
const html = read('index.html'), manifest = JSON.parse(read('manifest.webmanifest')), sw = read('sw.js');

console.log('Installability');
check('manifest linked from index.html', /rel="manifest"\s+href="\/manifest\.webmanifest"/.test(html));
check('theme-color, viewport-fit and apple-touch-icon set', html.includes('name="theme-color"') && html.includes('viewport-fit=cover') && /rel="apple-touch-icon"/.test(html));
for (const key of ['name', 'short_name', 'start_url', 'scope', 'id', 'background_color', 'theme_color']) check(`manifest.${key}`, !!manifest[key]);
check('display is standalone', manifest.display === 'standalone');
check('start_url is inside scope', manifest.start_url.startsWith(manifest.scope));
const sizes = new Map();
for (const icon of manifest.icons) {
  const real = has(icon.src) ? pngSize(icon.src) : null;
  check(`icon ${icon.src} (${icon.purpose}) exists and is ${icon.sizes}`, !!real && `${real[0]}x${real[1]}` === icon.sizes, real ? `is ${real[0]}x${real[1]}` : 'missing');
  sizes.set(`${icon.purpose}:${icon.sizes}`, true);
}
check('has 192 and 512 icons', sizes.has('any:192x192') && sizes.has('any:512x512'));
check('has a maskable 512 icon (own artwork, not the "any" file)', manifest.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512' && i.src !== '/icon-512.png'));
const routes = ['/', '/register', '/tiers', '/league', '/champions', '/history'];
check('shortcuts cover the main pages', routes.every(r => manifest.shortcuts.some(s => s.url === r)));

console.log('\nOffline');
const precache = JSON.parse(/const PRECACHE = (\[.*?\]);/s.exec(sw)?.[1] || '[]');
const built = readdirSync(path.join(dist, 'assets')).filter(f => /\.(js|css)$/.test(f)).map(f => `/assets/${f}`);
check('service worker version was stamped by the build', !sw.includes('__BUILD_VERSION__') && /const VERSION = '[0-9a-f]{10}'/.test(sw));
check(`every built JS/CSS file is precached (${built.length} files, so each page works offline)`, built.length > 0 && built.every(f => precache.includes(f)), `missing: ${built.filter(f => !precache.includes(f)).join(', ')}`);
check('page chunks for Champions, History, League and Admin are included', ['Champions', 'History', 'League', 'Admin'].every(n => precache.some(f => f.includes(`/${n}-`))));
const staticList = new Function(`return ${/const STATIC = (\[.*?\]);/s.exec(sw)?.[1] || '[]'}`)(); // our own file, single-quoted strings
check('shell, offline page, fonts and icons are precached and present', staticList.every(f => has(f) ) && staticList.includes('/offline.html') && staticList.includes('/'), `missing: ${staticList.filter(f => !has(f)).join(', ')}`);
check('navigations fall back to the cached app shell', sw.includes("request.mode === 'navigate'") && sw.includes("caches.match('/')"));
check('API calls are never cached', sw.includes("startsWith('/api/')"));
check('offline.html exists', has('offline.html'));

console.log('\nHosting');
const toml = existsSync('netlify.toml') ? readFileSync('netlify.toml', 'utf8') : '';
check('Netlify serves every route from index.html (deep links to /champions, /history/s1 …)', /from = "\/\*"\s+to = "\/index\.html"\s+status = 200/.test(toml));
check('Netlify never long-caches sw.js or the manifest', /for = "\/sw\.js"[\s\S]*?no-cache/.test(toml) && /for = "\/manifest\.webmanifest"[\s\S]*?no-cache/.test(toml));
check('Netlify caches hashed /assets/* as immutable', /for = "\/assets\/\*"[\s\S]*?immutable/.test(toml));
const fb = existsSync('firebase.json') ? JSON.parse(readFileSync('firebase.json', 'utf8')).hosting : {};
const rule = source => (fb.headers || []).find(h => h.source === source);
check('Firebase Hosting rewrites every route to index.html', (fb.rewrites || []).some(r => r.source === '**' && r.destination === '/index.html'));
check('Firebase Hosting never long-caches sw.js or the manifest', /no-cache/.test(JSON.stringify(rule('/sw.js'))) && /no-cache/.test(JSON.stringify(rule('/manifest.webmanifest'))));
check('Firebase Hosting caches hashed /assets/** as immutable', /immutable/.test(JSON.stringify(rule('/assets/**'))));

console.log(failed ? `\n${failed} PWA check(s) failed.` : '\nAll PWA checks passed.');
process.exit(failed ? 1 : 0);
