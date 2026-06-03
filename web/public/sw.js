/* POS Suite service worker — offline app shell for the POS + installable PWA
   (customer display / kiosk). API, WebSocket and uploads always hit the
   network so live data is never stale.

   NOTE: the CACHE name + SHELL list below are rewritten at build time by
   scripts/gen-sw-precache.mjs to a content-hashed cache + the real built-asset
   manifest, so a cold reload while offline reliably boots the app (not just
   whatever happened to be runtime-cached). Edits to these two lines are
   overwritten by the build. */
const CACHE = 'pos-shell-dev';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept live data.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') || url.pathname.startsWith('/uploads')) return;

  // SPA navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  // Static assets: cache-first, then populate the cache.
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached)
    )
  );
});
