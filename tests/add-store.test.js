const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'store-switcher.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260909095138_add_secure_multi_store_creation.sql'),'utf8');

test('store picker exposes the add-store flow',()=>{
  assert.match(source,/Шинэ дэлгүүр нэмэх/);
  assert.match(source,/id="newStoreName"/);
  assert.match(source,/id="newStoreBusinessType"/);
  assert.match(source,/rpc\('create_my_store',\{p_name:name,p_business_type:businessType\}\)/);
  assert.match(source,/refreshStores\(\{selectStoreId:created\.id,sync:true,close:true\}\)/);
});

test('store creation RPC is scoped to the authenticated caller',()=>{
  assert.match(migration,/v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration,/insert into public\.store_members\(store_id, user_id, role\)[\s\S]*values \(v_store_id, v_user_id, 'owner'\)/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/A store with this name already exists/);
  assert.match(migration,/security definer[\s\S]*set search_path = ''/i);
});

test('privileged helper is hidden while the public RPC is authenticated-only',()=>{
  assert.match(migration,/revoke all on function private\.create_my_store_impl\(text, text\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration,/revoke all on function public\.create_my_store\(text, text\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration,/grant execute on function public\.create_my_store\(text, text\)[\s\S]*to authenticated/);
});

test('a created store becomes the active store without mixing the previous store data',async()=>{
  const userId='user-1';
  const oldStore={id:'store-1',name:'NAYAD',role:'owner'};
  const newStore={id:'store-2',name:'NAYAD салбар 2',role:'owner'};
  const values=new Map([[`NAYAD_ACTIVE_STORE:${userId}`,oldStore.id]]);
  const rpcCalls=[];
  const notices=[];
  const fields={
    newStoreName:{value:newStore.name},
    newStoreBusinessType:{value:'Жижиглэн худалдаа'},
    createStoreButton:{disabled:false,textContent:'НЭМЭХ'}
  };
  const context={
    console,
    setTimeout:fn=>{fn();return 1;},
    clearTimeout(){},
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value))},
    document:{
      head:{insertAdjacentHTML(){}},
      getElementById:id=>fields[id]||null
    }
  };
  context.window=context;
  context.window.__nayadUser={id:userId};
  context.window.__nayadStores=[oldStore];
  context.window.__nayadStoresUserId=userId;
  context.window.__nayadActiveStore=oldStore;
  context.window.__nayadActiveStoreId=oldStore.id;
  context.window.closeSheet=()=>{};
  context.window.render=()=>{};
  context.window.toast=message=>notices.push(message);
  context.window.nayadSupabase={
    auth:{getSession:async()=>({data:{session:{user:{id:userId}}},error:null})},
    rpc:async(name,args)=>{
      rpcCalls.push({name,args});
      if(name==='create_my_store')return {data:newStore,error:null};
      if(name==='get_my_stores_with_permissions')return {data:null,error:{code:'PGRST202',message:'Could not find the function'}};
      if(name==='get_my_stores')return {data:[oldStore,newStore],error:null};
      throw new Error(`Unexpected RPC: ${name}`);
    }
  };

  vm.createContext(context);
  vm.runInContext(source,context,{filename:'store-switcher.js'});
  await context.window.createNayadStore();

  assert.equal(rpcCalls[0].name,'create_my_store');
  assert.equal(rpcCalls[0].args.p_name,newStore.name);
  assert.equal(rpcCalls[0].args.p_business_type,'Жижиглэн худалдаа');
  assert.equal(context.window.__nayadActiveStoreId,newStore.id);
  assert.equal(values.get(`NAYAD_ACTIVE_STORE:${userId}`),newStore.id);
  assert.match(notices.at(-1),/амжилттай нэмэгдлээ/);
});
