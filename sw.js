const CACHE = "nayad-v51";

const ASSETS = [
  "./",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./oauth-fix.js?v=45",
  "./render.js",
  "./app-state.js?v=37",
  "./store-switcher.js?v=51",
  "./store-recovery.js?v=50",
  "./auth-guard.js?v=49",
  "./mobile-fix.js?v=45",
  "./share.js?v=37",
  "./invoice-cloud.js?v=37",
  "./supplier-cloud.js?v=37",
  "./company-label.js"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

function injectScript(html,src){
  if(html.includes(src.split('?')[0]))return html;
  return html.replace(/<\/body>/i,`<script src="${src}"></script></body>`);
}

function patchDocument(html){
  let patched=html.replace(/\.\/oauth-fix\.js\?v=\d+/g,"./oauth-fix.js?v=45");
  patched=patched.replace(/\.\/store-switcher\.js\?v=\d+/g,"./store-switcher.js?v=51");
  patched=patched.replace(/\.\/store-recovery\.js\?v=\d+/g,"./store-recovery.js?v=50");
  patched=patched.replace(/\.\/auth-guard\.js\?v=\d+/g,"./auth-guard.js?v=49");
  patched=injectScript(patched,"./store-recovery.js?v=50");
  patched=injectScript(patched,"./auth-guard.js?v=49");
  patched=injectScript(patched,"./mobile-fix.js?v=45");
  return patched;
}

async function patchedResponse(response){
  const html=await response.clone().text();
  const headers=new Headers(response.headers);
  headers.delete("content-length");
  return new Response(patchDocument(html),{
    status:response.status,
    statusText:response.statusText,
    headers
  });
}

async function cachedDocument(){
  const cached=await caches.match("./");
  if(!cached)return new Response("NAYAD offline",{status:503});
  try{return await patchedResponse(cached);}catch(_){return cached;}
}

self.addEventListener("fetch",event=>{
  const request=event.request;

  if(request.mode==="navigate"||request.destination==="document"){
    event.respondWith(
      fetch(request,{cache:"no-store"})
        .then(response=>patchedResponse(response).catch(error=>{
          console.warn("NAYAD document patch:",error);
          return response;
        }))
        .catch(()=>cachedDocument())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      return response;
    }))
  );
});
