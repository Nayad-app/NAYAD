/* NAYAD mobile invoice reorder/viewer enhancements. */
(function(){
  if(document.getElementById('nayad-mobile-invoice-fix'))return;

  /* Keep the app shell at its designed scale on iOS while preserving normal
     one-finger scrolling. */
  ['gesturestart','gesturechange','gestureend'].forEach(type=>{
    document.addEventListener(type,event=>event.preventDefault(),{passive:false});
  });
  document.addEventListener('touchmove',event=>{
    if(event.touches&&event.touches.length>1)event.preventDefault();
  },{passive:false});
  const style=document.createElement('style');
  style.id='nayad-mobile-invoice-fix';
  style.textContent=`
.imageList{touch-action:pan-y;-webkit-user-select:none;user-select:none}
.imageItem{touch-action:pan-y;-webkit-user-select:none;user-select:none}
.imageItem .drag{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}
.imageItem img{pointer-events:none;-webkit-user-drag:none}
.imageItem.dragging{opacity:.55;transform:scale(.99)}
.invoiceViewerScroll{max-height:65vh;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;border-radius:14px;border:1px solid #eee;background:#f7f7f5;text-align:center}
.invoiceViewerScroll img{display:block;width:100%;height:auto;max-height:none!important;object-fit:contain;border:0!important;border-radius:0!important;pointer-events:none;user-select:none;-webkit-user-drag:none}`;
  document.head.appendChild(style);

  let installed=false;
  function install(){
    if(installed||typeof window.renderPendingInvoiceImages!=='function')return;
    installed=true;
    const original=window.renderPendingInvoiceImages;
    window.renderPendingInvoiceImages=function(){
      original();
      const box=document.getElementById('imageList');
      if(!box)return;
      box.querySelectorAll('.imageItem').forEach(item=>{
        if(item.dataset.mobileReorder==='1')return;
        item.dataset.mobileReorder='1';
        const handle=item.querySelector('.drag')||item;
        handle.style.touchAction='none';
        const state={timer:null,active:false};
        handle.addEventListener('touchstart',event=>{
          if(!event.touches?.[0])return;
          state.active=false;
          clearTimeout(state.timer);
          state.timer=setTimeout(()=>{
            state.active=true;
            item.classList.add('dragging');
            document.body.style.overflow='hidden';
            if(navigator.vibrate)try{navigator.vibrate(20)}catch(_){ }
          },220);
        },{passive:true});
        handle.addEventListener('touchmove',event=>{
          if(!state.active||!event.touches?.[0])return;
          event.preventDefault();
          const touch=event.touches[0];
          const target=document.elementFromPoint(touch.clientX,touch.clientY);
          const targetItem=target?.closest?.('.imageItem');
          if(!targetItem||targetItem===item||!box.contains(targetItem))return;
          const all=Array.from(box.querySelectorAll('.imageItem'));
          const from=all.indexOf(item),to=all.indexOf(targetItem);
          if(from<0||to<0||from===to)return;
          const rect=targetItem.getBoundingClientRect();
          const after=touch.clientY>rect.top+rect.height/2;
          let insertAt=to+(after?1:0);
          if(from<insertAt)insertAt--;
          if(insertAt===from)return;
          const moved=window.pendingInvoiceImages?.splice?.(from,1)?.[0];
          if(moved&&Array.isArray(window.pendingInvoiceImages))window.pendingInvoiceImages.splice(insertAt,0,moved);
          else if(typeof pendingInvoiceImages!=='undefined'){
            const localMoved=pendingInvoiceImages.splice(from,1)[0];
            pendingInvoiceImages.splice(insertAt,0,localMoved);
          }
          if(insertAt>from)box.insertBefore(item,targetItem.nextSibling);else box.insertBefore(item,targetItem);
          Array.from(box.querySelectorAll('.imageItem')).forEach((el,index)=>{el.dataset.index=String(index);});
        },{passive:false});
        const finish=()=>{
          clearTimeout(state.timer);state.timer=null;
          if(!state.active)return;
          state.active=false;item.classList.remove('dragging');document.body.style.overflow='';
          Array.from(box.querySelectorAll('.imageItem')).forEach((el,index)=>{
            el.dataset.index=String(index);
            const title=el.querySelector('.meta b'),badge=el.querySelector('.pageBadge');
            if(title)title.textContent=(index+1)+'-р хуудас';
            if(badge)badge.textContent='Хуудас '+(index+1);
          });
        };
        handle.addEventListener('touchend',finish,{passive:true});
        handle.addEventListener('touchcancel',()=>{clearTimeout(state.timer);state.timer=null;state.active=false;item.classList.remove('dragging');document.body.style.overflow='';},{passive:true});
      });
    };
    window.renderPendingInvoiceImages();
  }

  function enhanceViewer(){
    document.querySelectorAll('.sheet img').forEach(img=>{
      if(img.dataset.invoiceViewerEnhanced==='1')return;
      const parent=img.parentElement;if(!parent)return;
      if(!parent.querySelector('.viewerNav')&&!parent.parentElement?.querySelector('.viewerNav'))return;
      const wrap=document.createElement('div');wrap.className='invoiceViewerScroll';
      parent.insertBefore(wrap,img);wrap.appendChild(img);img.dataset.invoiceViewerEnhanced='1';
      let startY=0;
      wrap.addEventListener('touchstart',event=>{startY=event.touches[0]?.clientY||0;},{passive:true});
      wrap.addEventListener('touchend',event=>{
        const endY=event.changedTouches[0]?.clientY||0,dy=endY-startY;
        if(Math.abs(dy)<70)return;
        if(dy<0&&typeof window.__invoiceNext==='function')window.__invoiceNext();
        if(dy>0&&typeof window.__invoicePrev==='function')window.__invoicePrev();
      },{passive:true});
    });
  }

  install();enhanceViewer();
  window.addEventListener('load',()=>{install();enhanceViewer();});
  let tries=0;const watch=setInterval(()=>{install();enhanceViewer();if(++tries>40)clearInterval(watch);},100);
  new MutationObserver(()=>{install();enhanceViewer();}).observe(document.documentElement,{childList:true,subtree:true});
})();
