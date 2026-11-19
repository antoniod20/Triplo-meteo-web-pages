// Cambia la versione a ogni rilascio: la cache vecchia viene cancellata in automatico
const CACHE_VERSION = 'meteo-cache-v12';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './js/main.js',
  './js/settings.js',
  './js/agent.js',
  './js/weather.js',
  './js/forecast-api.js',
  './js/providers.js',
  './js/comuni.js',
  './js/dom.js',
  './js/state.js',
  './js/storage.js',
  './js/text.js',
  './comuni.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon.ico'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Prima la rete (così si vede sempre l'ultima versione), la cache solo se si è offline.
// Gestiamo solo i file del sito: i siti meteo negli iframe non passano di qui.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    // no-cache: chiede sempre al server se il file è cambiato, così gli aggiornamenti arrivano subito
    fetch(request, { cache: 'no-cache' })
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request, { ignoreSearch: true })
          .then(cached => cached || (request.mode === 'navigate' ? caches.match('./index.html') : undefined))
          .then(cached => cached || Response.error())
      )
  );
});
