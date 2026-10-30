// Refresh the per-store background picker and store-switch hooks.
const CACHE = "nayad-v246";

const ASSETS = [
  "./",
  "./section-router.js?v=4",
  "./manifest.webmanifest",
  "./responsive-layout.css?v=14",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./oauth-fix.js?v=45",
  "./render.js?v=2",
  "./app-state.js?v=39",
  "./money-input.js?v=1",
  "./image-compress.js?v=1",
  "./registration-onboarding.js?v=2",
  "./store-switcher.js?v=69",
  "./store-background.js?v=1",
  "./store-recovery.js?v=57",
  "./registration-delete.js?v=2",
  "./cloud-runtime.js?v=59",
  "./auth-guard.js?v=58",
  "./mobile-fix.js?v=46",
  "./share.js?v=41",
  "./vendor/qrcode.js?v=1",
  "./staff-hub.js?v=4",
  "./staff-time.js?v=2",
  "./staff-payroll.js?v=15",
  "./staff-salary.js?v=1",
  "./staff-applications.js?v=1",
  "./staff-self-service.js?v=2",
  "./profile-menu.js?v=11",
  "./notification-settings.js?v=1",
  "./admin-dashboard.js?v=2",
  "./subscription.js?v=5",
  "./invoice-cloud.js?v=80",
  "./supplier-cloud.js?v=64",
  "./reports.js?v=4",
  "./payment-center.js?v=35",
  "./invoice-cart.js?v=3",
  "./statement-search.js?v=1",
  "./payment-statement.js?v=21",
  "./loans.js?v=13",
  "./loan-contract-schedule.js?v=2",
  "./loan-contract-editor.js?v=5",
  "./loan-contract-editor.css?v=7",
  "./loan-payment.js?v=3",
  "./loan-actions.js?v=1",
  "./contact-types.js?v=33",
  "./company-label.js",
  "./member-permissions.js?v=2"
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

function injectScriptAfter(html,anchorSrc,src){
  if(html.includes(src.split('?')[0]))return html;
  const anchor=`<script src="${anchorSrc}"></script>`;
  if(!html.includes(anchor))return injectScript(html,src);
  return html.replace(anchor,`${anchor}<script src="${src}"></script>`);
}

function injectScriptBefore(html,anchorSrc,src){
  if(html.includes(src.split('?')[0]))return html;
  const anchor=`<script src="${anchorSrc}"></script>`;
  if(!html.includes(anchor))return injectScript(html,src);
  return html.replace(anchor,`<script src="${src}"></script>${anchor}`);
}

function injectCloudRuntimeBeforeCloudModules(html){
  if(html.includes("./cloud-runtime.js"))return html;
  const invoiceTag='<script src="./invoice-cloud.js?v=80"></script>';
  if(html.includes(invoiceTag)){
    return html.replace(invoiceTag,`<script src="./cloud-runtime.js?v=59"></script>${invoiceTag}`);
  }
  return injectScript(html,"./cloud-runtime.js?v=59");
}

function patchDocument(html){
  html=html.includes('<base href="/">')?html:html.replace('<head>','<head><base href="/">');
  html=html.includes("/section-router.js")?html:html.replace('<head>','<head><script src="/section-router.js?v=4"></script>');
  html=html.replace(/\.\/staff-hub\.js\?v=\d+/g,"./staff-hub.js?v=4");
  html=html.replace(/\.\/staff-time\.js\?v=\d+/g,"./staff-time.js?v=2");
  html=html.replace(/\.\/staff-payroll\.js\?v=\d+/g,"./staff-payroll.js?v=15");
  html=html.replace(/\.\/invoice-cart\.js\?v=\d+/g,"./invoice-cart.js?v=3");
  let patched=html.replace(/\.\/oauth-fix\.js\?v=\d+/g,"./oauth-fix.js?v=45");
  patched=patched.replace(/\.\/app-state\.js\?v=\d+/g,"./app-state.js?v=39");
  patched=patched.replace(/\.\/money-input\.js\?v=\d+/g,"./money-input.js?v=1");
  patched=patched.replace(/\.\/registration-onboarding\.js\?v=\d+/g,"./registration-onboarding.js?v=2");
  patched=patched.replace(/\.\/store-switcher\.js\?v=\d+/g,"./store-switcher.js?v=69");
  patched=patched.replace(/\.\/store-recovery\.js\?v=\d+/g,"./store-recovery.js?v=57");
  patched=patched.replace(/\.\/registration-delete\.js\?v=\d+/g,"./registration-delete.js?v=2");
  patched=patched.replace(/\.\/cloud-runtime\.js\?v=\d+/g,"./cloud-runtime.js?v=59");
  patched=patched.replace(/\.\/auth-guard\.js\?v=\d+/g,"./auth-guard.js?v=58");
  patched=patched.replace(/\.\/share\.js\?v=\d+/g,"./share.js?v=41");
  patched=patched.replace(/\.\/profile-menu\.js\?v=\d+/g,"./profile-menu.js?v=11");
  patched=patched.replace(/\.\/admin-dashboard\.js\?v=\d+/g,"./admin-dashboard.js?v=2");
  patched=patched.replace(/\.\/subscription\.js\?v=\d+/g,"./subscription.js?v=5");
  patched=patched.replace(/\.\/invoice-cloud\.js\?v=\d+/g,"./invoice-cloud.js?v=80");
  patched=patched.replace(/\.\/payment-center\.js\?v=\d+/g,"./payment-center.js?v=35");
  patched=patched.replace(/\.\/member-permissions\.js\?v=\d+/g,"./member-permissions.js?v=2");
  patched=patched.replace(/\.\/supplier-cloud\.js\?v=\d+/g,"./supplier-cloud.js?v=64");
  patched=patched.replace(/\.\/loans\.js\?v=\d+/g,"./loans.js?v=13");
  patched=injectScriptBefore(patched,"./invoice-cloud.js?v=80","./money-input.js?v=1");
  patched=patched.replace(/\.\/contact-types\.js\?v=\d+/g,"./contact-types.js?v=33");
  patched=injectScriptBefore(patched,"./store-switcher.js?v=69","./registration-onboarding.js?v=2");
  patched=injectScriptAfter(patched,"./store-switcher.js?v=69","./store-recovery.js?v=57");
  patched=injectScriptAfter(patched,"./store-recovery.js?v=57","./registration-delete.js?v=2");
  patched=injectScriptAfter(patched,"./registration-delete.js?v=2","./auth-guard.js?v=58");
  patched=injectScriptAfter(patched,"./share.js?v=41","./vendor/qrcode.js?v=1");
  patched=injectScriptAfter(patched,"./vendor/qrcode.js?v=1","./staff-hub.js?v=4");
  patched=injectScriptAfter(patched,"./staff-hub.js?v=4","./staff-time.js?v=2");
  patched=injectScriptAfter(patched,"./staff-time.js?v=2","./staff-payroll.js?v=15");
  patched=injectScriptAfter(patched,"./staff-payroll.js?v=15","./staff-salary.js?v=1");
  patched=injectScriptAfter(patched,"./staff-salary.js?v=1","./staff-applications.js?v=1");
  patched=injectScriptAfter(patched,"./staff-applications.js?v=1","./staff-self-service.js?v=2");
  patched=injectScriptAfter(patched,"./staff-applications.js?v=1","./profile-menu.js?v=11");
  patched=injectScriptAfter(patched,"./profile-menu.js?v=11","./admin-dashboard.js?v=2");
  patched=injectScriptAfter(patched,"./profile-menu.js?v=11","./notification-settings.js?v=1");
  patched=injectScriptAfter(patched,"./company-label.js","./subscription.js?v=5");
  patched=injectCloudRuntimeBeforeCloudModules(patched);
  patched=injectScriptAfter(patched,"./invoice-cloud.js?v=80","./payment-center.js?v=35");
  patched=injectScriptAfter(patched,"./payment-center.js?v=35","./loans.js?v=13");
  patched=injectScriptAfter(patched,"./payment-center.js?v=35","./invoice-cart.js?v=3");
  patched=injectScriptBefore(patched,"./supplier-cloud.js?v=64","./contact-types.js?v=33");
  patched=injectScriptAfter(patched,"./subscription.js?v=5","./member-permissions.js?v=2");
  patched=injectScript(patched,"./mobile-fix.js?v=46");
  patched=patched.replace(/payment-statement\.js\?v=\d+/g,'payment-statement.js?v=21');
  patched=injectScriptBefore(patched,"./payment-center.js?v=35","./payment-statement.js?v=21");
  patched=injectScriptBefore(patched,"./payment-statement.js?v=21","./statement-search.js?v=1");
  patched=injectScriptBefore(patched,"./loans.js?v=13","./loan-contract-schedule.js?v=2");
  patched=patched.replace(/loan-contract-schedule\.js\?v=\d+/g,'loan-contract-schedule.js?v=2');
  patched=injectScriptAfter(patched,"./loans.js?v=13","./loan-contract-editor.js?v=5");
  if(!patched.includes('./loan-contract-editor.css'))patched=patched.replace('</head>','<link rel="stylesheet" href="./loan-contract-editor.css?v=7"></head>');
  patched=patched.replace(/loan-contract-editor\.js\?v=\d+/g,'loan-contract-editor.js?v=5');
  patched=patched.replace(/loan-contract-editor\.css\?v=\d+/g,'loan-contract-editor.css?v=7');
  patched=patched.replace(/loan-payment\.js\?v=\d+/g,'loan-payment.js?v=3');
  patched=injectScriptAfter(patched,"./loan-contract-editor.js?v=5","./loan-payment.js?v=3");
  patched=injectScriptAfter(patched,"./loan-payment.js?v=3","./loan-actions.js?v=1");
  patched=patched.replace(/\.\/render\.js(?:\?v=\d+)?(?=")/g,"./render.js?v=2");
  patched=injectScriptBefore(patched,"./payment-center.js?v=35","./reports.js?v=4");
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

  /* Never cache authenticated API traffic. A service worker sees cross-origin
     Supabase requests too; caching those responses made invoice/payment reads
     permanently stale and could mix data between signed-in users. */
  if(request.method!=="GET"||url.origin!==self.location.origin){
    event.respondWith(fetch(request));
    return;
  }

  if(request.mode==="navigate"||request.destination==="document"){
    event.respondWith(
      fetch((/^\/padaan\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)||["/nuur","/hariltsagch","/tulbur","/zeel","/delguur_solih","/hariltsagch_nemeh","/huvi_hun_burtgeh","/baiguullaga_burtgeh"].includes(url.pathname.replace(/\/$/,"")))?new URL("/"+url.search,self.location.origin).href:request,{cache:"no-store"})
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

  const staticPaths=new Set(ASSETS.map(asset=>new URL(asset,self.registration.scope).pathname));
  if(!staticPaths.has(url.pathname)){
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      }
      return response;
    }))
  );
});

// Web Push works even when the app is closed. Only open our own origin.
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification(payload.title||'NAYAD · Сануулга',{
  body:payload.body||'Төлбөрийн сануулгаа шалгана уу.',icon:'./icon-192.png',badge:'./icon-192.png',
  tag:payload.tag||'nayad-reminder',data:{store_id:payload.store_id||''},
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.focus();client.postMessage({type:'NAYAD_OPEN_REMINDERS',store_id:event.notification.data?.store_id||''});return;}}
  await self.clients.openWindow(new URL('/?reminders='+encodeURIComponent(event.notification.data?.store_id||'1'),self.location.origin).href);
 })());
});
