/* NAYAD store/session recovery — waits until PostgREST and Auth agree on the same user. */
(function(){
  const ACTIVE_PREFIX='NAYAD_ACTIVE_STORE:';
  let preparePromise=null;
  let prepareUserId='';

  function client(){return window.nayadSupabase||window.sb||null;}
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  function rowUserMatches(row,expectedUserId){
    return row?.user_id==null||String(row.user_id)===String(expectedUserId);
  }
  function normalizeRows(rows){
    return (rows||[]).map(row=>({
      id:row.id,
      name:row.name||'NAYAD',
      role:row.role||'member',
      created_at:row.created_at
    })).filter(row=>row.id);
  }
  function activateExpectedStore(expectedUserId,rows){
    if(String(window.__nayadUser?.id||'')!==String(expectedUserId))return false;
    const stores=normalizeRows(rows);
    if(!stores.length)return false;
    const remembered=localStorage.getItem(ACTIVE_PREFIX+expectedUserId);
    const current=window.__nayadActiveStoreId;
    const selectedId=[remembered,current].find(id=>id&&stores.some(store=>String(store.id)===String(id)))||stores[0].id;
    const selected=stores.find(store=>String(store.id)===String(selectedId))||stores[0];
    window.__nayadStores=stores;
    window.__nayadActiveStoreId=selected.id;
    window.__nayadActiveStore=selected;
    localStorage.setItem(ACTIVE_PREFIX+expectedUserId,selected.id);
    return true;
  }

  async function prepareVerifiedStore(expectedUserId){
    const c=client();
    if(!c||!expectedUserId)return false;
    if(String(window.__nayadUser?.id||'')!==String(expectedUserId))return false;

    let ensured=false;
    for(let attempt=0;attempt<18;attempt++){
      if(String(window.__nayadUser?.id||'')!==String(expectedUserId))return false;

      let sessionUserId='';
      try{
        const {data,error}=await c.auth.getSession();
        if(error)throw error;
        sessionUserId=data?.session?.user?.id||'';
      }catch(error){
        console.warn('Store recovery session:',error);
      }
      if(String(sessionUserId)!==String(expectedUserId)){
        await sleep(Math.min(80+attempt*25,250));
        continue;
      }

      try{
        const result=await c.rpc('get_my_stores');
        if(result.error)throw result.error;
        const rows=result.data||[];

        /* getSession() can already expose the new user while PostgREST still sends
           the previous access token for a very short window. The RPC returns its
           auth.uid() as user_id, so never accept rows from another account. */
        if(rows.length&&rows.every(row=>rowUserMatches(row,expectedUserId))){
          return activateExpectedStore(expectedUserId,rows);
        }
        if(rows.length&&rows.some(row=>!rowUserMatches(row,expectedUserId))){
          await sleep(Math.min(90+attempt*30,280));
          continue;
        }

        /* Only provision after Auth + PostgREST have repeatedly agreed on the
           expected account and that account truly has no visible store. */
        if(!rows.length&&attempt>=3&&!ensured){
          const made=await c.rpc('ensure_my_store');
          if(made.error)throw made.error;
          ensured=true;
        }
      }catch(error){
        console.warn('Store recovery RPC:',error);
      }
      await sleep(Math.min(90+attempt*30,280));
    }
    return false;
  }

  const originalPrepare=window.__nayadPrepareUserStore;
  window.__nayadPrepareUserStore=function(expectedUserId=window.__nayadUser?.id||''){
    if(!expectedUserId)return Promise.resolve(false);
    if(preparePromise&&prepareUserId===expectedUserId)return preparePromise;
    prepareUserId=expectedUserId;
    preparePromise=(async()=>{
      const verified=await prepareVerifiedStore(expectedUserId);
      if(verified)return true;
      if(typeof originalPrepare==='function'){
        try{return Boolean(await originalPrepare(expectedUserId));}
        catch(error){console.warn('Original store prepare fallback:',error);}
      }
      return false;
    })();
    return preparePromise.finally(()=>{
      if(prepareUserId===expectedUserId){preparePromise=null;prepareUserId='';}
    });
  };
})();
