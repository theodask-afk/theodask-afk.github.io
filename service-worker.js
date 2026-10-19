// Athens Street Histories — offline shell.
// App shell: cache-first. OSM tiles: capped runtime cache. Everything else
// (Nominatim, Overpass, Wikipedia, Firebase, fonts): network-only, because
// those APIs rate-limit and their responses are per-request anyway.
const SHELL = 'odoi-shell-v1';
const TILES = 'odoi-tiles-v1';
const PRECACHE = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const TILE_CACHE_MAX = 800;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, TILES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(e.request, copy));
        return res;
      }))
    );
    return;
  }

  if (/[.]tile[.]openstreetmap[.]org$/.test(url.hostname)) {
    e.respondWith(
      caches.open(TILES).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) {
          const keys = await c.keys();
          if (keys.length >= TILE_CACHE_MAX) await c.delete(keys[0]); // FIFO cap
          c.put(e.request, res.clone());
        }
        return res;
      })
    );
    // Nominatim / Overpass / Wikimedia / Firebase: intentionally not cached.
  }
});
      
