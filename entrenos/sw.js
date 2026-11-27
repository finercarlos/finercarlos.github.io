const CACHE = 'entrenos-v8';
const ASSETS = ['./', 'index.html', 'app.js?v=8', 'parser.js?v=8', 'gym-parser.js?v=8', 'manifest.json', 'vendor/anthropic-sdk-1.7.0.mjs', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// Red primero sin caché HTTP (para recibir siempre la última versión); caché si no hay conexión
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req.url, { cache: 'no-cache' }).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req, { ignoreSearch: true })));
});
