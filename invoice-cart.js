/* Invoice planning cart: IDs only, isolated by signed-in account and store. */
(()=>{
  if(window.NayadInvoiceCart)return;
  const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 3h3l3 12h11l3-9H6M9 19h.01M18 19h.01" stroke-linecap="round"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('mn-MN',{maximumFractionDigits:2}).format(n)+' ₮';
  const companies=()=>window.__nayadState?.read()?.companies||[];
  const allowed=()=>!!window.__nayadCan?.('invoices','view');
  function scope(){const user=window.__nayadUser?.id,store=window.__nayadActiveStoreId||window.__nayadActiveStore?.id;return user&&store&&String(window.__nayadStoresUserId)===String(user)?`NAYAD_INVOICE_CART:${user}:${store}`:null;}
  function ids(){try{const v=JSON.parse(localStorage.getItem(scope())||'[]');return new Set(Array.isArray(v)?v.filter(x=>typeof x==='string'):[]);}catch(_){return new Set();}}
  function save(set){const key=scope();if(!key)return false;try{localStorage.setItem(key,JSON.stringify([...set]));return true;}catch(_){window.toast?.('Сагсыг хадгалж чадсангүй.');return false;}}
  function valid(i){return (i.status||'confirmed')==='confirmed'&&Number(i.amount)>Number(i.paid||0);}
  function find(id){for(const c of companies()){const i=(c.invoices||[]).find(i=>String(i.id)===String(id));if(i)return {c,i};}return null;}
  function payable(i){return Math.round((window.__nayadInvoicePayable?.(i)??Math.max(Number(i.amount)-Number(i.paid||0),0))*100)/100;}
  function rows(){const selected=ids();return companies().flatMap(c=>(c.invoices||[]).filter(i=>selected.has(String(i.id))&&valid(i)).map(i=>({c,i,cash:payable(i)})));}
  function add(id){if(!scope()||!allowed())return;const item=find(id);if(!item||!valid(item.i))return;const set=ids();set.add(String(id));if(save(set)){window.toast?.('Падаан сагсанд орлоо.');refresh();}}
  function remove(id){const set=ids();set.delete(String(id));if(save(set)){refresh();if(document.getElementById('invoiceCartView'))open();}}
  function settled(key,completed){if(!key||key!==scope())return;const set=ids();for(const id of completed||[])set.delete(String(id));save(set);refresh();}
  function open(){
    if(!scope()||!allowed())return;
    const key=scope(),items=rows(),groups=new Map();
    for(const row of items){const id=String(row.c.id);if(!groups.has(id))groups.set(id,{c:row.c,rows:[]});groups.get(id).rows.push(row);}
    const total=items.reduce((s,r)=>s+Math.round(r.cash*100),0)/100;
    window.sheet(`<div id="invoiceCartView"><div class="pcFormHeader"><h2>Падааны сагс</h2><button class="pcFormClose" type="button" aria-label="Хаах" id="cartClose">×</button></div><p class="sub">${groups.size} байгууллага · ${items.length} падаан</p>${[...groups.values()].map(g=>`<section class="card cartGroup"><h3>${esc(g.c.name)}</h3>${g.rows.map(r=>`<div class="cartItem"><div><b>${esc(r.i.no||'Дугааргүй')}</b><small>${esc(r.i.date||'')} · Төлөх ${esc(r.i.due_date||'—')}</small></div><strong>${money(r.cash)}</strong><button type="button" data-cart-remove="${esc(r.i.id)}" aria-label="Сагснаас хасах">×</button></div>`).join('')}<div class="cartSubtotal"><span>Дүн</span><b>${money(g.rows.reduce((s,r)=>s+Math.round(r.cash*100),0)/100)}</b></div><button type="button" class="primary full" data-cart-pay="${esc(g.c.id)}" ${window.__nayadCan?.('payments','edit')?'':'disabled'}>Төлбөр бүртгэх</button></section>`).join('')||'<div class="card sub">Сагс хоосон байна. Нийлүүлэгчийн падааныг зүүн тийш шударч сагслаарай.</div>'}<div class="cartFooter"><span>Нийт төлөх дүн</span><b>${money(total)}</b><small>Сагслахад өр хасагдахгүй.</small></div></div>`);
    const view=document.getElementById('invoiceCartView');view.dataset.scope=key;view.dataset.signature=signature();
    document.getElementById('cartClose').onclick=()=>window.closeSheet();
    view.querySelectorAll('[data-cart-remove]').forEach(b=>b.onclick=()=>{if(key===scope())remove(b.dataset.cartRemove);});
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
    action.onclick=e=>{e.stopPropagation();add(id);wrap.classList.remove('revealed');};
    // A keyboard-accessible action is reachable by Tab; touch reveal never blocks vertical scroll.
    let start=null,dragged=false;
    row.addEventListener('touchstart',e=>{const t=e.touches[0];start={x:t.clientX,y:t.clientY};dragged=false;},{passive:true});
    row.addEventListener('touchmove',e=>{if(!start)return;const t=e.touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>12){start=null;return;}if(Math.abs(dx)>28&&Math.abs(dx)>Math.abs(dy)*1.4){dragged=true;wrap.classList.toggle('revealed',dx<0);}},{passive:true});
    row.addEventListener('click',e=>{if(dragged||wrap.classList.contains('revealed')){e.stopImmediatePropagation();e.preventDefault();wrap.classList.remove('revealed');dragged=false;}},true);
    row.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();wrap.classList.add('revealed');action.focus();}});
    action.addEventListener('focus',()=>wrap.classList.add('revealed'));
    const badge=document.createElement('small');badge.className='cartAdded';badge.textContent='Сагсанд орсон';row.append(badge);
  }
  function refresh(){
    const color=document.getElementById('storeBackgroundButton');let button=document.getElementById('invoiceCartButton');
    if(color&&!button){button=document.createElement('button');button.type='button';button.id='invoiceCartButton';button.innerHTML=icon+'<i></i>';button.onclick=open;color.before(button);}
    const access=!!scope()&&allowed(),selected=ids();
    if(button){button.hidden=!access;const count=access?rows().length:0,label=`Падааны сагс, ${count} падаан`;if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);const badge=button.querySelector('i');if(badge.textContent!==String(count))badge.textContent=String(count);badge.hidden=!count;}
    document.querySelectorAll('[data-cart-invoice]').forEach(row=>{if(access)decorate(row);const wrap=row.closest('.cartSwipe');if(wrap){wrap.classList.toggle('cartDisabled',!access);const badge=row.querySelector('.cartAdded');if(badge)badge.hidden=!access||!selected.has(row.dataset.cartInvoice);}});
    const view=document.getElementById('invoiceCartView');if(view){if(!access||view.dataset.scope!==scope()){window.closeSheet();view.remove();}else if(view.dataset.signature!==signature()){const top=document.getElementById('sheet')?.scrollTop||0;open();document.getElementById('sheet').scrollTop=top;}}
  }
  const style=document.createElement('style');style.textContent=`
  #invoiceCartButton{margin-left:auto;position:relative;flex-shrink:0;width:40px;height:44px;padding:8px;background:transparent;color:var(--text,#171717);border:0}#invoiceCartButton[hidden]{display:none}#invoiceCartButton svg{width:24px;height:24px}#invoiceCartButton i{position:absolute;top:0;right:0;background:#ffc000;color:#111;border-radius:20px;min-width:17px;padding:2px;font:700 10px sans-serif}
  .cartSwipe{position:relative;overflow:hidden;border-bottom:1px solid var(--line,#ddd)}.cartSwipeFront{position:relative;z-index:1;background:var(--surface,#fff);transition:transform .18s ease;touch-action:pan-y;margin:0!important}.cartSwipe.revealed>.cartSwipeFront{transform:translateX(-84px)}.cartSwipeAction{position:absolute;right:0;top:0;bottom:0;width:84px;background:#ffc000;color:#111;border-radius:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;font-size:12px}.cartSwipeAction svg{width:24px;height:24px}.cartAdded{color:#278348;font-size:10px;position:absolute;bottom:3px;right:4px}.cartAdded[hidden]{display:none}.cartDisabled .cartSwipeAction{display:none}.cartDisabled>.cartSwipeFront{transform:none!important}
  .cartGroup{margin:14px 0!important}.cartGroup h3{margin:0 0 8px;font-size:16px}.cartItem{display:flex;align-items:center;gap:8px;padding:12px 0;border-bottom:1px solid var(--line,#ddd);font-size:12px}.cartItem>div{flex:1;min-width:0}.cartItem b,.cartItem small{display:block;overflow-wrap:anywhere}.cartItem small{color:var(--muted);margin-top:4px}.cartItem strong{white-space:nowrap}.cartItem button{min-width:36px;min-height:40px;padding:5px;background:transparent;color:var(--muted);font-size:22px}.cartSubtotal{display:flex;justify-content:space-between;margin:14px 0}.cartFooter{position:sticky;bottom:0;background:var(--surface,#fff);border-top:1px solid var(--line,#ddd);padding:16px 0}.cartFooter span,.cartFooter b,.cartFooter small{display:block}.cartFooter b{font-size:24px;margin:5px 0}.cartFooter small{color:var(--muted);font-size:11px}.cartGroup button:disabled{opacity:.45}html.nightMode .cartSwipeFront{background:#1d1d1b}
  `;document.head.append(style);
  window.NayadInvoiceCart={open,add,remove,settled,scope,refresh};
  let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(refresh,50);}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  setInterval(refresh,30000);refresh();
})();
