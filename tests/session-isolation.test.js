const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const newUserId='new-user';
const previousUserId='previous-user';
const oldStoreId='tsendun-store';
const newStoreId='new-empty-store';
const sharedStoreId='shared-store';
let membershipRows=[{user_id:newUserId,id:sharedStoreId,role:'staff',created_at:'2026-08-18',name:'Shared store'}];
let ensureCalls=0;
let sessionChecks=0;
let keepMembershipEmptyAfterEnsure=false;
let renderedCompany='';
const values=new Map([
  [`NAYAD_DATA_V4:${newUserId}:${oldStoreId}`,JSON.stringify({companies:[{id:1,name:'TSENDUN DATA',invoices:[]}],payments:[]})]
]);
const content={firstChild:null,querySelector:()=>null,insertBefore(){}};
const app={classList:{contains:()=>false}};

const context={
  console,Intl,setTimeout:fn=>{fn();return 1;},clearTimeout(){},
  localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value))},
  document:{
    head:{insertAdjacentHTML(){}},
    getElementById:id=>id==='content'?content:id==='app'?app:null,
    createElement:()=>({className:'',innerHTML:''})
  }
};
context.window=context;
context.window.__nayadUser={id:newUserId};
context.window.__nayadActiveStore={id:oldStoreId,name:'tsendun store',role:'owner'};
context.window.__nayadActiveStoreId=oldStoreId;
context.window.__nayadStores=[{id:oldStoreId,name:'tsendun store',role:'owner'}];
context.window.__nayadStoresUserId=previousUserId;
context.window.addEventListener=()=>{};
context.window.closeSheet=()=>{};
context.window.nayadSupabase={
  auth:{getSession:async()=>{sessionChecks++;return {data:{session:{user:{id:newUserId}}},error:null}},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  rpc:async name=>{
    if(name==='get_my_stores')return {data:membershipRows,error:null};
    assert.equal(name,'ensure_my_store');ensureCalls++;
    if(!keepMembershipEmptyAfterEnsure)membershipRows=[{user_id:newUserId,id:newStoreId,role:'owner',created_at:'2026-08-18',name:'Namka store'},...membershipRows];
    return {data:[{id:newStoreId,name:'Namka store'}],error:null};
  }
};

vm.createContext(context);
context.capture=value=>{renderedCompany=value;};
vm.runInContext(`
  let data={companies:[{id:99,name:'VISIBLE OLD DATA',invoices:[]}],payments:[]};
  let selected=null;
  let page='home';
  function render(){capture(data.companies[0]?.name||'')}
`,context);
const root=path.resolve(__dirname,'..');
const indexHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
const oauthFix=fs.readFileSync(path.join(root,'oauth-fix.js'),'utf8');
vm.runInContext(fs.readFileSync(path.join(root,'app-state.js'),'utf8'),context,{filename:'app-state.js'});
vm.runInContext(fs.readFileSync(path.join(root,'store-switcher.js'),'utf8'),context,{filename:'store-switcher.js'});

(async()=>{
  assert.match(indexHtml,/waitForStorePreparation/,'the app must wait for store isolation before rendering');
  assert.match(indexHtml,/store-switcher\.js\?v=58[\s\S]*store-recovery\.js\?v=53[\s\S]*auth-guard\.js\?v=56/,'session recovery and auth guard must load directly after the store switcher');
  const phoneLogin=indexHtml.match(/async function phoneLogin\(\)\{.*?\}\nasync function registerUser/s)?.[0]||'';
  const registerUser=indexHtml.match(/async function registerUser\(\)\{.*?\}\nasync function googleLogin/s)?.[0]||'';
  assert.match(phoneLogin,/await showAuthenticatedApp\(\)/,'password login must prepare the authenticated store before opening the app');
  assert.doesNotMatch(phoneLogin,/classList\.remove\("hide"\);render\(\)/,'password login must never reveal stale cached app data directly');
  assert.match(registerUser,/await showAuthenticatedApp\(\)/,'an immediately authenticated registration must prepare its own store before opening the app');
  assert.doesNotMatch(registerUser,/classList\.remove\("hide"\);render\(\)/,'registration must never reveal stale cached app data directly');
  assert.doesNotMatch(oauthFix,/window\.__nayadUser=session\.user;\s*if\(typeof profileFromUser/,'OAuth must not hide an account change before profile isolation runs');
  const ready=await context.window.__nayadPrepareUserStore(newUserId);
  assert.equal(ready,true);
  assert.equal(sessionChecks,4,'store loading must reconcile and verify the Supabase session user');
  assert.equal(ensureCalls,1,'a user with only a shared membership must still receive an owned store');
  assert.equal(context.window.__nayadActiveStoreId,newStoreId,'the stale store from the previous account must be discarded');
  assert.equal(context.window.__nayadStoresUserId,newUserId,'the verified store list must be bound to the authenticated user');
  assert.ok(context.window.__nayadStores.some(store=>store.id===sharedStoreId),'the existing shared store must remain available');
  assert.equal(renderedCompany,'','a fresh account must render an empty store, never the previous account data');
  assert.equal(values.get(`NAYAD_ACTIVE_STORE:${newUserId}`),newStoreId);
  context.window.__nayadClearStoreRuntime();
  membershipRows=[{id:newStoreId,role:'owner',created_at:'2026-08-18',name:'Namka store'}];
  const withoutOptionalUserId=await context.window.__nayadPrepareUserStore(newUserId);
  assert.equal(withoutOptionalUserId,true,'a valid RPC response without the optional user_id field must be accepted');
  assert.equal(context.window.__nayadActiveStoreId,newStoreId);
  context.window.__nayadClearStoreRuntime();
  membershipRows=[];
  keepMembershipEmptyAfterEnsure=true;
  const withEnsuredFallback=await context.window.__nayadPrepareUserStore(newUserId);
  assert.equal(withEnsuredFallback,true,'a successful ensure_my_store response must open the store when the list is briefly empty');
  assert.equal(context.window.__nayadActiveStoreId,newStoreId);
  keepMembershipEmptyAfterEnsure=false;
  membershipRows=[{user_id:'different-session',id:'other-store',role:'owner',created_at:'2026-08-18',name:'Other store'}];
  context.window.__nayadClearStoreRuntime();
  const mismatched=await context.window.__nayadPrepareUserStore(newUserId);
  assert.equal(mismatched,false,'a store response for a different authenticated user must be rejected');
  assert.equal(context.window.__nayadActiveStoreId,null,'rejecting a mismatched session must also clear the previously active store');
  console.log('session-isolation: PASS — a recreated account opens a new empty store');
})().catch(error=>{console.error(error);process.exitCode=1;});
