/* Ajest service worker — minimal offline shell + installability.
   Strategy:
   • Navigations: network-first, fall back to cached shell (only GOOD responses
     are ever cached — a stale shell referencing deleted /_next chunks is the
     classic "app stuck in loading on my iPad" bug).
   • Static assets (/_next/static, icons): cache-first.
   • /api/*: always network (live anime data + streams are never cached).
   CACHE is version-bumped on every deploy-affecting shell change so old
   caches are wiped on activate. */

const CACHE = 'ajest-v3';
const PRECACHE = ['/', '/ajest-icon.svg', '/ajest-maskable.svg', '/logo.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // upstream/proxied streams untouched
  if (url.pathname.startsWith('/api/')) return; // live data — network only

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache only successful same-origin HTML — error pages, opaque and
          // partial responses must never poison the offline shell.
          if (res && res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok && (url.pathname.startsWith('/_next/static') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.json'))) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit)
    )
  );
});
