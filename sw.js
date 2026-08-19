const CACHE = "nayad-v57";

const ASSETS = [
  "./",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./oauth-fix.js?v=45",
  "./render.js",
  "./app-state.js?v=37",
  "./image-compress.js?v=1",
  "./store-switcher.js?v=52",
  "./store-recovery.js?v=52",
  "./cloud-runtime.js?v=54",
  "./auth-guard.js?v=55",
  "./mobile-fix.js?v=45",
  "./share.js?v=37",
  "./invoice-cloud.js?v=54",
  "./supplier-cloud.js?v=54",
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

function injectCloudRuntimeBeforeCloudModules(html){
  if(html.includes("./cloud-runtime.js"))return html;
  const invoiceTag='<script src="./invoice-cloud.js?v=54"></script>';
  if(html.includes(invoiceTag)){
    return html.replace(invoiceTag,`<script src="./cloud-runtime.js?v=54"></script>${invoiceTag}`);
  }
  return injectScript(html,"./cloud-runtime.js?v=54");
}

function patchDocument(html){
  let patched=html.replace(/\.\/oauth-fix\.js\?v=\d+/g,"./oauth-fix.js?v=45");
  patched=patched.replace(/\.\/store-switcher\.js\?v=\d+/g,"./store-switcher.js?v=52");
  patched=patched.replace(/\.\/store-recovery\.js\?v=\d+/g,"./store-recovery.js?v=52");
  patched=patched.replace(/\.\/cloud-runtime\.js\?v=\d+/g,"./cloud-runtime.js?v=54");
  patched=patched.replace(/\.\/auth-guard\.js\?v=\d+/g,"./auth-guard.js?v=55");
  patched=patched.replace(/\.\/invoice-cloud\.js\?v=\d+/g,"./invoice-cloud.js?v=54");
  patched=patched.replace(/\.\/supplier-cloud\.js\?v=\d+/g,"./supplier-cloud.js?v=54");
  patched=injectCloudRuntimeBeforeCloudModules(patched);
  patched=injectScript(patched,"./store-recovery.js?v=52");
  patched=injectScript(patched,"./auth-guard.js?v=55");
  patched=injectScript(patched,"./mobile-fix.js?v=45");
  return patched;
}

function patchInvoiceCloud(js){
  const legacy=`  window.addEventListener('load',()=>setTimeout(syncOnForeground,1000));\n  window.addEventListener('pageshow',event=>{if(event.persisted)setTimeout(syncOnForeground,250);});\n  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(syncOnForeground,250);});\n  window.__nayadSyncInvoices=()=>syncOnForeground(true);\n  const authClient=client();\n  if(typeof authClient?.auth?.onAuthStateChange==='function'){\n    authClient.auth.onAuthStateChange((_event,session)=>{if(session)setTimeout(syncOnForeground,0);});\n  }`;
  const centralized=`  /* Startup is owned by cloud-runtime; this module only exposes an explicit sync. */\n  window.__nayadSyncInvoices=()=>syncOnForeground(true);`;
  return js.includes(legacy)?js.replace(legacy,centralized):js;
}

function patchSupplierCloud(js){
  const legacy=`  window.__nayadSyncSuppliers=requestSupplierSync;\n  window.addEventListener('load',()=>setTimeout(requestSupplierSync,1400));\n  const authClient=sb();\n  if(typeof authClient?.auth?.onAuthStateChange==='function'){\n    authClient.auth.onAuthStateChange((_event,session)=>{if(session)setTimeout(requestSupplierSync,0);});\n  }`;
  const centralized=`  /* Startup is owned by cloud-runtime; this module only exposes an explicit sync. */\n  window.__nayadSyncSuppliers=requestSupplierSync;`;
  return js.includes(legacy)?js.replace(legacy,centralized):js;
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

async function patchedCloudScriptResponse(response,kind){
  const js=await response.clone().text();
  const headers=new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type","application/javascript; charset=utf-8");
  const patched=kind==='invoice'?patchInvoiceCloud(js):patchSupplierCloud(js);
  return new Response(patched,{status:response.status,statusText:response.statusText,headers});
}

async function cachedDocument(){
  const cached=await caches.match("./");
  if(!cached)return new Response("NAYAD offline",{status:503});
  try{return await patchedResponse(cached);}catch(_){return cached;}
}

async function cachedPatchedScript(request,kind){
  const cached=await caches.match(request);
  if(!cached)return new Response("NAYAD offline",{status:503});
  try{return await patchedCloudScriptResponse(cached,kind);}catch(_){return cached;}
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  const url=new URL(request.url);

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

  if(url.origin===self.location.origin&&url.pathname.endsWith('/invoice-cloud.js')){
    event.respondWith(
      fetch(request,{cache:"no-store"})
        .then(response=>patchedCloudScriptResponse(response,'invoice'))
        .catch(()=>cachedPatchedScript(request,'invoice'))
    );
    return;
  }

  if(url.origin===self.location.origin&&url.pathname.endsWith('/supplier-cloud.js')){
    event.respondWith(
      fetch(request,{cache:"no-store"})
        .then(response=>patchedCloudScriptResponse(response,'supplier'))
        .catch(()=>cachedPatchedScript(request,'supplier'))
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
