const CACHE = "nayad-v53";

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
  "./store-recovery.js?v=52",
  "./cloud-runtime.js?v=53",
  "./auth-guard.js?v=53",
  "./mobile-fix.js?v=45",
  "./share.js?v=37",
  "./invoice-cloud.js?v=53",
  "./supplier-cloud.js?v=53",
  "./company-label.js"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    const hadOldNayadCache=keys.some(key=>key.startsWith("nayad-")&&key!==CACHE);
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
    if(hadOldNayadCache){
      const windows=await self.clients.matchAll({type:"window"});
      await Promise.all(windows.map(client=>client.navigate(client.url).catch(()=>null)));
    }
  })());
});

function injectScript(html,src){
  if(html.includes(src.split('?')[0]))return html;
  return html.replace(/<\/body>/i,`<script src="${src}"></script></body>`);
}

function injectCloudRuntimeBeforeCloudModules(html){
  if(html.includes("./cloud-runtime.js"))return html;
  const invoiceTag='<script src="./invoice-cloud.js?v=53"></script>';
  if(html.includes(invoiceTag)){
    return html.replace(invoiceTag,`<script src="./cloud-runtime.js?v=53"></script>${invoiceTag}`);
  }
  return injectScript(html,"./cloud-runtime.js?v=53");
}

function patchDocument(html){
  let patched=html.replace(/\.\/oauth-fix\.js\?v=\d+/g,"./oauth-fix.js?v=45");
  patched=patched.replace(/\.\/store-switcher\.js\?v=\d+/g,"./store-switcher.js?v=51");
  patched=patched.replace(/\.\/store-recovery\.js\?v=\d+/g,"./store-recovery.js?v=52");
  patched=patched.replace(/\.\/auth-guard\.js\?v=\d+/g,"./auth-guard.js?v=53");
  patched=patched.replace(/\.\/invoice-cloud\.js\?v=\d+/g,"./invoice-cloud.js?v=53");
  patched=patched.replace(/\.\/supplier-cloud\.js\?v=\d+/g,"./supplier-cloud.js?v=53");
  patched=injectCloudRuntimeBeforeCloudModules(patched);
  patched=injectScript(patched,"./store-recovery.js?v=52");
  patched=injectScript(patched,"./auth-guard.js?v=53");
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
