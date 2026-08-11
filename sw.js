// Offline shell. Bump CACHE_VERSION whenever the asset list changes.
const CACHE_VERSION = 'balatro-v10';

// "./" is the app shell. "./index.html" is deliberately not listed too: the
// host serves clean URLs and redirects that path, and redirected responses are
// not cacheable per spec, so caching it is at best a duplicate.
const ASSETS = [
  './',
  './manifest.webmanifest',
  './css/style.css',
  './fonts/pixel.ttf',
  './js/main.js',
  './js/ui.js',
  './js/engine.js',
  './js/cards.js',
  './js/poker.js',
  './js/data.js',
  './js/jokers.js',
  './js/consumables.js',
  './js/rng.js',
  './js/audio.js',
  './js/art.js',
  './js/haptics.js',
  './js/tutorial.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheable(response) {
  // Redirected responses cannot be written to the cache.
  return response && response.status === 200 && response.type === 'basic' && !response.redirected;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const cached = await caches.match(request);

    const network = fetch(request)
      .then((response) => {
        if (cacheable(response)) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => null);

    // Cache first so the game works with no connection, refreshing behind it.
    if (cached) return cached;

    const response = await network;
    if (response) return response;

    // Offline and unseen: any navigation still resolves to the app shell, so
    // launching at /index.html or a deep link works the same as at the root.
    if (request.mode === 'navigate') {
      const shell = await caches.match('./');
      if (shell) return shell;
    }
    return Response.error();
  })());
});
