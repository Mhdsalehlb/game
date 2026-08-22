/**
 * Stargaze service worker — offline shell + fast repeat loads.
 *
 * Strategy:
 * - Navigations (HTML): network-first, cache fallback — a deploy is picked
 *   up on the next online visit, but the app still opens offline.
 * - Same-origin assets (css/js/icons): stale-while-revalidate.
 * - MediaPipe CDN files (versioned URLs): cache-first — they never change.
 *
 * Bump CACHE_VERSION whenever cached assets change shape.
 */
const CACHE_VERSION = 'stargaze-v1';

const PRECACHE = [
  './',
  'index.html',
  'app.html',
  'css/style.css',
  'css/landing.css',
  'js/config.js',
  'js/theme.js',
  'js/constellations.js',
  'js/tracking.js',
  'js/game.js',
  'js/landing.js',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // HTML navigations: network-first so deploys land promptly
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('app.html'))),
    );
    return;
  }

  // MediaPipe CDN: immutable versioned URLs → cache-first
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  // Same-origin assets: stale-while-revalidate
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const refresh = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || refresh;
      }),
    );
  }
});
