let CACHE = 'wilayah-dev';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'vendor/htmx.min.js', 'api/provinces.json', 'api/version.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('api/version.json', { cache: 'no-store' });
        if (res.ok) CACHE = `wilayah-${(await res.json()).data_version}`;
      } catch {
        /* versi tak terbaca: pakai nama cache sementara */
      }
      const cache = await caches.open(CACHE);
      await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

async function refreshIfStale() {
  try {
    const res = await fetch('api/version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const next = `wilayah-${(await res.json()).data_version}`;
    if (next === CACHE) return;
    CACHE = next;
    for (const key of await caches.keys()) {
      if (key.startsWith('wilayah-') && key !== CACHE) await caches.delete(key);
    }
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
  } catch {
    /* offline: pertahankan cache yang ada */
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('wilayah-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('/sw.js')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        await refreshIfStale();
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(CACHE)).put('index.html', res.clone());
          return res;
        } catch {
          return (await caches.match('index.html')) || Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.includes('/api/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
