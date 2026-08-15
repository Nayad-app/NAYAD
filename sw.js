const CACHE = "nayad-v09";

const ASSETS = [
  "./",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./oauth-fix.js",
  "./render.js",
  "./user-scope.js",
  "./share.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
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
          if (!patched.includes("share.js")) {
            patched = patched.replace(/<\/body>/i, '<script src="./share.js"></script></body>');
          }

          // iPhone/iPad: keep the invoice image list vertically scrollable.
          // HTML5 draggable items can capture the touch gesture on iOS, so
          // disable dragging on coarse-pointer devices while preserving drag
          // reorder on desktop.
          const mobileInvoiceFix = `<style>
.sheet{touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.imageList{touch-action:pan-y;-webkit-overflow-scrolling:touch}
.imageItem{touch-action:pan-y;-webkit-user-select:none;user-select:none}
.imageItem img{pointer-events:none}
</style><script>
(function(){
  if(!window.matchMedia || !window.matchMedia('(pointer:coarse)').matches)return;
  function disableInvoiceDrag(){
    document.querySelectorAll('.imageItem[draggable="true"]').forEach(function(el){el.setAttribute('draggable','false')});
  }
  disableInvoiceDrag();
  new MutationObserver(disableInvoiceDrag).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;
          patched = patched.replace(/<\/head>/i, mobileInvoiceFix + '</head>');

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
