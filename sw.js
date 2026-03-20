const CACHE_NAME = 'agrandehistoria-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/week.html',
  '/day.html',
  '/notes.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // only handle navigation and GET
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
      // cache successful GET responses for future
      if (resp && resp.status === 200 && req.url.startsWith(self.location.origin)) {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, respClone));
      }
      return resp;
    })).catch(() => caches.match('/index.html'))
  );
});
