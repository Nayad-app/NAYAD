/* NAYAD multi-store selector — one account can safely work in many stores. */
(function(){
  const ACTIVE_PREFIX='NAYAD_ACTIVE_STORE:';
  const DATA_PREFIX='NAYAD_DATA_V4:';
  let stores=[];
  let initializedFor='';
  let switching=false;
  let refreshQueue=Promise.resolve([]);

  const STYLE=`<style id="nayad-store-switcher-styles">
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
  function runtimeUserId(){return String(window.__nayadStoresUserId||'');}
  function runtimeBelongsTo(uid=userId()){return Boolean(uid)&&runtimeUserId()===String(uid);}
  function hasRuntimeStoreState(){
    return Boolean(
      stores.length||initializedFor||window.__nayadStores?.length||
      window.__nayadActiveStoreId||window.__nayadActiveStore
    );
  }
  function trustedGlobalStores(uid=userId()){
    return runtimeBelongsTo(uid)&&Array.isArray(window.__nayadStores)?window.__nayadStores:null;
  }
  function activeKey(){return userId()?ACTIVE_PREFIX+userId():'';}
  function initial(name){return String(name||'N').trim().slice(0,1).toUpperCase();}
  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function active(){return runtimeBelongsTo()?window.__nayadActiveStore||null:null;}
  function roleLabel(role){return role==='owner'?'Эзэмшигч':'Гишүүн';}
  function normalizeStores(rows){
    return (rows||[]).map(row=>({id:row.id,name:row.name||'NAYAD',role:row.role||'member',created_at:row.created_at})).filter(row=>row.id);
  }
  function clearRuntimeStoreState(){
    stores=[];
    initializedFor='';
    window.__nayadStores=[];
    window.__nayadStoresUserId='';
    window.__nayadActiveStore=null;
    window.__nayadActiveStoreId=null;
  }
  async function ensureCurrentUser(){
    const client=sb();
    if(!client?.auth?.getSession)return userId();
    try{
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      const user=data?.session?.user||null;
      if(!user?.id)return '';
      const currentId=userId();
      if(String(currentId)!==String(user.id)){
        clearRuntimeStoreState();
        if(typeof window.profileFromUser==='function')window.profileFromUser(user);
        else window.__nayadUser=user;
      }else if(hasRuntimeStoreState()&&!runtimeBelongsTo(user.id)){
        clearRuntimeStoreState();
      }
      return user.id;
    }catch(error){
      console.warn('Store identity recovery:',error);
      return userId();
    }
  }
  function hydrateVerifiedStores(rows,expectedUserId=userId()){
    if(!expectedUserId||String(expectedUserId)!==String(userId()))return false;
    const verified=normalizeStores(rows);
    if(!verified.length)return false;
    stores=verified;
    initializedFor=expectedUserId;
    window.__nayadStores=stores;
    window.__nayadStoresUserId=expectedUserId;
    return true;
  }

  async function waitForSessionUser(client,expectedUserId){
    for(let attempt=0;attempt<4;attempt++){
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      const sessionUserId=data?.session?.user?.id||'';
      if(String(sessionUserId)===String(expectedUserId))return true;
      if(attempt<3)await new Promise(resolve=>setTimeout(resolve,80));
    }
    return false;
  }

  window.__nayadStoreDataKey=function(uid=userId(),storeId){
    const resolvedStoreId=storeId!==undefined?storeId:(runtimeBelongsTo(uid)?window.__nayadActiveStoreId:null);
    return uid&&resolvedStoreId?`${DATA_PREFIX}${uid}:${resolvedStoreId}`:(uid?`NAYAD_DATA_V3:${uid}`:'NAYAD_DATA_V2');
  };

  async function fetchStores(expectedUserId=userId()){
    const client=sb();if(!client)return [];
    if(!expectedUserId)return [];
    if(!await waitForSessionUser(client,expectedUserId))return [];
    let result=await client.rpc('get_my_stores');
    if(result.error)throw result.error;
    let rows=Array.isArray(result.data)?result.data:[];
    let ensured=null;
    if(!rows.some(row=>row?.role==='owner')){
      const made=await client.rpc('ensure_my_store');if(made.error)throw made.error;
      ensured=Array.isArray(made.data)?made.data[0]:made.data;
      result=await client.rpc('get_my_stores');
      if(result.error)throw result.error;
      rows=Array.isArray(result.data)?result.data:[];
    }
    /* Immediately after a session change the invoker-scoped list can be
       briefly empty. ensure_my_store is bound to auth.uid() and has already
       returned the verified user's owned store, so keep that result as a safe
       fallback instead of rejecting a valid login. */
    if(!rows.length&&ensured?.id)rows=[{id:ensured.id,name:ensured.name,role:'owner'}];
    if(rows.some(row=>row.user_id!=null&&String(row.user_id)!==String(expectedUserId)))return [];
    return normalizeStores(rows);
  }

  function renderBar(){
    const content=document.getElementById('content');
    if(!content)return;
    content.querySelector('.storeSwitcherBar')?.remove();
    if(typeof window.__nayadRefreshProfileMenu==='function')window.__nayadRefreshProfileMenu();
  }

  function showPicker(){
    if(typeof window.sheet!=='function')return;
    const trusted=trustedGlobalStores();
    if((initializedFor!==userId()||!stores.length)&&trusted)hydrateVerifiedStores(trusted,userId());
    const visibleStores=initializedFor===userId()&&runtimeBelongsTo()?stores:[];
    const rows=visibleStores.map(store=>`<button class="storePickerItem ${String(store.id)===String(window.__nayadActiveStoreId)?'active':''}" type="button" onclick="selectNayadStore('${esc(store.id)}')"><span class="storePickerAvatar">${esc(initial(store.name))}</span><span class="storePickerMeta"><b>${esc(store.name)}</b><span>${roleLabel(store.role)}</span></span><span class="storePickerCheck">✓</span></button>`).join('');
    window.sheet(`<div class="storePickerHeader"><h2>Дэлгүүр сонгох</h2><button class="storePickerClose" type="button" onclick="closeSheet()" aria-label="Хаах"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="storePickerHint">Та өөрийн болон хуваалцсан дэлгүүрүүдийн хооронд шилжиж болно.</div><div class="storePickerList">${rows||'<div class="card">Дэлгүүр олдсонгүй.</div>'}</div>`);
  }

  async function activateStore(storeId,options={}){
    const trusted=trustedGlobalStores();
    if((initializedFor!==userId()||!stores.length)&&trusted)hydrateVerifiedStores(trusted,userId());
    if(initializedFor!==userId()||!runtimeBelongsTo())return false;
    const next=stores.find(s=>String(s.id)===String(storeId));if(!next)return false;
    const changed=String(window.__nayadActiveStoreId||'')!==String(next.id);
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
      if(typeof window.__nayadWatchCloudStore==='function')await window.__nayadWatchCloudStore();
    }
    return true;
  }

  async function refreshStoresNow(options={}){
    const uid=await ensureCurrentUser();if(!uid)return [];
    const fetched=await fetchStores(uid);
    if(uid!==userId())return [];
    if(!fetched.length)return [];
    stores=fetched;initializedFor=uid;window.__nayadStores=stores;window.__nayadStoresUserId=uid;
    const requested=options.selectStoreId;
    const remembered=localStorage.getItem(ACTIVE_PREFIX+uid);
    const current=window.__nayadActiveStoreId;
    const selectedId=[requested,remembered,current].find(id=>id&&stores.some(s=>String(s.id)===String(id)))||stores[0]?.id;
    if(selectedId)await activateStore(selectedId,{sync:options.sync!==false,close:options.close});
    return stores;
  }

  function refreshStores(options={}){
    refreshQueue=refreshQueue.catch(()=>[]).then(async()=>{
      const expectedUserId=await ensureCurrentUser();
      if(!expectedUserId||expectedUserId!==userId())return [];
      return refreshStoresNow(options);
    });
    return refreshQueue;
  }

  async function prepareUserStore(expectedUserId=userId()){
    const currentUserId=await ensureCurrentUser();
    if(!expectedUserId)expectedUserId=currentUserId;
    if(!expectedUserId||String(expectedUserId)!==String(currentUserId))return false;
    const trusted=trustedGlobalStores(expectedUserId);
    if(active()&&trusted?.length){
      if(initializedFor!==expectedUserId||!stores.length)hydrateVerifiedStores(trusted,expectedUserId);
      if(initializedFor===expectedUserId&&stores.length&&active())return true;
    }
    await refreshStores({sync:false,close:false});
    return String(expectedUserId)===String(userId())&&Boolean(active());
  }

  async function selectStore(storeId){
    if(switching)return;switching=true;
    try{await activateStore(storeId,{sync:true,close:true});}
    catch(e){console.error('Store switch:',e);if(typeof window.toast==='function')window.toast('Дэлгүүр солиход алдаа гарлаа.');}
    finally{switching=false;}
  }

  async function getActiveStore(){
    const currentUserId=await ensureCurrentUser();
    if(!currentUserId)return null;
    const trusted=trustedGlobalStores(currentUserId);
    if(initializedFor!==currentUserId&&trusted)hydrateVerifiedStores(trusted,currentUserId);
    if(initializedFor===currentUserId&&runtimeBelongsTo(currentUserId)&&stores.length){
      /* Never return an active-store object left by another tab/session.
         Resolve both runtime fields from the authenticated store list. */
      const requestedId=window.__nayadActiveStoreId||'';
      const activeId=active()?.id||'';
      const verified=stores.find(item=>String(item.id)===String(requestedId))
        ||stores.find(item=>String(item.id)===String(activeId))
        ||stores[0];
      if(verified){
        window.__nayadActiveStore=verified;
        window.__nayadActiveStoreId=verified.id;
        if(activeKey())localStorage.setItem(activeKey(),verified.id);
        return verified;
      }
    }
    const externalPrepare=window.__nayadPrepareUserStore;
    if(typeof externalPrepare==='function'&&externalPrepare!==prepareUserStore){
      await externalPrepare(currentUserId);
      if(runtimeBelongsTo(currentUserId)&&active())return active();
    }
    await refreshStores({sync:false,close:false});
    return runtimeBelongsTo(currentUserId)?active():null;
  }

  const originalRender=window.render;
  if(typeof originalRender==='function')window.render=function(){const result=originalRender();renderBar();return result;};
  window.showNayadStorePicker=showPicker;
  window.selectNayadStore=selectStore;
  window.__nayadRefreshStores=refreshStores;
  window.__nayadGetActiveStore=getActiveStore;
  window.__nayadPrepareUserStore=prepareUserStore;
  window.__nayadHydrateVerifiedStores=hydrateVerifiedStores;
  window.__nayadClearStoreRuntime=clearRuntimeStoreState;

  /* Store initialization is intentionally NOT started from load/auth listeners.
     Every store resolution first reconciles window.__nayadUser with the current
     Supabase session. This keeps early cloud-sync callbacks from falling back to
     the previous account or to an identity-less ensure_my_store() call. */
})();
