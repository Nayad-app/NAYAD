const CACHE = "nayad-v38";

const ASSETS = ["./","./manifest.webmanifest","./icon-180.png","./icon-192.png","./icon-512.png","./oauth-fix.js?v=38","./render.js","./app-state.js?v=37","./store-switcher.js?v=38","./share.js?v=37","./invoice-cloud.js?v=37","./supplier-cloud.js?v=37","./company-label.js"];

self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(fetch(request,{cache:"no-store"}).then(async response => {
      try {
        const html=await response.clone().text(); let patched=html;
        if(!patched.includes("oauth-fix.js")) patched=patched.replace(/<\/body>/i,'<script src="./oauth-fix.js?v=38"></script></body>');
        if(!patched.includes("render.js")) patched=patched.replace(/<\/body>/i,'<script src="./render.js"></script></body>');
        if(!patched.includes("share.js")) patched=patched.replace(/<\/body>/i,'<script src="./share.js?v=37"></script></body>');
        if(!patched.includes("app-state.js")) patched=patched.replace(/<\/body>/i,'<script src="./app-state.js?v=37"></script></body>');
        if(!patched.includes("store-switcher.js")) patched=patched.replace(/<\/body>/i,'<script src="./store-switcher.js?v=38"></script></body>');
        if(!patched.includes("invoice-cloud.js")) patched=patched.replace(/<\/body>/i,'<script src="./invoice-cloud.js?v=37"></script></body>');
        if(!patched.includes("supplier-cloud.js")) patched=patched.replace(/<\/body>/i,'<script src="./supplier-cloud.js?v=37"></script></body>');
        if(!patched.includes("company-label.js")) patched=patched.replace(/<\/body>/i,'<script src="./company-label.js"></script></body>');

        const mobileInvoiceFix=`<style>
.imageList{touch-action:pan-y;-webkit-user-select:none;user-select:none}
.imageItem{touch-action:pan-y;-webkit-user-select:none;user-select:none}
.imageItem .drag{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}
.imageItem img{pointer-events:none;-webkit-user-drag:none}
.imageItem.dragging{opacity:.55;transform:scale(.99)}
.invoiceViewerScroll{max-height:65vh;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;border-radius:14px;border:1px solid #eee;background:#f7f7f5;text-align:center}
.invoiceViewerScroll img{display:block;width:100%;height:auto;max-height:none!important;object-fit:contain;border:0!important;border-radius:0!important;pointer-events:none;user-select:none;-webkit-user-drag:none}
</style><script>
(function(){
  var installed=false;
  function install(){
    if(installed || typeof window.renderPendingInvoiceImages!=="function") return;
    installed=true;
    var original=window.renderPendingInvoiceImages;
    window.renderPendingInvoiceImages=function(){
      original();
      var box=document.getElementById("imageList");
      if(!box) return;
      var items=box.querySelectorAll(".imageItem");
      items.forEach(function(item,index){
        if(item.dataset.mobileReorder==="1") return;
        item.dataset.mobileReorder="1";
        var handle=item.querySelector(".drag")||item;
        handle.style.touchAction="none";
        var state={timer:null,active:false,pointerId:null,startX:0,startY:0};
        handle.addEventListener("touchstart",function(e){
          if(!e.touches||!e.touches[0])return;
          var t=e.touches[0];state.startX=t.clientX;state.startY=t.clientY;state.active=false;
          clearTimeout(state.timer);
          state.timer=setTimeout(function(){
            state.active=true;item.classList.add("dragging");
            document.body.style.overflow="hidden";
            if(navigator.vibrate)try{navigator.vibrate(20)}catch(_){ }
          },220);
        },{passive:true});
        handle.addEventListener("touchmove",function(e){
          if(!state.active||!e.touches||!e.touches[0])return;
          e.preventDefault();
          var t=e.touches[0],target=document.elementFromPoint(t.clientX,t.clientY);
          var targetItem=target&&target.closest?target.closest(".imageItem"):null;
          if(!targetItem||targetItem===item||!box.contains(targetItem))return;
          var all=Array.from(box.querySelectorAll(".imageItem"));
          var from=all.indexOf(item),to=all.indexOf(targetItem);
          if(from<0||to<0||from===to)return;
          var r=targetItem.getBoundingClientRect();
          var after=t.clientY>r.top+r.height/2;
          var insertAt=to+(after?1:0);
          if(from<insertAt)insertAt--;
          if(insertAt===from)return;
          var moved=pendingInvoiceImages.splice(from,1)[0];
          pendingInvoiceImages.splice(insertAt,0,moved);
          if(insertAt>from){box.insertBefore(item,targetItem.nextSibling)}else{box.insertBefore(item,targetItem)}
          Array.from(box.querySelectorAll(".imageItem")).forEach(function(el,i){el.dataset.index=String(i)});
        },{passive:false});
        handle.addEventListener("touchend",function(){
          clearTimeout(state.timer);state.timer=null;
          if(!state.active)return;
          state.active=false;item.classList.remove("dragging");document.body.style.overflow="";
          Array.from(box.querySelectorAll(".imageItem")).forEach(function(el,i){
            el.dataset.index=String(i);
            var b=el.querySelector(".meta b"),badge=el.querySelector(".pageBadge");
            if(b)b.textContent=(i+1)+"-р хуудас";
            if(badge)badge.textContent="Хуудас "+(i+1);
          });
        },{passive:true});
        handle.addEventListener("touchcancel",function(){clearTimeout(state.timer);state.timer=null;state.active=false;item.classList.remove("dragging");document.body.style.overflow=""},{passive:true});
      });
    };
    window.renderPendingInvoiceImages();
  }
  install();
  window.addEventListener("load",install);
  var tries=0,watch=setInterval(function(){install();if(++tries>40)clearInterval(watch)},100);

  function enhanceViewer(){
    document.querySelectorAll(".sheet img").forEach(function(img){
      if(img.dataset.invoiceViewerEnhanced==="1")return;
      var parent=img.parentElement;if(!parent)return;
      if(!parent.querySelector(".viewerNav")&&!parent.parentElement?.querySelector(".viewerNav"))return;
      var wrap=document.createElement("div");wrap.className="invoiceViewerScroll";parent.insertBefore(wrap,img);wrap.appendChild(img);img.dataset.invoiceViewerEnhanced="1";
      var startY=0;
      wrap.addEventListener("touchstart",function(e){startY=e.touches[0]?.clientY||0},{passive:true});
      wrap.addEventListener("touchend",function(e){var endY=e.changedTouches[0]?.clientY||0,dy=endY-startY;if(Math.abs(dy)<70)return;if(dy<0&&typeof window.__invoiceNext==="function")window.__invoiceNext();if(dy>0&&typeof window.__invoicePrev==="function")window.__invoicePrev()},{passive:true});
    });
  }
  enhanceViewer();
  new MutationObserver(function(){install();enhanceViewer()}).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;
        patched=patched.replace(/<\/head>/i,mobileInvoiceFix+'</head>');
        return new Response(patched,{status:response.status,statusText:response.statusText,headers:response.headers});
      }catch(e){return response}
    }).catch(()=>caches.match("./")));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response;})));
});
