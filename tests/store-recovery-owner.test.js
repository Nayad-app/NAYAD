const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const userId='user-shared-only';
const previousUserId='previous-user';
const sharedStoreId='shared-store';
const tokenPayload=Buffer.from(JSON.stringify({sub:userId})).toString('base64url');
const accessToken=`header.${tokenPayload}.signature`;
let ensureCalls=0;
let listCalls=0;
let rows=[{user_id:userId,id:sharedStoreId,name:'Shared store',role:'staff',registration_completed_at:'2026-08-18T00:00:00Z'}];
const values=new Map();
const content={firstChild:null,querySelector:()=>null,insertBefore(){}};
const app={classList:{contains:()=>false}};

const context={
  console,Intl,URL,Response,Headers,atob,
  setTimeout:fn=>{fn();return 1;},clearTimeout(){},
  localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)},
  document:{
    head:{insertAdjacentHTML(){}},
    getElementById:id=>id==='content'?content:id==='app'?app:null,
    createElement:()=>({className:'',innerHTML:''})
  },
  fetch:async url=>{
    if(String(url).endsWith('/rpc/get_my_registrations')){
      listCalls++;
      return new Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }
};
context.window=context;
context.window.__nayadUser={id:userId};
context.window.__nayadStores=[{id:'stale-store',name:'Stale store',role:'owner'}];
context.window.__nayadStoresUserId=previousUserId;
context.window.__nayadActiveStore={id:'stale-store',name:'Stale store',role:'owner'};
context.window.__nayadActiveStoreId='stale-store';
context.window.addEventListener=()=>{};
context.window.nayadSupabase={
  auth:{getSession:async()=>({data:{session:{user:{id:userId},access_token:accessToken}},error:null})},
  rpc:async()=>{throw new Error('store recovery must use the exact-token HTTP path');}
};

vm.createContext(context);
const root=path.resolve(__dirname,'..');
vm.runInContext(fs.readFileSync(path.join(root,'store-switcher.js'),'utf8'),context,{filename:'store-switcher.js'});
vm.runInContext(fs.readFileSync(path.join(root,'store-recovery.js'),'utf8'),context,{filename:'store-recovery.js'});

(async()=>{
  const ready=await context.window.__nayadPrepareUserStore(userId);
  assert.equal(ready,true);
  assert.equal(ensureCalls,0,'store recovery must not create a hidden default registration');
  assert.equal(listCalls,1,'store recovery must read the exact-token registration list once');
  assert.equal(context.window.__nayadStoresUserId,userId,'the recovered list must be tagged with the authenticated user');
  assert.equal(context.window.__nayadActiveStoreId,sharedStoreId,'the stale previous-user store must never remain active');
  assert.deepEqual(
    Array.from(context.window.__nayadStores,store=>store.id),
    [sharedStoreId],
    'the shared registration must remain available without creating another one'
  );
  rows=[];
  context.window.__nayadClearStoreRuntime();
  const onboardingRequired=await context.window.__nayadPrepareUserStore(userId);
  assert.equal(onboardingRequired,'needs_registration','an account with no registration must open onboarding');
  assert.equal(ensureCalls,0);
  console.log('store-recovery-owner: PASS — shared-only users keep their shared registration without a hidden default');
})().catch(error=>{console.error(error);process.exitCode=1;});
