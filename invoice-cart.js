/* Invoice planning cart: Shared server-backed selection per store; signed-in account scopes pending requests. */
(()=>{
  if(window.NayadInvoiceCart)return;
  const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 3h3l3 12h11l3-9H6M9 19h.01M18 19h.01" stroke-linecap="round"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('mn-MN',{maximumFractionDigits:2}).format(n)+' ₮';
  const companies=()=>window.__nayadState?.read()?.companies||[];
  const allowed=()=>!!window.__nayadCan?.('invoices','view');
  function scope(){const user=window.__nayadUser?.id,store=window.__nayadActiveStoreId||window.__nayadActiveStore?.id;return user&&store&&String(window.__nayadStoresUserId)===String(user)?`NAYAD_INVOICE_CART:${user}:${store}`:null;}
  const client=()=>window.nayadSupabase||window.sb;
  let sharedKey=null,sharedIds=new Set(),lastLoad=0,loadTask=null,revision=0;
  function ids(){return sharedKey===scope()?new Set(sharedIds):new Set();}
  function currentStore(){return window.__nayadActiveStoreId||window.__nayadActiveStore?.id;}
  function resetScope(){const key=scope();if(key!==sharedKey){sharedKey=key;sharedIds=new Set();lastLoad=0;loadTask=null;revision++;}return key;}
  async function loadShared(force=false){
    const key=resetScope(),store=currentStore(),c=client();
    if(!key||!allowed()||!c?.from)return;
    if(loadTask)return loadTask;
    if(!force&&Date.now()-lastLoad<5000)return;
    const version=revision;
    const task=(async()=>{
      try{
        // Import this account/device's previous cart once, without replacing others' choices.
        let legacy=[];try{legacy=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){}
        if(Array.isArray(legacy)&&legacy.length){
          const candidates=legacy.map(String).filter(id=>{const item=find(id);return item&&valid(item.i);});
          for(const id of candidates){
            if(key!==scope())return;
            const imported=await c.from('store_invoice_cart').upsert({store_id:store,invoice_id:id,created_by:window.__nayadUser.id},{onConflict:'invoice_id',ignoreDuplicates:true});
            if(imported.error)throw imported.error;
          }
          if(key===scope()){
            const unresolved=legacy.filter(id=>!find(id));
            if(unresolved.length)localStorage.setItem(key,JSON.stringify(unresolved));else localStorage.removeItem(key);
          }
        }
        const result=await c.from('store_invoice_cart').select('invoice_id').eq('store_id',store);
        if(result.error)throw result.error;
        if(key!==scope()||key!==sharedKey||version!==revision)return;
        sharedIds=new Set((result.data||[]).map(r=>String(r.invoice_id)));lastLoad=Date.now();refresh();
      }catch(e){if(key===scope()){lastLoad=Date.now();if(force)window.toast?.('Дундын сагсыг ачаалж чадсангүй. Дахин оролдоно уу.');}}
    })();loadTask=task;try{await task;}finally{if(loadTask===task)loadTask=null;}
  }
  async function changeShared(id,adding){
    const key=resetScope(),store=currentStore(),c=client();if(!key||!allowed()||!c?.from)return false;
    revision++;
    try{
      const result=adding?await c.from('store_invoice_cart').upsert({store_id:store,invoice_id:String(id),created_by:window.__nayadUser.id},{onConflict:'invoice_id',ignoreDuplicates:true}):await c.from('store_invoice_cart').delete().eq('store_id',store).eq('invoice_id',String(id));
      if(result.error)throw result.error;
      if(key!==scope()||key!==sharedKey)return false;
      if(adding)sharedIds.add(String(id));else sharedIds.delete(String(id));
      lastLoad=0;refresh();return true;
    }catch(e){if(key===scope())window.toast?.('Сагсны өөрчлөлт хадгалагдсангүй. Холболтоо шалгаад дахин оролдоно уу.');return false;}
  }
  function valid(i){return (i.status||'confirmed')==='confirmed'&&Number(i.amount)>Number(i.paid||0);}
  function find(id){for(const c of companies()){const i=(c.invoices||[]).find(i=>String(i.id)===String(id));if(i)return {c,i};}return null;}
  function payable(i){return Math.round((window.__nayadInvoicePayable?.(i)??Math.max(Number(i.amount)-Number(i.paid||0),0))*100)/100;}
  function rows(){const selected=ids();return companies().flatMap(c=>(c.invoices||[]).filter(i=>selected.has(String(i.id))&&valid(i)).map(i=>({c,i,cash:payable(i)})));}
  async function add(id){if(!scope()||!allowed())return;const item=find(id);if(!item||!valid(item.i))return;if(await changeShared(id,true))window.toast?.('Падаан сагсанд орлоо.');}
  async function remove(id){return changeShared(id,false);}
  function settled(key,completed){if(!key||key!==scope())return;for(const id of completed||[])sharedIds.delete(String(id));lastLoad=0;refresh();loadShared(true);}
  function open(){
    if(!scope()||!allowed())return;
    loadShared(true);
    const key=scope(),items=rows(),groups=new Map();
    for(const row of items){const id=String(row.c.id);if(!groups.has(id))groups.set(id,{c:row.c,rows:[]});groups.get(id).rows.push(row);}
    const total=items.reduce((s,r)=>s+Math.round(r.cash*100),0)/100;
    window.sheet(`<div id="invoiceCartView"><div class="pcFormHeader"><h2>Падааны сагс</h2><button class="pcFormClose" type="button" aria-label="Хаах" id="cartClose">×</button></div><p class="sub cartCount">${groups.size} байгууллага · ${items.length} падаан</p><p class="cartSwipeHint"><span aria-hidden="true">‹</span> Зүүн тийш шударч сагснаас хасна</p><div class="cartList">${[...groups.values()].map(g=>`<section class="cartGroup"><h3>${esc(g.c.name)}</h3>${g.rows.map(r=>`<div class="cartRemoveWrap"><div class="cartItem" tabindex="0" aria-label="Зүүн тийш шударч сагснаас хасах"><div><b>${esc(r.i.no||'Дугааргүй')}</b><small>${esc(r.i.date||'')} · Төлөх ${esc(r.i.due_date||'—')}</small></div><strong>${money(r.cash)}</strong><svg class="cartRemoveChevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></div><button type="button" class="cartRemoveAction" data-cart-remove="${esc(r.i.id)}" aria-label="Сагснаас хасах"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg><span>Сагснаас<br>хасах</span></button></div>`).join('')}<div class="cartSubtotal"><span>Дүн: <b>${money(g.rows.reduce((s,r)=>s+Math.round(r.cash*100),0)/100)}</b></span><button type="button" class="primary" data-cart-pay="${esc(g.c.id)}" ${window.__nayadCan?.('payments','edit')?'':'disabled'}>Төлбөр бүртгэх</button></div></section>`).join('')||'<div class="card sub">Сагс хоосон байна. Нийлүүлэгчийн падааныг зүүн тийш шударч сагслаарай.</div>'}</div><div class="cartFooter"><span>Нийт</span><b>${money(total)}</b></div></div>`);
    const view=document.getElementById('invoiceCartView');view.dataset.scope=key;view.dataset.signature=signature();
    document.getElementById('cartClose').onclick=()=>window.closeSheet();
    view.querySelectorAll('[data-cart-remove]').forEach(b=>{
      b.onclick=()=>{if(key===scope())remove(b.dataset.cartRemove);};
      const wrap=b.parentElement,row=wrap.querySelector('.cartItem');let start=null;
      const reveal=on=>{if(on)view.querySelectorAll('.cartRemoveWrap.revealed').forEach(el=>{if(el!==wrap)el.classList.remove('revealed');});wrap.classList.toggle('revealed',on);};
      row.addEventListener('touchstart',e=>{const t=e.touches[0];start={x:t.clientX,y:t.clientY};},{passive:true});
      row.addEventListener('touchmove',e=>{if(!start)return;const t=e.touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>12){start=null;return;}if(Math.abs(dx)>28&&Math.abs(dx)>Math.abs(dy)*1.4)reveal(dx<0);},{passive:true});
      row.addEventListener('touchcancel',()=>{start=null;reveal(false);});
      row.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();reveal(true);b.focus();}if(e.key==='Escape'||e.key==='ArrowRight')reveal(false);});
      b.addEventListener('focus',()=>reveal(true));
      b.addEventListener('keydown',e=>{if(e.key==='Escape'){row.focus();reveal(false);}});
      row.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')start={x:e.clientX,y:e.clientY};});
      row.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&start){if(Math.abs(e.clientX-start.x)>28)reveal(e.clientX<start.x);start=null;}});
    });
    view.querySelectorAll('[data-cart-pay]').forEach(b=>b.onclick=()=>{
      if(key!==scope()||!window.__nayadCan?.('payments','edit'))return;
      const current=rows().filter(r=>String(r.c.id)===b.dataset.cartPay);if(!current.length){open();return;}
      window.payment(current[0].c.id,current.map(r=>String(r.i.id)));
    });
  }
  function signature(){return JSON.stringify(rows().map(r=>[r.c.id,r.c.name,r.i.id,r.i.no,r.i.date,r.i.due_date,r.cash]));}
  function decorate(row){
    if(row.dataset.cartReady)return;
    const id=row.dataset.cartInvoice,item=find(id);if(!item||!valid(item.i))return;
    row.dataset.cartReady='1';const wrap=document.createElement('div');wrap.className='cartSwipe';row.before(wrap);wrap.append(row);row.classList.add('cartSwipeFront');
    const action=document.createElement('button');action.type='button';action.className='cartSwipeAction';action.innerHTML=icon+'<span>Сагслах</span>';action.setAttribute('aria-label','Падаан сагслах');wrap.append(action);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='cartRevealToggle';toggle.setAttribute('aria-label','Сагслах товч харуулах');toggle.setAttribute('aria-expanded','false');toggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';row.append(toggle);
    const reveal=open=>{wrap.classList.toggle('revealed',open);toggle.setAttribute('aria-expanded',String(open));};
    toggle.onclick=e=>{e.preventDefault();e.stopPropagation();if(!wrap.classList.contains('cartDisabled'))reveal(!wrap.classList.contains('revealed'));};
    toggle.addEventListener('keydown',e=>e.stopPropagation());
    action.onclick=e=>{e.stopPropagation();add(id);reveal(false);};
    // A keyboard-accessible action is reachable by Tab; touch reveal never blocks vertical scroll.
    let start=null,dragged=false;
    row.addEventListener('touchstart',e=>{const t=e.touches[0];start={x:t.clientX,y:t.clientY};dragged=false;},{passive:true});
    row.addEventListener('touchmove',e=>{if(!start)return;const t=e.touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>12){start=null;return;}if(Math.abs(dx)>28&&Math.abs(dx)>Math.abs(dy)*1.4){dragged=true;reveal(dx<0);}},{passive:true});
    row.addEventListener('click',e=>{if(e.target.closest?.('.cartRevealToggle'))return;if(dragged||wrap.classList.contains('revealed')){e.stopImmediatePropagation();e.preventDefault();reveal(false);dragged=false;}},true);
    row.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();reveal(true);action.focus();}});
    action.addEventListener('focus',()=>reveal(true));
    const badge=document.createElement('small');badge.className='cartAdded';badge.textContent='Сагсанд орсон';row.append(badge);
  }
  function refresh(){
    resetScope();loadShared();
    const color=document.getElementById('storeBackgroundButton');let button=document.getElementById('invoiceCartButton');
    if(color&&!button){button=document.createElement('button');button.type='button';button.id='invoiceCartButton';button.innerHTML=icon+'<i></i>';button.onclick=open;color.before(button);}
    const access=!!scope()&&allowed(),selected=ids();
    if(button){button.hidden=!access;const count=access?rows().length:0,label=`Падааны сагс, ${count} падаан`;if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);const badge=button.querySelector('i');if(badge.textContent!==String(count))badge.textContent=String(count);badge.hidden=!count;}
    document.querySelectorAll('[data-cart-invoice]').forEach(row=>{if(access)decorate(row);const wrap=row.closest('.cartSwipe');if(wrap){wrap.classList.toggle('cartDisabled',!access);const badge=row.querySelector('.cartAdded');if(badge)badge.hidden=!access||!selected.has(row.dataset.cartInvoice);}});
    const view=document.getElementById('invoiceCartView');if(view){if(!access||view.dataset.scope!==scope()){window.closeSheet();view.remove();}else if(view.dataset.signature!==signature()){const top=view.querySelector('.cartList')?.scrollTop||0;open();document.querySelector('#invoiceCartView .cartList').scrollTop=top;}}
  }
  const style=document.createElement('style');style.textContent=`
  #invoiceCartButton{margin-left:auto;position:relative;flex-shrink:0;width:40px;height:44px;padding:8px;background:transparent;color:var(--text,#171717);border:0}#invoiceCartButton[hidden]{display:none}#invoiceCartButton svg{width:24px;height:24px}#invoiceCartButton i{position:absolute;top:0;right:0;background:#ffc000;color:#111;border-radius:20px;min-width:17px;padding:2px;font:700 10px sans-serif}
  .cartSwipe{position:relative;overflow:hidden;border-bottom:1px solid var(--line,#ddd)}.cartSwipeFront{position:relative;z-index:1;background:var(--surface,#fff);transition:transform .18s ease;touch-action:pan-y;margin:0!important}.cartSwipe.revealed>.cartSwipeFront{transform:translateX(-84px)}.cartSwipeAction{position:absolute;right:0;top:0;bottom:0;width:84px;background:#ffc000;color:#111;border-radius:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;font-size:12px}.cartSwipeAction svg{width:24px;height:24px}.cartSwipeFront{padding-right:44px!important}.cartRevealToggle{position:absolute;right:0;top:50%;transform:translateY(-50%);width:40px;height:44px;padding:10px!important;border:0;background:transparent!important;color:var(--muted,#777);display:flex;align-items:center;justify-content:center;cursor:pointer}.cartRevealToggle svg{width:20px;height:20px;pointer-events:none}.cartDisabled .cartRevealToggle{display:none}.cartAdded{color:#278348;font-size:10px;position:absolute;bottom:3px;right:44px}.cartAdded[hidden]{display:none}.cartDisabled .cartSwipeAction{display:none}.cartDisabled>.cartSwipeFront{transform:none!important}
  #modal:has(#invoiceCartView){align-items:flex-end;padding:0!important}
  #modal:has(#invoiceCartView) #sheet{height:min(90dvh,900px)!important;max-height:90dvh!important;width:min(100%,520px)!important;padding:0!important;overflow:hidden!important;border-radius:22px 22px 0 0!important;background:var(--surface,#fff)}
  #invoiceCartView{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--text,#171717);font-size:13px}
  #invoiceCartView .pcFormHeader{flex-shrink:0;margin:0!important;padding:10px 16px 0!important;min-height:44px}
  #invoiceCartView h2{font-size:22px!important;line-height:1.2;margin:0!important}
  #invoiceCartView .pcFormClose{font-size:26px!important;width:40px!important;height:40px!important;padding:4px!important}
  #invoiceCartView .cartCount{margin:0!important;padding:0 16px 3px;font-size:12px!important;flex-shrink:0}
  #invoiceCartView .cartSwipeHint{margin:0!important;padding:0 16px 8px;font-size:11px!important;line-height:1.4;color:var(--muted,#777);flex-shrink:0}
  #invoiceCartView .cartRemoveChevron{width:16px;height:16px;flex-shrink:0;color:var(--muted,#777)}
  #invoiceCartView .cartList{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 16px}
  #invoiceCartView .cartGroup{margin:0!important;padding:9px 0!important;border:0;border-bottom:1px solid var(--line,#ddd);border-radius:0;background:transparent;box-shadow:none}
  #invoiceCartView .cartGroup h3{margin:0 0 3px!important;font-size:14px!important;line-height:1.25;overflow-wrap:anywhere}
  #invoiceCartView .cartItem{display:flex;align-items:center;gap:6px;padding:5px 0!important;min-height:42px;font-size:12px!important;background:var(--surface,#fff);position:relative;z-index:1;transition:transform .18s ease;touch-action:pan-y}
  #invoiceCartView .cartItem>div{flex:1;min-width:0}#invoiceCartView .cartItem b,#invoiceCartView .cartItem small{display:block;overflow-wrap:anywhere}
  #invoiceCartView .cartItem small{color:var(--muted);margin-top:3px;font-size:10px!important;line-height:1.3}
  #invoiceCartView .cartItem strong{white-space:nowrap;font-size:13px!important}
  #invoiceCartView .cartSubtotal{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0 0!important;font-size:12px!important}
  #invoiceCartView .cartSubtotal>span{min-width:0;overflow-wrap:anywhere}#invoiceCartView .cartSubtotal button{flex-shrink:0;min-height:34px;padding:7px 10px!important;border-radius:8px;font-size:11px!important;width:auto!important}
  #invoiceCartView .cartFooter{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--line,#ddd);background:var(--surface,#fff);padding:12px 16px calc(12px + env(safe-area-inset-bottom))!important;font-size:14px!important;position:relative;z-index:2}
  #invoiceCartView .cartFooter b{font-size:clamp(16px,4.7vw,21px)!important;white-space:nowrap;margin:0!important}
  .cartRemoveWrap{position:relative;overflow:hidden}.cartRemoveWrap.revealed>.cartItem{transform:translateX(-88px)}
  #invoiceCartView .cartRemoveAction{position:absolute;right:0;top:0;bottom:0;width:88px;min-height:44px;padding:3px!important;background:#dc3545;color:white;border-radius:0;display:flex;align-items:center;justify-content:center;gap:4px;font-size:10px!important;line-height:1.2}
  .cartRemoveAction svg{width:18px;height:18px;flex-shrink:0}.cartGroup button:disabled{opacity:.45}
  html.nightMode .cartSwipeFront,html.nightMode #invoiceCartView .cartItem{background:#1d1d1b}
  `;document.head.append(style);
  window.NayadInvoiceCart={open,add,remove,settled,scope,refresh,sync:()=>loadShared(true)};
  let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(refresh,50);}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  setInterval(()=>{if(!document.hidden)refresh();},5000);refresh();
})();
