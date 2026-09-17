const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const registrationPath=path.join(root,'registration-delete.js');
const edgePath=path.join(root,'supabase','functions','delete-registration','index.ts');
const migrationDir=path.join(root,'supabase','migrations');

assert.ok(fs.existsSync(registrationPath),'registration-delete.js must contain the active-registration deletion UI');
assert.ok(fs.existsSync(edgePath),'delete-registration Edge Function source must be versioned with the app');
const migrationFiles=fs.readdirSync(migrationDir).filter(file=>/delete.*registration.*\.sql$/i.test(file));
assert.ok(migrationFiles.length,'a delete_registration migration must be committed');

const source=fs.readFileSync(registrationPath,'utf8');
const edge=fs.readFileSync(edgePath,'utf8');
const migration=migrationFiles.map(file=>fs.readFileSync(path.join(migrationDir,file),'utf8')).join('\n');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');

// The approved action deletes the selected registration, not the signed-in account.
assert.match(source,/showDeleteRegistrationConfirm/);
assert.match(source,/deleteActiveRegistration/);
assert.match(source,/\/functions\/v1\/delete-registration/);
assert.match(source,/JSON\.stringify\(\{\s*store_id\s*:[^,}]+,\s*confirmation(?:\s*:[^,}]+)?\s*\}\)/,'the browser must send only the selected registration and confirmation');
assert.match(source,/бүгд/,'the approved warning must use the correctly written word “бүгд”');
assert.doesNotMatch(source,/бүрмөсөн/,'the superseded word must not remain in the registration warning');
assert.doesNotMatch(source,/\/functions\/v1\/delete-account|deleteMyAccount|signOut\s*\(|profileFromUser\(null\)/,'registration deletion must not become account deletion');

const profileStart=index.indexOf('async function showProfileDetails(){');
const profileEnd=index.indexOf('async function saveProfileDetails()',profileStart);
assert.ok(profileStart>=0&&profileEnd>profileStart,'profile settings source must be present');
const profileBlock=index.slice(profileStart,profileEnd);
assert.match(profileBlock,/showDeleteRegistrationConfirm\(\)/,'profile settings must expose active-registration deletion');
assert.match(profileBlock,/бүртгэл(?:ийг)? устгах/i);
assert.doesNotMatch(profileBlock,/showDeleteAccountConfirm\(\)/,'the known-broken whole-account endpoint must not remain exposed beside registration deletion');
const registrationControlAt=profileBlock.indexOf('showDeleteRegistrationConfirm()');
assert.match(profileBlock.slice(Math.max(0,registrationControlAt-900),registrationControlAt),/isOwner\s*\?/,'only an owner may see the registration delete control');

// The database operation is one hardened, caller-bound transaction.
assert.match(migration,/create\s+or\s+replace\s+function\s+private\.delete_my_registration_impl\s*\(/i);
assert.match(migration,/create\s+or\s+replace\s+function\s+public\.delete_my_registration\s*\(/i);
assert.match(migration,/security\s+definer\s+set\s+search_path\s*=\s*''/i,'the privileged implementation must use a fixed empty search path');
assert.match(migration,/auth\.uid\s*\(\s*\)/i,'authorization must come from the caller JWT');
assert.match(migration,/p_confirmation[\s\S]{0,600}'УСТГАХ'/i,'the server must independently verify the destructive confirmation');
assert.match(migration,/where\s+s\.id\s*=\s*p_store_id/i);
assert.match(migration,/sm\.user_id\s*=\s*v_user_id/i);
assert.match(migration,/sm\.role\s*=\s*'owner'|v_role\s*(?:<>|!=)\s*'owner'/i,'managers and shared members must never delete a registration');
for(const table of ['suppliers','invoices','payments','payment_allocations','loans','qpay_orders']){
  assert.match(migration,new RegExp(`from\\s+public\\.${table}[\\s\\S]{0,500}for\\s+update`,'i'),`${table} must be locked before the cross-registration preflight`);
}
assert.match(migration,/delete\s+from\s+public\.invoice_images/i,'invoice image metadata has no FK and must be explicitly removed');
assert.match(migration,/from\s+public\.invoices\s+i[\s\S]*join\s+public\.suppliers\s+s[\s\S]*i\.store_id\s*<>\s*s\.store_id/i,'cross-registration supplier links must abort before a cascade can reach another registration');
assert.match(migration,/Cross-registration relationship found/,'cross-registration FK conflicts must abort the whole transaction');

const allocationDelete=migration.search(/delete\s+from\s+public\.payment_allocations/i);
const storeDelete=migration.search(/delete\s+from\s+public\.stores/i);
assert.ok(allocationDelete>=0,'payment allocations must be explicitly removed');
assert.ok(storeDelete>allocationDelete,'restricted payment allocations must be removed before the registration row cascades');
const allocationStatement=migration.slice(allocationDelete,migration.indexOf(';',allocationDelete)+1);
assert.match(allocationStatement,/p_store_id|v_invoice_ids|v_payment_ids/i,'allocation cleanup must stay scoped to the selected registration');
assert.match(migration,/invoice[^\n,;]*(?:path|paths)|storage_paths/i,'the RPC must return exact invoice image paths for Storage cleanup');
assert.match(migration,/loan[^\n,;]*(?:path|paths)/i,'the RPC must return exact loan-document paths for Storage cleanup');
assert.doesNotMatch(migration,/delete\s+from\s+(?:public\.)?(?:profiles|phone_login_accounts)|delete\s+from\s+auth\.users/i,'registration deletion must preserve account identity');
assert.match(migration,/revoke\s+all\s+on\s+function\s+private\.delete_my_registration_impl[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i);
assert.match(migration,/grant\s+execute\s+on\s+function\s+public\.delete_my_registration[\s\S]*to\s+authenticated/i);

// The Edge Function verifies the JWT, invokes the atomic RPC, then removes both file kinds.
assert.match(edge,/admin\.auth\.getUser\(token\)/,'the Edge Function must authenticate the bearer token itself');
assert.match(edge,/delete_my_registration/);
assert.match(edge,/p_store_id\s*:\s*storeId/);
assert.match(edge,/p_confirmation\s*:\s*confirmation/);
assert.match(edge,/cleanup\(["']invoice-images["']\s*,/);
assert.match(edge,/cleanup\(["']loan-contracts["']\s*,/);
assert.match(edge,/removeStoreFolder\(admin,\s*["']contact-logos["']\s*,\s*storeId\)/,'registration deletion must remove its contact logos without touching another store folder');
assert.match(edge,/storage\.from\(bucket\)\.remove\s*\(/,'both returned path sets must be removed through the Storage API');
assert.match(edge,/segments\[0\]\s*===\s*storeId/,'service-role cleanup must reject a metadata path belonging to another registration');
assert.doesNotMatch(edge,/auth\.admin\.deleteUser|from\(["']profiles["']\)|from\(["']phone_login_accounts["']\)/,'the registration endpoint must never delete the user account');

function storage(initial){
  const values=new Map(Object.entries(initial||{}));
  return {
    get length(){return values.size;},
    key:index=>Array.from(values.keys())[index]??null,
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(String(key),String(value)),
    removeItem:key=>values.delete(String(key)),
    snapshot:()=>Object.fromEntries(values)
  };
}

function classList(){
  const values=new Set();
  return {add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value),toggle(value,force){const next=force===undefined?!values.has(value):Boolean(force);if(next)values.add(value);else values.delete(value);return next;}};
}

function harness(options={}){
  const userId=options.userId||'user-a';
  const storeA={id:'store-a',name:'Nayad market',role:options.role||'owner'};
  const storeB={id:'store-b',name:'Second registration',role:'owner'};
  const remaining=options.remaining===undefined?[storeB]:options.remaining;
  const local=storage({
    [`NAYAD_ACTIVE_STORE:${userId}`]:storeA.id,
    [`NAYAD_DATA_V4:${userId}:${storeA.id}`]:'A DATA',
    [`NAYAD_DATA_V4:${userId}:${storeB.id}`]:'B DATA',
    'NAYAD_DATA_V4:other-user:other-store':'OTHER USER DATA',
    'unrelated-key':'KEEP'
  });
  const session=storage({'session-sentinel':'KEEP'});
  const confirmation={value:options.confirmation??'УСТГАХ'};
  const button={disabled:false,textContent:'Бүртгэл устгах',dataset:{}};
  const app={classList:classList()};
  const login={classList:classList()};
  const calls={fetch:[],refresh:[],toast:[],sheet:[],onboarding:[],authenticatedApp:0,signOut:0,close:0,render:0,reload:0};
  let currentSessionUserId=userId;

  const context={
    console,JSON,Promise,Response,Headers,URL,AbortController,
    SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY:'publishable-key',
    localStorage:local,sessionStorage:session,
    setTimeout:fn=>{fn();return 1;},clearTimeout(){},
    location:{reload:()=>{calls.reload++;}},
    document:{
      head:{insertAdjacentHTML(){}},body:{appendChild(){}},
      getElementById(id){
        if(id==='app')return app;if(id==='login')return login;
        if(/confirm/i.test(id)&&!/btn|button/i.test(id))return confirmation;
        if(/delete.*(?:btn|button)|(?:btn|button).*delete/i.test(id))return button;
        return null;
      },
      querySelector(){return null;},createElement:()=>({classList:classList(),remove(){}})
    },
    fetch:async(url,request={})=>{
      calls.fetch.push({url:String(url),request});
      const ok=options.ok!==false;
      return {ok,status:ok?200:500,json:async()=>ok?{ok:true,deleted_store_id:storeA.id}:{error:'Registration deletion failed'}};
    },
    v:()=>confirmation.value,
    escapeHtml:value=>String(value),
    sheet:html=>calls.sheet.push(html),
    closeSheet:()=>{calls.close++;},
    toast:message=>calls.toast.push(String(message)),
    setAuthBusy:(_id,busy,text)=>{button.disabled=Boolean(busy);if(text)button.textContent=text;},
    render:()=>{calls.render++;}
  };
  context.window=context;
  context.window.__nayadUser={id:userId};
  context.window.__nayadActiveStore=storeA;
  context.window.__nayadActiveStoreId=storeA.id;
  context.window.__nayadStores=[storeA,...remaining.filter(store=>store.id!==storeA.id)];
  context.window.__nayadStoresUserId=userId;
  context.window.__nayadCloudSyncQueue=Promise.resolve();
  context.window.__nayadRefreshStores=async refreshOptions=>{
    calls.refresh.push(refreshOptions||{});
    if(options.refreshError)throw new Error('temporary registration refresh failure');
    context.window.__nayadStores=remaining.slice();
    if(remaining.length){
      const current=remaining.find(store=>String(store.id)===String(context.window.__nayadActiveStoreId));
      const next=current||remaining[0];
      context.window.__nayadActiveStore=next;
      context.window.__nayadActiveStoreId=next.id;
      local.setItem(`NAYAD_ACTIVE_STORE:${userId}`,next.id);
    }else{
      context.window.__nayadActiveStore=null;
      context.window.__nayadActiveStoreId=null;
    }
    return remaining.slice();
  };
  context.window.showNayadRegistrationOnboarding=onboardingOptions=>calls.onboarding.push(onboardingOptions||{});
  context.window.showAuthenticatedApp=async()=>{calls.authenticatedApp++;context.window.showNayadRegistrationOnboarding({initial:true});return true;};
  const auth={
    getSession:async()=>({data:{session:{access_token:'access-token',user:{id:currentSessionUserId}}},error:null}),
    signOut:async()=>{calls.signOut++;return {error:null};}
  };
  context.window.nayadSupabase={auth};
  context.window.sb=context.window.nayadSupabase;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'registration-delete.js'});
  return {context,calls,local,session,confirmation,button,storeA,storeB,setSessionUser:id=>{currentSessionUserId=id;}};
}

(async()=>{
  const wrong=harness({confirmation:'устгах'});
  wrong.context.window.showDeleteRegistrationConfirm();
  assert.match(wrong.calls.sheet.at(-1),/Nayad market/);
  assert.match(wrong.calls.sheet.at(-1),/бүгд/);
  assert.doesNotMatch(wrong.calls.sheet.at(-1),/бүрмөсөн/);
  await wrong.context.window.deleteActiveRegistration();
  assert.equal(wrong.calls.fetch.length,0,'an inexact confirmation must not reach the server');

  const member=harness({role:'manager'});
  member.context.window.showDeleteRegistrationConfirm();
  await member.context.window.deleteActiveRegistration();
  assert.equal(member.calls.sheet.length,0,'a shared member must not receive the owner delete sheet');
  assert.equal(member.calls.fetch.length,0,'a shared member must not invoke registration deletion');

  const failure=harness({ok:false});
  const beforeFailure=failure.local.snapshot();
  failure.context.window.showDeleteRegistrationConfirm();
  await failure.context.window.deleteActiveRegistration();
  assert.deepEqual(failure.local.snapshot(),beforeFailure,'a failed server deletion must not change any browser cache');
  assert.equal(failure.calls.refresh.length,0);
  assert.equal(failure.calls.signOut,0);
  assert.equal(failure.button.disabled,false,'the user must be able to retry after a failure');
  assert.ok(failure.calls.toast.length,'a failed deletion must be explained');

  const success=harness();
  success.context.window.showDeleteRegistrationConfirm();
  await success.context.window.deleteActiveRegistration();
  assert.equal(success.calls.fetch.length,1);
  assert.ok(success.calls.fetch[0].url.endsWith('/functions/v1/delete-registration'));
  assert.deepEqual(JSON.parse(success.calls.fetch[0].request.body),{store_id:'store-a',confirmation:'УСТГАХ'});
  assert.match(String(success.calls.fetch[0].request.headers.Authorization||success.calls.fetch[0].request.headers.authorization),/^Bearer access-token$/);
  assert.equal(success.calls.refresh.length,1,'success must reload the authorized registration list');
  assert.equal(success.local.getItem('NAYAD_DATA_V4:user-a:store-a'),null,'only the deleted registration cache must be removed');
  assert.equal(success.local.getItem('NAYAD_DATA_V4:user-a:store-b'),'B DATA');
  assert.equal(success.local.getItem('NAYAD_DATA_V4:other-user:other-store'),'OTHER USER DATA');
  assert.equal(success.local.getItem('unrelated-key'),'KEEP');
  assert.equal(success.session.getItem('session-sentinel'),'KEEP','registration deletion must not wipe session storage');
  assert.equal(success.calls.signOut,0,'the account must remain signed in');
  assert.equal(success.context.window.__nayadUser.id,'user-a');
  assert.equal(success.context.window.__nayadActiveStoreId,'store-b','a remaining registration must become active');

  const refreshFailure=harness({refreshError:true});
  refreshFailure.context.window.showDeleteRegistrationConfirm();
  await refreshFailure.context.window.deleteActiveRegistration();
  assert.equal(refreshFailure.calls.fetch.length,1,'the registration was deleted exactly once on the server');
  assert.equal(refreshFailure.local.getItem('NAYAD_DATA_V4:user-a:store-a'),null,'post-delete recovery failure must still remove only the deleted cache');
  assert.match(refreshFailure.calls.toast.at(-1),/бүртгэл устсан/,'post-delete refresh failure must truthfully report that deletion already succeeded');
  assert.equal(refreshFailure.calls.reload,1,'a transient refresh failure must recover through a clean reload');
  await refreshFailure.context.window.deleteActiveRegistration();
  assert.equal(refreshFailure.calls.fetch.length,1,'a completed server deletion must never be offered as a retry');
  assert.equal(refreshFailure.calls.signOut,0);

  const last=harness({remaining:[]});
  last.context.window.showDeleteRegistrationConfirm();
  await last.context.window.deleteActiveRegistration();
  assert.equal(last.local.getItem('NAYAD_DATA_V4:user-a:store-a'),null);
  assert.equal(last.local.getItem('NAYAD_ACTIVE_STORE:user-a'),null,'the deleted last-registration pointer must not survive');
  assert.equal(last.context.window.__nayadActiveStoreId,null);
  assert.equal(last.calls.signOut,0);
  assert.equal(last.context.window.__nayadUser.id,'user-a');
  assert.equal(last.calls.onboarding.length,1,'deleting the last accessible registration must open onboarding');
  assert.equal(last.calls.onboarding[0].initial,true);

  console.log('delete-registration: PASS — owner-only deletion preserves account/store isolation and cleans dependent data safely');
})().catch(error=>{console.error(error);process.exitCode=1;});
