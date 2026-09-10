const CACHE = "backlog-shell-v11";
const SHELL_FILES = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/firebase.js",
  "js/rawg.js",
  "js/steam.js",
  "js/playstation.js",
  "js/config.js",
  "icon.svg",
  "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// App-shell files: cache-first (they're versioned by CACHE name).
// Everything else (Firestore, RAWG, fonts, images): network, no caching.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
