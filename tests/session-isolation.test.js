const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const newUserId='new-user';
const oldStoreId='tsendun-store';
const newStoreId='new-empty-store';
let membershipRows=[];
let ensureCalls=0;
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
context.window.addEventListener=()=>{};
context.window.closeSheet=()=>{};
context.window.nayadSupabase={
  auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  rpc:async name=>{
    if(name==='get_my_stores')return {data:membershipRows,error:null};
    assert.equal(name,'ensure_my_store');ensureCalls++;
    membershipRows=[{user_id:newUserId,id:newStoreId,role:'owner',created_at:'2026-08-18',name:'Namka store'}];
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
  const phoneLogin=indexHtml.match(/async function phoneLogin\(\)\{.*?\}\nasync function registerUser/s)?.[0]||'';
  const registerUser=indexHtml.match(/async function registerUser\(\)\{.*?\}\nasync function googleLogin/s)?.[0]||'';
  assert.match(phoneLogin,/await showAuthenticatedApp\(\)/,'password login must prepare the authenticated store before opening the app');
  assert.doesNotMatch(phoneLogin,/classList\.remove\("hide"\);render\(\)/,'password login must never reveal stale cached app data directly');
  assert.match(registerUser,/await showAuthenticatedApp\(\)/,'an immediately authenticated registration must prepare its own store before opening the app');
  assert.doesNotMatch(registerUser,/classList\.remove\("hide"\);render\(\)/,'registration must never reveal stale cached app data directly');
  assert.doesNotMatch(oauthFix,/window\.__nayadUser=session\.user;\s*if\(typeof profileFromUser/,'OAuth must not hide an account change before profile isolation runs');
  const ready=await context.window.__nayadPrepareUserStore(newUserId);
  assert.equal(ready,true);
  assert.equal(ensureCalls,1,'a user without membership must receive a new store');
  assert.equal(context.window.__nayadActiveStoreId,newStoreId,'the stale store from the previous account must be discarded');
  assert.equal(renderedCompany,'','a fresh account must render an empty store, never the previous account data');
  assert.equal(values.get(`NAYAD_ACTIVE_STORE:${newUserId}`),newStoreId);
  membershipRows=[{user_id:'different-session',id:'other-store',role:'owner',created_at:'2026-08-18',name:'Other store'}];
  const mismatched=await context.window.__nayadPrepareUserStore(newUserId);
  assert.equal(mismatched,false,'a store response for a different authenticated user must be rejected');
  assert.equal(context.window.__nayadActiveStoreId,null,'rejecting a mismatched session must also clear the previously active store');
  console.log('session-isolation: PASS — a recreated account opens a new empty store');
})().catch(error=>{console.error(error);process.exitCode=1;});
