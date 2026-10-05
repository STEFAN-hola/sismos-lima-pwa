/* Service worker — app shell offline-first.
   Sube CACHE_VERSION cada vez que cambies index/styles/app para forzar actualización. */
var CACHE_VERSION = "sismos-lima-v7";
var APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./supabase-config.js",
  "./backend.js",
  "./seismic.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function (c) {
      return c.addAll(APP_SHELL);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  var isFont = url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com";

  // Fuentes de Google: stale-while-revalidate (funciona offline tras la 1ra carga).
  if (isFont) {
    e.respondWith(
      caches.open(CACHE_VERSION).then(function (cache) {
        return cache.match(req).then(function (cached) {
          var fetched = fetch(req).then(function (res) {
            cache.put(req, res.clone());
            return res;
          }).catch(function () { return cached; });
          return cached || fetched;
        });
      })
    );
    return;
  }

  // Mismo origen: cache-first con relleno en segundo plano.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
          return res;
        }).catch(function () {
          // Fallback de navegación cuando no hay red y no está en caché.
          if (req.mode === "navigate") return caches.match("./index.html");
        });
      })
    );
  }
});
