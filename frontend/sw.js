const CACHE_NAME = 'banky-v1';

// In development (localhost / 127.0.0.1) skip all caching so changes are
// visible immediately without having to clear storage or fiddle with DevTools.
const DEV = self.location.hostname === 'localhost' ||
            self.location.hostname === '127.0.0.1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Install: pre-cache all app shell assets (skipped in dev)
self.addEventListener('install', event => {
  if (DEV) {
    console.log('[SW] Dev mode — skipping pre-cache');
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`Failed to cache ${url}:`, err)
          )
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: in dev, always go to the network so edits are immediately visible.
// In production, serve from cache with a network fallback.
self.addEventListener('fetch', event => {
  if (DEV) return; // let the browser handle it normally

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() =>
        new Response('You are offline and this resource is not cached.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        })
      );
    })
  );
});
