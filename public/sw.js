const CACHE_NAME = "fundlens-cache-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Add all core assets to cache on install, but catch errors to prevent install failure if some assets don't load
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn("Failed to cache initial assets during install:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // Only intercept GET requests
  if (e.request.method !== "GET") return;

  // For dev hot-reloads and websocket bypass intercepting
  if (e.request.url.includes("ws://") || e.request.url.includes("hot-update") || e.request.url.includes("/@vite/")) {
    return;
  }

  // Only handle local app origin requests
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const url = new URL(e.request.url);
      const isAsset = url.pathname.includes("/assets/") || 
                      url.pathname.endsWith(".png") || 
                      url.pathname.endsWith(".svg") || 
                      url.pathname.endsWith(".ico") || 
                      url.pathname.endsWith(".woff2");

      if (isAsset && cachedResponse) {
        return cachedResponse;
      }

      // Otherwise fetch from network
      return fetch(e.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If it's a page navigation request, return index.html for SPA routing
          if (e.request.mode === "navigate") {
            return caches.match("/");
          }
        });
    })
  );
});
