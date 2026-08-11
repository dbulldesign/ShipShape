/* Shipshape service worker.

   Bump CACHE on every deploy that changes a cached file — the cache name is what
   retires the old copies. It is deliberately the same string as app-version in
   index.html so there is one number to remember.

   The page checks whether it is stale by re-fetching its own HTML with a
   ?vcheck= parameter. Those requests must never be answered from here, or the
   check would compare a cached copy against itself and always agree. */
const CACHE = 'shipshape-1.21.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icon.svg', './favicon.svg', './favicon.ico',
  './favicon-16.png', './favicon-32.png', './apple-touch-icon.png',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
];

self.addEventListener('install', e => {
  // addAll fails the whole install if any single file 404s, so tolerate misses
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isHTML = (req, url) =>
  req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // Supabase RPC and friends
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // carrier links, anything remote
  if (url.searchParams.has('vcheck')) return;             // the staleness check must hit the network

  if (isHTML(req, url)) {
    // Network first: a deploy should be picked up as soon as there is a network,
    // with the cached copy only standing in when there is not.
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }

  // Everything else is versioned by the cache name, so serve it from there and
  // fill on first miss. The barcode reader is 330KB and lands here on first scan.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  })));
});

/* ============ reminders ============
   Payload is JSON: { title, body, url, tag }. Anything unparseable still shows
   something rather than nothing, because a push that resolves to no
   notification is a visible violation on some browsers. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  const title = d.title || 'Shipshape';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'You have work due.',
    tag: d.tag || 'shipshape-due',
    data: { url: d.url || './' },
    icon: './icon-192.png',
    badge: './favicon-32.png',
    renotify: !!d.tag,
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.location).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
