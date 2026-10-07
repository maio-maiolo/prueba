const CACHE_NAME = 'ledger-v4-fix-sync';
const urlsToCache = [
  './',
  './manifest.json',
  './ledger.css',
  './css/app.css',
  './favicon.ico',
  './img/favicon.ico',
  './img/favicon-16x16.png',
  './img/favicon-32x32.png',
  './img/apple-touch-icon.png',
  './img/logo-icon-192.png',
  './img/logo-icon-512.png',
  './img/logo-maskable-192.png',
  './img/logo-maskable-512.png',
  './img/logo-full-hd.webp',
  './img/logo-academia.webp'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache).catch(err => console.log('Cache fallo:', err));
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(()=> self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // NUNCA cachear Firebase, Firestore, Google APIs, ni los JS que cambian
  if (
    url.hostname.includes('firestore') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('google.com') ||
    event.request.url.includes('/js/') ||
    event.request.url.includes('firebase.js') ||
    event.request.url.includes('core.js') ||
    event.request.url.includes('finanzas.js')
  ) {
    // Network only para Firebase y JS
    event.respondWith(fetch(event.request).catch(()=> caches.match(event.request)));
    return;
  }

  // Para el resto: network-first (no cache-first)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // guardar en cache si es exitoso y es del mismo origen
        if (response.ok && url.origin === location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          return cached || caches.match('./index.html');
        });
      })
  );
});
