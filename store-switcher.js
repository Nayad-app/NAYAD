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
  .storePickerMeta{min-width:0;flex:1}.storePickerMeta b{display:block;font-size:13px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.storePickerMeta>.storePickerRole{display:block;color:var(--muted);font-size:10px;margin-top:4px}.storePickerPlanRow{min-height:16px;margin-top:4px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}.storePickerPlan{display:inline-flex;align-items:center;gap:3px;width:max-content;padding:2px 7px;border-radius:999px;font-size:9px;line-height:1.25;font-weight:900}.storePickerPlan svg,.homeStorePlan svg{width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}.storePickerPlan.plus,.homeStorePlan{background:#F6C43B;color:#1D190D}.storePickerPlan.free{background:var(--surface-2);color:var(--muted)}.storePickerPlanEnd{color:var(--muted);font-size:9px;line-height:1.25}.homeStorePlan{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;padding:2px 6px;border-radius:999px;font-size:8px;line-height:1.2;font-weight:900}
  .storePickerCheck{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--yellow);font-size:13px;font-weight:900}.storePickerItem:not(.active) .storePickerCheck{visibility:hidden}
  .storePickerAdd{width:100%;margin-top:5px;padding:13px;border:1px dashed #d3a600;border-radius:16px;background:var(--yellow-soft);color:var(--text);font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px}.storePickerAdd span{width:24px;height:24px;border-radius:50%;background:var(--yellow);display:grid;place-items:center;font-size:18px;line-height:1}
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
  function normalizeSubscription(value){
    if(!value||typeof value!=='object')return null;
    return {plan_code:String(value.plan_code||''),status:String(value.status||''),current_period_end:value.current_period_end||null};
  }
  function hasActivePlus(store){
    const subscription=normalizeSubscription(store?.subscription);
    return Boolean(subscription?.status==='active'&&new Date(subscription.current_period_end).getTime()>Date.now());
  }
  function crownIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 4 4 4-7 4 7 4-4-2 10H6L4 8Z"/><path d="M7 21h10"/></svg>';}
  function subscriptionEndText(store){
    if(!hasActivePlus(store))return '';
    try{return new Intl.DateTimeFormat('mn-MN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(store.subscription.current_period_end));}
    catch(_error){return '';}
  }
  function pickerPlan(store){
    if(hasActivePlus(store)){
      const end=subscriptionEndText(store);
      return `<span class="storePickerPlanRow"><span class="storePickerPlan plus">${crownIcon()}Plus</span>${end?`<span class="storePickerPlanEnd">${esc(end)} хүртэл</span>`:''}</span>`;
    }
    return store?.subscription_checked?'<span class="storePickerPlanRow"><span class="storePickerPlan free">Үнэгүй</span></span>':'';
  }
  function homePlan(store){return hasActivePlus(store)?`<span class="homeStorePlan">${crownIcon()}Plus</span>`:'';}
  function isComplete(store){
    return typeof window.__nayadIsRegistrationComplete==='function'
      ?window.__nayadIsRegistrationComplete(store)
      :Boolean(store?.id&&store?.registration_completed_at);
  }
  function active(){
    const store=runtimeBelongsTo()?window.__nayadActiveStore||null:null;
    return isComplete(store)?store:null;
  }
  function roleLabel(role){return role==='owner'?'Эзэмшигч':'Гишүүн';}
  const PERMISSION_MODULES=['customers','invoices','payments','loans'];
  function normalizedPermissions(value,role=''){
    const hasExplicit=value&&typeof value==='object';
    const source=hasExplicit?value:(role==='owner'||role==='manager'
      ?{customers:'edit',invoices:'edit',payments:'edit',loans:'edit'}
      :role?{customers:'edit',invoices:'edit',payments:'edit',loans:'none'}:{});
    const result={};
    PERMISSION_MODULES.forEach(module=>{result[module]=['none','view','edit'].includes(source[module])?source[module]:'none';});
    if(result.payments==='edit'&&result.invoices==='none')result.invoices='view';
    if(result.customers==='none'&&(result.invoices!=='none'||result.payments!=='none'))result.customers='view';
    return result;
  }
  function can(module,action='view'){
    const store=active();
    if(!store||!PERMISSION_MODULES.includes(module))return false;
    if(store.role==='owner')return true;
    if(action==='owner'||action==='delete')return false;
    const level=normalizedPermissions(store.permissions,store.role)[module];
    return action==='edit'?level==='edit':level==='view'||level==='edit';
  }
  function sanitizeStoreState(value){
    const next=value&&typeof value==='object'?value:{companies:[],payments:[]};
    if(active()?.role==='owner')return next;
    if(!can('customers','view'))next.companies=[];
    else if(!can('invoices','view'))next.companies=(next.companies||[]).map(company=>({...company,invoices:[],debt:0}));
    if(!can('payments','view'))next.payments=[];
    return next;
  }
  function normalizeStores(rows){
    return (rows||[]).map(row=>({id:row.id,name:row.name||'NAYAD',role:row.role||'member',permissions:normalizedPermissions(row.permissions,row.role||'member'),created_at:row.created_at,operation_role:row.operation_role||'',business_type:row.business_type||'',entity_type:row.entity_type||'',registration_completed_at:row.registration_completed_at||null,subscription:normalizeSubscription(row.subscription),subscription_checked:Boolean(row.subscription_checked)})).filter(row=>row.id);
  }

  async function attachSubscriptions(rows){
    const normalized=normalizeStores(rows),client=sb(),ids=normalized.map(store=>store.id);
    if(!ids.length||!client?.from)return normalized;
    try{
      const query=client.from('store_subscriptions')?.select?.('store_id,plan_code,status,current_period_end');
      if(!query?.in)return normalized;
      const {data,error}=await query.in('store_id',ids);
      if(error)throw error;
      const byStore=new Map((data||[]).map(subscription=>[String(subscription.store_id),normalizeSubscription(subscription)]));
      return normalized.map(store=>({...store,subscription:byStore.get(String(store.id))||null,subscription_checked:true}));
    }catch(error){
      console.warn('Store subscription read:',error);
      return normalized;
    }
  }
  function clearRuntimeStoreState(){
    stores=[];
    initializedFor='';
    window.__nayadStores=[];
    window.__nayadStoresUserId='';
    window.__nayadActiveStore=null;
    window.__nayadActiveStoreId=null;
    window.__nayadPendingRegistration=null;
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
    stores=verified;
    initializedFor=expectedUserId;
    window.__nayadStores=stores;
    window.__nayadStoresUserId=expectedUserId;
    window.__nayadPendingRegistration=stores.find(store=>store.role==='owner'&&!isComplete(store))||null;
    const activeId=window.__nayadActiveStoreId||window.__nayadActiveStore?.id||'';
    const verifiedActive=stores.find(store=>isComplete(store)&&String(store.id)===String(activeId));
    if(verifiedActive){
      window.__nayadActiveStore=verifiedActive;
      window.__nayadActiveStoreId=verifiedActive.id;
    }else{
      window.__nayadActiveStore=null;
      window.__nayadActiveStoreId=null;
    }
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
    const missingRpc=result=>result.error&&(/PGRST202|42883|Could not find the function/i.test(String(result.error.code||'')+' '+String(result.error.message||'')));
    let result=await client.rpc('get_my_registrations');
    if(missingRpc(result))result=await client.rpc('get_my_stores_with_permissions');
    if(missingRpc(result))result=await client.rpc('get_my_stores');
    if(result.error)throw result.error;
    const rows=Array.isArray(result.data)?result.data:[];
    if(rows.some(row=>row.user_id!=null&&String(row.user_id)!==String(expectedUserId)))throw new Error('Store identity mismatch');
    return attachSubscriptions(rows);
  }

  function renderBar(){
    const content=document.getElementById('content');
    if(!content)return;
    content.querySelector('.storeSwitcherBar')?.remove();
    const activeLabel=content.querySelector('.homeActiveStore');
    if(activeLabel){
      activeLabel.querySelector('.homeStorePlan')?.remove();
      const badge=homePlan(active());
      if(badge)activeLabel.insertAdjacentHTML('beforeend',badge);
    }
    if(typeof window.__nayadRefreshProfileMenu==='function')window.__nayadRefreshProfileMenu();
  }

  function showPicker(){
    if(typeof window.sheet!=='function')return;
    const trusted=trustedGlobalStores();
    if((initializedFor!==userId()||!stores.length)&&trusted)hydrateVerifiedStores(trusted,userId());
    const visibleStores=initializedFor===userId()&&runtimeBelongsTo()?stores:[];
    const rows=visibleStores.map(store=>{
      const complete=isComplete(store),selected=complete&&String(store.id)===String(window.__nayadActiveStoreId);
      const action=complete?`selectNayadStore('${esc(store.id)}')`:`completeNayadRegistration('${esc(store.id)}')`;
      const status=complete?roleLabel(store.role):(store.role==='owner'?'Бүртгэлээ гүйцээх':'Эзэмшигчийн тохиргоо хүлээж байна');
      return `<button class="storePickerItem ${selected?'active':''}" type="button" onclick="${action}"><span class="storePickerAvatar">${esc(initial(store.name))}</span><span class="storePickerMeta"><b>${esc(store.name)}</b><span class="storePickerRole">${status}</span>${complete?pickerPlan(store):''}</span><span class="storePickerCheck">✓</span></button>`;
    }).join('');
    window.sheet(`<div class="storePickerHeader"><h2>Бүртгэл сонгох</h2><button class="storePickerClose" type="button" onclick="closeSheet()" aria-label="Хаах"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="storePickerHint">Та өөрийн болон хуваалцсан бүртгэлүүдийн хооронд шилжиж болно.</div><div class="storePickerList">${rows||'<div class="card">Бүртгэл олдсонгүй.</div>'}<button class="storePickerAdd" type="button" onclick="showNayadStoreCreate()"><span>+</span>Шинэ бүртгэл нэмэх</button></div>`);
  }

  function showCreateStore(){
    if(typeof window.showNayadRegistrationOnboarding!=='function')return window.toast?.('Бүртгэлийн хэсэг ачаалж байна. Дахин оролдоно уу.');
    const pending=stores.find(store=>store.role==='owner'&&!isComplete(store));
    if(pending)return completeRegistration(pending.id,false);
    if(typeof window.closeSheet==='function')window.closeSheet();
    window.showNayadRegistrationOnboarding({initial:false});
  }

  function completeRegistration(storeId,initial=false){
    const target=stores.find(store=>String(store.id)===String(storeId)&&!isComplete(store));
    if(!target)return false;
    if(target.role!=='owner'){
      window.toast?.('Энэ бүртгэлийг эзэмшигч нь гүйцээх шаардлагатай.');
      return false;
    }
    window.__nayadPendingRegistration=target;
    if(typeof window.closeSheet==='function')window.closeSheet();
    if(typeof window.showNayadRegistrationOnboarding==='function'){
      window.showNayadRegistrationOnboarding({initial:Boolean(initial),existingRegistration:target});
      return true;
    }
    return false;
  }

  async function activateStore(storeId,options={}){
    const trusted=trustedGlobalStores();
    if((initializedFor!==userId()||!stores.length)&&trusted)hydrateVerifiedStores(trusted,userId());
    if(initializedFor!==userId()||!runtimeBelongsTo())return false;
    const next=stores.find(s=>String(s.id)===String(storeId));if(!next)return false;
    if(!isComplete(next))return completeRegistration(next.id,false);
    const changed=String(window.__nayadActiveStoreId||'')!==String(next.id);
    const previous=active();
    const permissionsChanged=!changed&&previous&&(
      previous.role!==next.role||JSON.stringify(normalizedPermissions(previous.permissions,previous.role))!==JSON.stringify(normalizedPermissions(next.permissions,next.role))
    );
    if(changed&&options.sync!==false&&window.__nayadCloudSyncQueue){
      await window.__nayadCloudSyncQueue.catch(()=>{});
    }
    window.__nayadActiveStoreId=next.id;window.__nayadActiveStore=next;
    if(activeKey())localStorage.setItem(activeKey(),next.id);
    if((changed||permissionsChanged)&&window.__nayadState){
      const nextData=sanitizeStoreState(window.__nayadState.read());
      window.__nayadState.commit(nextData,{render:false});
      try{if(changed&&typeof page!=='undefined')page='home';if(typeof selected!=='undefined')selected=null;}catch(_){}
    }
    if(typeof window.closeSheet==='function'&&options.close!==false)window.closeSheet();
    if(typeof window.render==='function')window.render();else renderBar();
    if((changed||permissionsChanged)&&options.sync!==false){
      if(typeof window.__nayadSyncInvoices==='function')await window.__nayadSyncInvoices();
      if(typeof window.__nayadSyncSuppliers==='function')await window.__nayadSyncSuppliers();
      if(typeof window.__nayadWatchCloudStore==='function')await window.__nayadWatchCloudStore();
    }
    return true;
  }

  async function refreshStoresNow(options={}){
    const uid=await ensureCurrentUser();if(!uid)return [];
    const previousStoreIds=runtimeBelongsTo(uid)?stores.map(store=>String(store.id)):[];
    const fetched=await fetchStores(uid);
    if(uid!==userId())return [];
    if(!fetched.length){
      stores=[];initializedFor=uid;window.__nayadStores=[];window.__nayadStoresUserId=uid;
      window.__nayadActiveStore=null;window.__nayadActiveStoreId=null;
      window.__nayadPendingRegistration=null;
      localStorage.removeItem(ACTIVE_PREFIX+uid);
      return [];
    }
    stores=fetched;initializedFor=uid;window.__nayadStores=stores;window.__nayadStoresUserId=uid;
    window.__nayadPendingRegistration=stores.find(store=>store.role==='owner'&&!isComplete(store))||null;
    const nextStoreIds=new Set(stores.map(store=>String(store.id)));
    previousStoreIds.filter(id=>!nextStoreIds.has(id)).forEach(id=>localStorage.removeItem(`${DATA_PREFIX}${uid}:${id}`));
    const requested=options.selectStoreId;
    const remembered=localStorage.getItem(ACTIVE_PREFIX+uid);
    const current=window.__nayadActiveStoreId;
    const completed=stores.filter(isComplete);
    const selectedId=[requested,remembered,current].find(id=>id&&completed.some(s=>String(s.id)===String(id)))||completed[0]?.id;
    if(selectedId)await activateStore(selectedId,{sync:options.sync!==false,close:options.close});
    else{
      window.__nayadActiveStore=null;window.__nayadActiveStoreId=null;
      localStorage.removeItem(ACTIVE_PREFIX+uid);
    }
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
    const available=await refreshStores({sync:false,close:false});
    if(String(expectedUserId)!==String(userId()))return false;
    return available.length&&active()?true:'needs_registration';
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
      const verified=stores.find(item=>isComplete(item)&&String(item.id)===String(requestedId))
        ||stores.find(item=>isComplete(item)&&String(item.id)===String(activeId))
        ||stores.find(isComplete);
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

  function applyStoreSubscription(storeId,value){
    const id=String(storeId||'');if(!id)return false;
    let matched=false;
    stores=stores.map(store=>{
      if(String(store.id)!==id)return store;
      matched=true;
      return {...store,subscription:normalizeSubscription(value),subscription_checked:true};
    });
    if(!matched)return false;
    window.__nayadStores=stores;
    if(runtimeBelongsTo()&&String(window.__nayadActiveStoreId||'')===id){
      window.__nayadActiveStore=stores.find(store=>String(store.id)===id)||window.__nayadActiveStore;
    }
    return true;
  }

  const originalRender=window.render;
  if(typeof originalRender==='function')window.render=function(){const result=originalRender();renderBar();return result;};
  window.showNayadStorePicker=showPicker;
  window.showNayadStoreCreate=showCreateStore;
  window.selectNayadStore=selectStore;
  window.completeNayadRegistration=completeRegistration;
  window.__nayadRefreshStores=refreshStores;
  window.__nayadGetActiveStore=getActiveStore;
  window.__nayadPrepareUserStore=prepareUserStore;
  window.__nayadHydrateVerifiedStores=hydrateVerifiedStores;
  window.__nayadClearStoreRuntime=clearRuntimeStoreState;
  window.__nayadCan=can;
  window.__nayadNormalizePermissions=normalizedPermissions;
  window.__nayadStoreHasPlus=hasActivePlus;
  window.__nayadStorePlanBadge=homePlan;
  window.__nayadApplyStoreSubscription=applyStoreSubscription;

  /* Store initialization is intentionally NOT started from load/auth listeners.
     Every store resolution first reconciles window.__nayadUser with the current
     Supabase session. This keeps early cloud-sync callbacks from falling back to
     the previous account or to an identity-less ensure_my_store() call. */
})();
