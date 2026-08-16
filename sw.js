const CACHE = "nayad-v12";

const ASSETS = ["./","./manifest.webmanifest","./icon-180.png","./icon-192.png","./icon-512.png","./oauth-fix.js","./render.js","./user-scope.js","./share.js","./invoice-cloud.js"];

self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(fetch(request,{cache:"no-store"}).then(async response => {
      try {
        const html=await response.clone().text(); let patched=html;
        if(!patched.includes("user-scope.js")) patched=patched.replace(/<\/head>/i,'<script src="./user-scope.js"></script></head>');
        if(!patched.includes("oauth-fix.js")) patched=patched.replace(/<\/body>/i,'<script src="./oauth-fix.js"></script></body>');
        if(!patched.includes("render.js")) patched=patched.replace(/<\/body>/i,'<script src="./render.js"></script></body>');
        if(!patched.includes("share.js")) patched=patched.replace(/<\/body>/i,'<script src="./share.js"></script></body>');
        if(!patched.includes("invoice-cloud.js")) patched=patched.replace(/<\/body>/i,'<script src="./invoice-cloud.js"></script></body>');

        const mobileInvoiceFix=`<style>
.sheet{touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.imageList{touch-action:pan-y;-webkit-overflow-scrolling:touch}
.imageItem{touch-action:pan-y;-webkit-user-select:none;user-select:none}
.imageItem img{pointer-events:none}
.invoiceViewerScroll{max-height:65vh;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;border-radius:14px;border:1px solid #eee;background:#f7f7f5;text-align:center}
.invoiceViewerScroll img{display:block;width:100%;height:auto;max-height:none!important;object-fit:contain;border:0!important;border-radius:0!important;pointer-events:none;user-select:none;-webkit-user-drag:none}
</style><script>
(function(){
function enhanceTouchReorder(){document.querySelectorAll('.imageItem').forEach(function(el){if(el.dataset.touchReorder==='1')return;el.dataset.touchReorder='1';var timer=null,dragging=false,startY=0;el.addEventListener('touchstart',function(e){if(!e.touches?.[0])return;startY=e.touches[0].clientY;dragging=false;timer=setTimeout(function(){dragging=true;el.classList.add('dragging');try{el.dispatchEvent(new Event('dragstart',{bubbles:true,cancelable:true}))}catch(_){ }},280)},{passive:true});el.addEventListener('touchmove',function(e){if(!e.touches?.[0])return;var y=e.touches[0].clientY;if(!dragging){if(Math.abs(y-startY)>12){clearTimeout(timer);timer=null}return}e.preventDefault();var target=document.elementFromPoint(e.touches[0].clientX,y)?.closest('.imageItem');if(target&&target!==el)target.scrollIntoView({block:'nearest'})},{passive:false});el.addEventListener('touchend',function(e){clearTimeout(timer);timer=null;if(!dragging)return;dragging=false;el.classList.remove('dragging');var t=e.changedTouches?.[0],target=t?document.elementFromPoint(t.clientX,t.clientY)?.closest('.imageItem'):null;if(target){try{target.dispatchEvent(new Event('drop',{bubbles:true,cancelable:true}))}catch(_){}}},{passive:true});el.addEventListener('touchcancel',function(){clearTimeout(timer);timer=null;dragging=false;el.classList.remove('dragging')},{passive:true})})}
function enhanceViewer(){enhanceTouchReorder();document.querySelectorAll('.sheet img').forEach(function(img){if(img.dataset.invoiceViewerEnhanced==='1')return;var parent=img.parentElement;if(!parent)return;if(!parent.querySelector('.viewerNav')&&!parent.parentElement?.querySelector('.viewerNav'))return;var wrap=document.createElement('div');wrap.className='invoiceViewerScroll';parent.insertBefore(wrap,img);wrap.appendChild(img);img.dataset.invoiceViewerEnhanced='1';var startY=0;wrap.addEventListener('touchstart',function(e){startY=e.touches[0]?.clientY||0},{passive:true});wrap.addEventListener('touchend',function(e){var endY=e.changedTouches[0]?.clientY||0,dy=endY-startY;if(Math.abs(dy)<70)return;if(dy<0&&typeof window.__invoiceNext==='function')window.__invoiceNext();if(dy>0&&typeof window.__invoicePrev==='function')window.__invoicePrev()},{passive:true})})}
enhanceViewer();new MutationObserver(enhanceViewer).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;
        patched=patched.replace(/<\/head>/i,mobileInvoiceFix+'</head>');
        return new Response(patched,{status:response.status,statusText:response.statusText,headers:response.headers});
      }catch(e){return response}
    }).catch(()=>caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response;})));
});
