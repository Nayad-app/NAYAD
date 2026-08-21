const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const firstUserId='user-a';
const nextUserId='user-b';
const storeId='store-a';
const token=userId=>`header.${Buffer.from(JSON.stringify({sub:userId})).toString('base64url')}.signature`;
let currentUserId=firstUserId;
let sessionReads=0;

const context={
  console,Intl,URL,Response,Headers,atob,
  setTimeout:fn=>{fn();return 1;},clearTimeout(){},
  localStorage:{getItem:()=>null,setItem(){}},
  document:{
    head:{insertAdjacentHTML(){}},
    getElementById:()=>null,
    createElement:()=>({className:'',innerHTML:''})
  },
  fetch:async url=>{
    assert.ok(String(url).endsWith('/rpc/get_my_stores'));
    currentUserId=nextUserId;
    return new Response(JSON.stringify([{user_id:firstUserId,id:storeId,name:'A store',role:'owner'}]),{
      status:200,headers:{'content-type':'application/json'}
    });
  }
};
context.window=context;
context.window.__nayadUser={id:firstUserId};
context.window.__nayadStores=[];
context.window.__nayadStoresUserId='';
context.window.__nayadActiveStore=null;
context.window.__nayadActiveStoreId=null;
context.window.addEventListener=()=>{};
context.window.nayadSupabase={
  auth:{getSession:async()=>{
    sessionReads++;
    return {data:{session:{user:{id:currentUserId},access_token:token(currentUserId)}},error:null};
  }}
};

vm.createContext(context);
const root=path.resolve(__dirname,'..');
vm.runInContext(fs.readFileSync(path.join(root,'store-switcher.js'),'utf8'),context,{filename:'store-switcher.js'});
vm.runInContext(fs.readFileSync(path.join(root,'store-recovery.js'),'utf8'),context,{filename:'store-recovery.js'});

(async()=>{
  const ready=await context.window.__nayadPrepareUserStore(firstUserId);
  assert.equal(ready,false,'a late response from the signed-out account must be discarded');
  assert.ok(sessionReads>=2,'the current session must be re-read after the store RPC');
  assert.notEqual(context.window.__nayadStoresUserId,firstUserId);
  assert.notEqual(context.window.__nayadActiveStoreId,storeId);
  assert.equal(context.window.__nayadStores.length,0,'account A stores must never enter account B runtime');
  console.log('store-recovery-race: PASS — a late account-A response cannot overwrite account B');
})().catch(error=>{console.error(error);process.exitCode=1;});
