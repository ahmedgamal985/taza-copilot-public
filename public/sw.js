// Taza Copilot service worker: the installed app opens instantly and still opens without internet.
// Privacy: questions, answers, live air and everything under /api/ always go to the network and are
// never stored here. Only the public page and its files are kept, one version of each.
const CACHE = 'taza-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Keep only the newest version of each file (files are asked for with ?v=<build>)
async function prune(cache, url) {
  for (const r of await cache.keys()) {
    const u = new URL(r.url);
    if (u.pathname === url.pathname && u.search !== url.search) await cache.delete(r);
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Always live, never stored: the API, research PDFs, audio (streamed in ranges) and this file
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/research/') || url.pathname.startsWith('/tour/') ||
      url.pathname === '/sw.js' || req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    // Pages: the network first (always fresh); without internet, the last copy of the app
    e.respondWith(fetch(req).then(res => {
      if (res.ok && url.pathname === '/') { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('/')));
    return;
  }

  // Files: a versioned file never changes, so the stored copy is used; others are refreshed in the background
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const net = fetch(req).then(async res => {
      if (res.ok && res.status === 200 && res.type === 'basic') { await cache.put(req, res.clone()); prune(cache, url); }
      return res;
    });
    if (hit) { if (!url.searchParams.has('v')) net.catch(() => {}); return hit; }
    return net;
  })());
});
