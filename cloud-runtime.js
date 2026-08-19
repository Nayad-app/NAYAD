/* NAYAD cloud runtime v54 — one authenticated store owns cloud sync. */
(function(){
  if(window.__nayadCloudRuntimeV54)return;
  window.__nayadCloudRuntimeV54=true;

  let syncPromise=null;
  let syncKey='';
  let lastCompletedKey='';
  let lastCompletedAt=0;

  function client(){return window.nayadSupabase||window.sb||null;}

  async function currentContext(){
    const c=client();
    if(!c?.auth?.getSession)return null;
    const first=await c.auth.getSession();
    if(first.error)throw first.error;
    const user=first.data?.session?.user||null;
    if(!user?.id)return null;

    if(String(window.__nayadUser?.id||'')!==String(user.id)){
      if(typeof window.profileFromUser==='function')window.profileFromUser(user);
      else window.__nayadUser=user;
    }

    let store=window.__nayadActiveStore||null;
    if(!store?.id&&typeof window.__nayadGetActiveStore==='function'){
      store=await window.__nayadGetActiveStore();
    }
    if(!store?.id)return null;

    const second=await c.auth.getSession();
    if(second.error)throw second.error;
    const verifiedUser=second.data?.session?.user||null;
    if(!verifiedUser?.id||String(verifiedUser.id)!==String(user.id))return null;
    if(String(window.__nayadUser?.id||'')!==String(verifiedUser.id))return null;
    if(String(window.__nayadActiveStoreId||'')!==String(store.id))return null;

    return {userId:verifiedUser.id,storeId:store.id};
  }

  async function sameContext(expected){
    const now=await currentContext();
    return Boolean(now&&expected&&String(now.userId)===String(expected.userId)&&String(now.storeId)===String(expected.storeId));
  }

  window.__nayadStartCloudSync=async function(options={}){
    const context=await currentContext();
    if(!context)return false;
    const key=context.userId+':'+context.storeId;
    const force=options.force===true;

    if(syncPromise&&syncKey===key)return syncPromise;
    if(!force&&lastCompletedKey===key&&Date.now()-lastCompletedAt<3000)return true;

    syncKey=key;
    syncPromise=(async()=>{
      if(!await sameContext(context))return false;
      if(typeof window.__nayadSyncInvoices==='function')await window.__nayadSyncInvoices();
      if(!await sameContext(context))return false;
      if(typeof window.__nayadSyncSuppliers==='function')await window.__nayadSyncSuppliers();
      if(!await sameContext(context))return false;
      lastCompletedKey=key;
      lastCompletedAt=Date.now();
      return true;
    })().catch(error=>{
      console.warn('NAYAD centralized cloud sync:',options.reason||'unknown',error);
      return false;
    });

    try{return await syncPromise;}
    finally{
      if(syncKey===key){syncPromise=null;syncKey='';}
    }
  };

  function request(reason){
    if(document.visibilityState==='hidden')return;
    window.__nayadStartCloudSync({reason}).catch(()=>{});
  }
  window.addEventListener('pageshow',event=>{if(event.persisted)setTimeout(()=>request('bfcache'),250);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>request('visible'),250);});
})();
