self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("meteo-cache").then(cache => {
      return cache.addAll([
        "./index.html",
        "./manifest.webmanifest",
        "./icons/icon.png",
        "./icons/icon.png"
      ]);
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
