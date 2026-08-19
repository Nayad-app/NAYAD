/* NAYAD store/session recovery — binds every store RPC to the exact current session JWT. */
(function(){
  const ACTIVE_PREFIX='NAYAD_ACTIVE_STORE:';
  const PROJECT_URL=(typeof SUPABASE_URL!=='undefined'&&SUPABASE_URL)||'https://kjgtmxcxchjevzoxwqzr.supabase.co';
  const PUBLIC_KEY=(typeof SUPABASE_PUBLISHABLE_KEY!=='undefined'&&SUPABASE_PUBLISHABLE_KEY)||'';
  let preparePromise=null;
  let prepareUserId='';

  function client(){return window.nayadSupabase||window.sb||null;}
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  function jwtSub(token){
    try{
      const part=String(token||'').split('.')[1]||'';
      const padded=part.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-part.length%4)%4);
      return JSON.parse(atob(padded))?.sub||'';
    }catch(_){return '';}
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
    if(typeof window.__nayadHydrateVerifiedStores==='function'){
      window.__nayadHydrateVerifiedStores(stores,expectedUserId);
    }
    return true;
  }
  async function rpcWithExactToken(name,token){
    const response=await fetch(PROJECT_URL+'/rest/v1/rpc/'+encodeURIComponent(name),{
      method:'POST',
      cache:'no-store',
      headers:{
        'Content-Type':'application/json',
        'apikey':PUBLIC_KEY,
        'Authorization':'Bearer '+token
      },
      body:'{}'
    });
    const text=await response.text();
    let payload=null;
    try{payload=text?JSON.parse(text):null;}catch(_){payload=null;}
    if(!response.ok){
      const message=payload?.message||payload?.error_description||text||('HTTP '+response.status);
      throw new Error(message);
    }
    return payload;
  }

  async function prepareVerifiedStore(expectedUserId){
    const c=client();
    if(!c||!expectedUserId)return false;
    if(String(window.__nayadUser?.id||'')!==String(expectedUserId))return false;

    let ensured=false;
    for(let attempt=0;attempt<10;attempt++){
      if(String(window.__nayadUser?.id||'')!==String(expectedUserId))return false;

      try{
        const {data,error}=await c.auth.getSession();
        if(error)throw error;
        const session=data?.session||null;
        const sessionUserId=session?.user?.id||'';
        const accessToken=session?.access_token||'';
        const tokenUserId=jwtSub(accessToken);

        if(String(sessionUserId)!==String(expectedUserId)||String(tokenUserId)!==String(expectedUserId)||!accessToken){
          await sleep(100+attempt*60);
          continue;
        }

        const rows=(await rpcWithExactToken('get_my_stores',accessToken))||[];
        if(rows.length){
          if(!rows.every(row=>String(row?.user_id||'')===String(expectedUserId))){
            console.warn('Store recovery rejected mismatched RPC identity.');
            await sleep(120+attempt*60);
            continue;
          }
          return activateExpectedStore(expectedUserId,rows);
        }

        if(!ensured&&attempt>=1){
          await rpcWithExactToken('ensure_my_store',accessToken);
          ensured=true;
        }
      }catch(error){
        console.warn('Store recovery exact-token RPC:',error);
      }
      await sleep(120+attempt*60);
    }
    return false;
  }

  window.__nayadPrepareUserStore=function(expectedUserId=window.__nayadUser?.id||''){
    if(!expectedUserId)return Promise.resolve(false);
    if(preparePromise&&prepareUserId===expectedUserId)return preparePromise;
    prepareUserId=expectedUserId;
    preparePromise=prepareVerifiedStore(expectedUserId);
    return preparePromise.finally(()=>{
      if(prepareUserId===expectedUserId){preparePromise=null;prepareUserId='';}
    });
  };
})();
