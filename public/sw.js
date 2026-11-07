// Traice service worker. The build step (vite.config.js) fills in PRECACHE and the cache VERSION,
// so every page's code is available offline after the first visit and old caches are replaced on update.
const VERSION = '__BUILD_VERSION__';
const CACHE = `triace-shell-${VERSION}`;
const PRECACHE = /*__PRECACHE__*/[];
const STATIC = ['/', '/manifest.webmanifest', '/offline.html', '/fonts/fonts.css', '/fonts/barlow-condensed-latin-600-normal.woff2', '/fonts/barlow-condensed-latin-700-normal.woff2', '/fonts/barlow-condensed-latin-800-normal.woff2', '/fonts/inter-latin-400-normal.woff2', '/fonts/inter-latin-500-normal.woff2', '/fonts/inter-latin-600-normal.woff2', '/fonts/inter-latin-700-normal.woff2', '/traice-tennis.webp', '/goat-tier.webp', '/rising-tier.webp', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(STATIC);
    // Build files are best-effort so one failed request cannot stop the update from installing.
    await Promise.all(PRECACHE.map(url => cache.add(url).catch(() => {})));
  }));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('triace-') && key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Every page is the same single-page app, so any route falls back to the cached shell when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/').then(hit => hit || caches.match('/offline.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  })));
});
