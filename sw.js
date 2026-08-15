const CACHE = "nayad-v07";

const ASSETS = [
  "./",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./oauth-fix.js",
  "./render.js",
  "./user-scope.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).then(async response => {
        try {
          const html = await response.clone().text();
          let patched = html;
          if (!patched.includes("user-scope.js")) {
            patched = patched.replace(/<\/head>/i, '<script src="./user-scope.js"></script></head>');
          }
          if (!patched.includes("oauth-fix.js")) {
            patched = patched.replace(/<\/body>/i, '<script src="./oauth-fix.js"></script></body>');
          }
          if (!patched.includes("render.js")) {
            patched = patched.replace(/<\/body>/i, '<script src="./render.js"></script></body>');
          }
          return new Response(patched, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        } catch (e) {
          return response;
        }
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
      return response;
    }))
  );
});
