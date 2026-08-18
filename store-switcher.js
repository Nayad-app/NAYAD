/* NAYAD multi-store selector — one account can safely work in many stores. */
(function(){
  const ACTIVE_PREFIX='NAYAD_ACTIVE_STORE:';
  const DATA_PREFIX='NAYAD_DATA_V4:';
  let stores=[];
  let initializedFor='';
  let switching=false;

  const STYLE=`<style id="nayad-store-switcher-styles">
  .storeSwitcherBar{margin:0 0 14px}
  .storeSwitcherButton{width:100%;min-height:55px;padding:10px 12px;border:1px solid var(--line);border-radius:16px;background:#fff;display:flex;align-items:center;gap:11px;text-align:left;box-shadow:var(--shadow-sm);color:var(--text)}
  .storeSwitcherIcon{width:36px;height:36px;flex:0 0 36px;border-radius:11px;background:var(--yellow-soft);display:grid;place-items:center}
  .storeSwitcherIcon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .storeSwitcherText{min-width:0;flex:1}.storeSwitcherText small{display:block;color:var(--muted);font-size:9px;font-weight:750;margin-bottom:3px}.storeSwitcherText b{display:block;font-size:13px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .storeSwitcherChevron{width:18px;height:18px;fill:none;stroke:#777873;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .storePickerHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px}.storePickerHeader h2{margin:0}.storePickerClose{width:38px;height:38px;border-radius:50%;padding:0;background:var(--surface-2);display:grid;place-items:center}.storePickerClose svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
  .storePickerHint{color:var(--muted);font-size:11px;line-height:1.45;margin:7px 0 15px}
  .storePickerList{display:flex;flex-direction:column;gap:9px}.storePickerItem{width:100%;padding:12px;border:1px solid var(--line);border-radius:16px;background:#fff;display:flex;align-items:center;gap:11px;text-align:left;color:var(--text)}
  .storePickerItem.active{border-color:#E4B000;background:#FFF9E8;box-shadow:0 0 0 2px rgba(255,193,7,.12)}
  .storePickerAvatar{width:42px;height:42px;flex:0 0 42px;border-radius:13px;background:var(--yellow-soft);display:grid;place-items:center;font-weight:900;font-size:16px}
  .storePickerMeta{min-width:0;flex:1}.storePickerMeta b{display:block;font-size:13px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.storePickerMeta span{display:block;color:var(--muted);font-size:10px;margin-top:4px}
  .storePickerCheck{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--yellow);font-size:13px;font-weight:900}.storePickerItem:not(.active) .storePickerCheck{visibility:hidden}
  </style>`;
  if(!document.getElementById('nayad-store-switcher-styles'))document.head.insertAdjacentHTML('beforeend',STYLE);

  function sb(){return window.nayadSupabase||window.sb||null;}
  function userId(){return window.__nayadUser?.id||'';}
  function activeKey(){return userId()?ACTIVE_PREFIX+userId():'';}
  function initial(name){return String(name||'N').trim().slice(0,1).toUpperCase();}
  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function active(){return window.__nayadActiveStore||null;}
  function roleLabel(role){return role==='owner'?'Эзэмшигч':'Гишүүн';}

  window.__nayadStoreDataKey=function(uid=userId(),storeId=window.__nayadActiveStoreId){
    return uid&&storeId?`${DATA_PREFIX}${uid}:${storeId}`:(uid?`NAYAD_DATA_V3:${uid}`:'NAYAD_DATA_V2');
  };

  async function fetchStores(){
    const client=sb();if(!client)return [];
    const {data:{session}}=await client.auth.getSession();if(!session)return [];
    let result=await client.from('store_members').select('store_id,role,created_at,stores!inner(id,name)').eq('user_id',session.user.id).order('created_at',{ascending:true});
    if(result.error)throw result.error;
    if(!(result.data||[]).length){
      const made=await client.rpc('ensure_my_store');if(made.error)throw made.error;
      result=await client.from('store_members').select('store_id,role,created_at,stores!inner(id,name)').eq('user_id',session.user.id).order('created_at',{ascending:true});
      if(result.error)throw result.error;
    }
    return (result.data||[]).map(row=>{
      const store=Array.isArray(row.stores)?row.stores[0]:row.stores;
      return {id:row.store_id||store?.id,name:store?.name||'NAYAD',role:row.role||'member',created_at:row.created_at};
    }).filter(x=>x.id).sort((a,b)=>(a.role==='owner'?0:1)-(b.role==='owner'?0:1)||String(a.created_at||'').localeCompare(String(b.created_at||'')));
  }

  function renderBar(){
    const content=document.getElementById('content');
    if(!content||document.getElementById('app')?.classList.contains('hide')||!active())return;
    content.querySelector('.storeSwitcherBar')?.remove();
    const bar=document.createElement('div');bar.className='storeSwitcherBar';
    bar.innerHTML=`<button class="storeSwitcherButton" type="button" onclick="showNayadStorePicker()"><span class="storeSwitcherIcon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10h18l-1.5-6h-15Z"/><path d="M8 10v2a2 2 0 0 0 4 0v-2M12 10v2a2 2 0 0 0 4 0v-2M9 20v-5h6v5"/></svg></span><span class="storeSwitcherText"><small>ИДЭВХТЭЙ ДЭЛГҮҮР</small><b>${esc(active().name)}</b></span><svg class="storeSwitcherChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></button>`;
    content.insertBefore(bar,content.firstChild);
  }

  function showPicker(){
    if(typeof window.sheet!=='function')return;
    const rows=stores.map(store=>`<button class="storePickerItem ${String(store.id)===String(window.__nayadActiveStoreId)?'active':''}" type="button" onclick="selectNayadStore('${esc(store.id)}')"><span class="storePickerAvatar">${esc(initial(store.name))}</span><span class="storePickerMeta"><b>${esc(store.name)}</b><span>${roleLabel(store.role)}</span></span><span class="storePickerCheck">✓</span></button>`).join('');
    window.sheet(`<div class="storePickerHeader"><h2>Дэлгүүр сонгох</h2><button class="storePickerClose" type="button" onclick="closeSheet()" aria-label="Хаах"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="storePickerHint">Та өөрийн болон хуваалцсан дэлгүүрүүдийн хооронд шилжиж болно.</div><div class="storePickerList">${rows||'<div class="card">Дэлгүүр олдсонгүй.</div>'}</div>`);
  }

  async function activateStore(storeId,options={}){
    const next=stores.find(s=>String(s.id)===String(storeId));if(!next)return false;
    const changed=String(window.__nayadActiveStoreId||'')!==String(next.id);
    /* Finish every write for the current store before changing the active id.
       Cloud tasks resolve their store lazily, so switching first could otherwise
       send an older payment or invoice to the newly selected store. */
    if(changed&&options.sync!==false&&window.__nayadCloudSyncQueue){
      await window.__nayadCloudSyncQueue.catch(()=>{});
    }
    window.__nayadActiveStoreId=next.id;window.__nayadActiveStore=next;
    if(activeKey())localStorage.setItem(activeKey(),next.id);
    if(changed&&window.__nayadState){
      const nextData=window.__nayadState.read();
      window.__nayadState.commit(nextData,{render:false});
      try{if(typeof page!=='undefined')page='home';if(typeof selected!=='undefined')selected=null;}catch(_){}
    }
    if(typeof window.closeSheet==='function'&&options.close!==false)window.closeSheet();
    if(typeof window.render==='function')window.render();else renderBar();
    if(changed&&options.sync!==false){
      if(typeof window.__nayadSyncInvoices==='function')await window.__nayadSyncInvoices();
      if(typeof window.__nayadSyncSuppliers==='function')await window.__nayadSyncSuppliers();
    }
    return true;
  }

  async function refreshStores(options={}){
    const uid=userId();if(!uid)return [];
    stores=await fetchStores();window.__nayadStores=stores;
    const requested=options.selectStoreId;
    const remembered=localStorage.getItem(ACTIVE_PREFIX+uid);
    const current=window.__nayadActiveStoreId;
    const selectedId=[requested,current,remembered].find(id=>id&&stores.some(s=>String(s.id)===String(id)))||stores[0]?.id;
    initializedFor=uid;
    if(selectedId)await activateStore(selectedId,{sync:options.sync!==false,close:options.close});
    return stores;
  }

  async function selectStore(storeId){
    if(switching)return;switching=true;
    try{await activateStore(storeId,{sync:true,close:true});}
    catch(e){console.error('Store switch:',e);if(typeof window.toast==='function')window.toast('Дэлгүүр солиход алдаа гарлаа.');}
    finally{switching=false;}
  }

  async function getActiveStore(){
    if(active()&&initializedFor===userId())return active();
    await refreshStores({sync:false,close:false});
    return active();
  }

  const originalRender=window.render;
  if(typeof originalRender==='function')window.render=function(){const result=originalRender();renderBar();return result;};
  window.showNayadStorePicker=showPicker;
  window.selectNayadStore=selectStore;
  window.__nayadRefreshStores=refreshStores;
  window.__nayadGetActiveStore=getActiveStore;

  window.addEventListener('load',()=>setTimeout(()=>refreshStores({sync:true,close:false}).catch(e=>console.warn('Store list:',e)),800));
  const authClient=sb();
  if(typeof authClient?.auth?.onAuthStateChange==='function')authClient.auth.onAuthStateChange((_event,session)=>{
    if(!session){stores=[];initializedFor='';window.__nayadStores=[];window.__nayadActiveStore=null;window.__nayadActiveStoreId=null;return;}
    setTimeout(()=>refreshStores({sync:true,close:false}).catch(e=>console.warn('Store auth refresh:',e)),0);
  });
})();
