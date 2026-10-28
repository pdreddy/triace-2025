const CACHE = 'triace-shell-v5';
// cached shell + offline fallback
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/triace-rules.html', '/manifest.webmanifest', '/offline.html', '/fonts/fonts.css', '/fonts/barlow-condensed-latin-600-normal.woff2', '/fonts/barlow-condensed-latin-700-normal.woff2', '/fonts/barlow-condensed-latin-800-normal.woff2', '/fonts/inter-latin-400-normal.woff2', '/fonts/inter-latin-500-normal.woff2', '/fonts/inter-latin-600-normal.woff2', '/fonts/inter-latin-700-normal.woff2', '/traice-tennis.webp', '/goat-tier.webp', '/rising-tier.webp', '/icon-192.png', '/icon-512.png']))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request).catch(() => caches.match('/').then(hit => hit || caches.match('/offline.html')))); return; }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); } return response; })));
});
