const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const listeners={};
const calls={fetch:[],match:[],open:[]};

const context={
  console,URL,Headers,Response,Set,Promise,
  fetch:async(request,options)=>{
    calls.fetch.push({request,options});
    return new Response('network',{status:200,headers:{'content-type':'application/json'}});
  },
  caches:{
    keys:async()=>[],
    delete:async()=>true,
    match:async request=>{calls.match.push(request);return new Response('cached',{status:200});},
    open:async name=>{calls.open.push(name);return {addAll:async()=>{},put:async()=>{}};}
  },
  self:{
    location:{origin:'https://nayad.store'},
    registration:{scope:'https://nayad.store/'},
    clients:{claim:async()=>{}},
    skipWaiting(){},
    addEventListener(type,handler){listeners[type]=handler;}
  }
};

const swSource=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
const indexSource=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const cacheVersion=Number(swSource.match(/const CACHE = "nayad-v(\d+)";/)?.[1]||0);
assert.ok(cacheVersion>=129,'the iOS-safe contact logo upload must invalidate the installed app shell');
assert.match(swSource,/\.\/registration-onboarding\.js\?v=2/);
assert.match(indexSource,/\.\/registration-onboarding\.js\?v=2/,'index and service worker must load the same onboarding code');
const deleteAsset=swSource.match(/\.\/registration-delete\.js\?v=(\d+)/);
const indexDeleteAsset=indexSource.match(/\.\/registration-delete\.js\?v=(\d+)/);
assert.ok(deleteAsset,'the active-registration deletion code must be cached for the installed app');
assert.ok(indexDeleteAsset,'the active-registration deletion code must load in the live document');
assert.equal(indexDeleteAsset[1],deleteAsset[1],'index and service worker must load the same registration deletion code');
assert.match(swSource,/\.\/store-switcher\.js\?v=64/);
assert.match(indexSource,/\.\/store-switcher\.js\?v=64/,'index and service worker must load the same store switcher');
assert.match(swSource,/\.\/store-recovery\.js\?v=57/);
assert.match(indexSource,/\.\/store-recovery\.js\?v=57/,'store recovery must be loaded directly, not only injected by the service worker');
assert.match(swSource,/\.\/auth-guard\.js\?v=57/);
assert.match(indexSource,/\.\/auth-guard\.js\?v=57/,'auth guard must be loaded directly, not only injected by the service worker');
assert.match(swSource,/\.\/cloud-runtime\.js\?v=59/);
assert.match(indexSource,/\.\/cloud-runtime\.js\?v=59/,'index and service worker must load the same cloud runtime');
assert.match(swSource,/\.\/money-input\.js\?v=1/);
assert.match(indexSource,/\.\/money-input\.js\?v=1/,'index and service worker must load the money formatter');
assert.match(swSource,/\.\/invoice-cloud\.js\?v=75/);
assert.match(indexSource,/\.\/invoice-cloud\.js\?v=75/,'index and service worker must load the same invoice code');
assert.match(swSource,/\.\/payment-center\.js\?v=11/);
assert.match(indexSource,/\.\/payment-center\.js\?v=11/,'index and service worker must load the same payment center');
assert.match(swSource,/\.\/loans\.js\?v=3/);
assert.match(indexSource,/\.\/loans\.js\?v=3/,'index and service worker must load the loan module');
assert.match(swSource,/\.\/contact-types\.js\?v=13/);
assert.match(indexSource,/\.\/contact-types\.js\?v=13/,'index and service worker must load the contact type module');
assert.match(swSource,/\.\/supplier-cloud\.js\?v=60/);
assert.match(indexSource,/\.\/supplier-cloud\.js\?v=60/,'index and service worker must load the same supplier code');
assert.match(swSource,/\.\/share\.js\?v=40/);
assert.match(indexSource,/\.\/share\.js\?v=40/,'index and service worker must load the same sharing code');
assert.match(swSource,/\.\/profile-menu\.js\?v=5/);
assert.match(indexSource,/\.\/profile-menu\.js\?v=5/,'index and service worker must load the profile drawer');
assert.match(swSource,/\.\/admin-dashboard\.js\?v=2/);
assert.match(indexSource,/\.\/admin-dashboard\.js\?v=2/,'index and service worker must load the timestamped payment dashboard');
assert.match(swSource,/\.\/subscription\.js\?v=5/);
assert.match(indexSource,/\.\/subscription\.js\?v=5/,'index and service worker must load the subscription flow');
assert.match(swSource,/\.\/member-permissions\.js\?v=1/);
assert.match(indexSource,/\.\/member-permissions\.js\?v=1/,'index and service worker must load the permission guard');

vm.createContext(context);
vm.runInContext(swSource,context,{filename:'sw.js'});

const legacyHtml='<body><script src="./store-switcher.js?v=58"></script><script src="./share.js?v=38"></script><script src="./invoice-cloud.js?v=67"></script></body>';
const patchedOnce=context.patchDocument(legacyHtml);
const patchedTwice=context.patchDocument(patchedOnce);
for(const asset of ['./registration-onboarding.js?v=2',deleteAsset[0],'./store-recovery.js?v=57','./auth-guard.js?v=57','./cloud-runtime.js?v=59','./member-permissions.js?v=1']){
  assert.equal(patchedTwice.split(asset).length-1,1,`${asset} must be injected exactly once`);
}
assert.ok(
  patchedTwice.indexOf('./registration-onboarding.js?v=2')<patchedTwice.indexOf('./store-switcher.js?v=64')&&
  patchedTwice.indexOf('./store-switcher.js?v=64')<patchedTwice.indexOf('./store-recovery.js?v=57')&&
  patchedTwice.indexOf('./store-recovery.js?v=57')<patchedTwice.indexOf(deleteAsset[0])&&
  patchedTwice.indexOf(deleteAsset[0])<patchedTwice.indexOf('./auth-guard.js?v=57')&&
  patchedTwice.indexOf('./auth-guard.js?v=57')<patchedTwice.indexOf('./money-input.js?v=1')&&
  patchedTwice.indexOf('./money-input.js?v=1')<patchedTwice.indexOf('./cloud-runtime.js?v=59')&&
  patchedTwice.indexOf('./cloud-runtime.js?v=59')<patchedTwice.indexOf('./invoice-cloud.js?v=75'),
  'legacy documents must receive the same safe store/auth/cloud script order'
);
assert.equal(patchedTwice.split('./profile-menu.js?v=5').length-1,1,'profile drawer must be injected exactly once');
assert.equal(patchedTwice.split('./admin-dashboard.js?v=2').length-1,1,'admin dashboard must be injected exactly once');
assert.equal(patchedTwice.split('./subscription.js?v=5').length-1,1,'subscription flow must be injected exactly once');
assert.ok(patchedTwice.indexOf('./subscription.js?v=5')<patchedTwice.indexOf('./member-permissions.js?v=1'),'permission guard must load after all feature modules');
assert.equal(patchedTwice.split('./loans.js?v=3').length-1,1,'loan module must be injected exactly once');
assert.ok(patchedTwice.indexOf('./share.js?v=40')<patchedTwice.indexOf('./profile-menu.js?v=5'),'profile drawer must load after sharing actions');

async function dispatch(request){
  let responsePromise;
  listeners.fetch({request,respondWith(value){responsePromise=Promise.resolve(value);}});
  assert.ok(responsePromise,'fetch handler must respond');
  return responsePromise;
}

(async()=>{
  await dispatch({
    url:'https://kjgtmxcxchjevzoxwqzr.supabase.co/rest/v1/invoices?select=*',
    method:'GET',mode:'cors',destination:''
  });
  assert.equal(calls.fetch.length,1,'Supabase GET must go directly to the network');
  assert.equal(calls.match.length,0,'Supabase GET must never read CacheStorage');
  assert.equal(calls.open.length,0,'Supabase GET must never write CacheStorage');

  await dispatch({
    url:'https://kjgtmxcxchjevzoxwqzr.supabase.co/rest/v1/rpc/record_supplier_payment',
    method:'POST',mode:'cors',destination:''
  });
  assert.equal(calls.fetch.length,2,'Supabase RPC must go directly to the network');
  assert.equal(calls.match.length,0,'Supabase RPC must never touch CacheStorage');

  await dispatch({url:'https://nayad.store/app-state.js?v=38',method:'GET',mode:'cors',destination:'script'});
  assert.equal(calls.match.length,1,'allowlisted same-origin static assets may use CacheStorage');

  console.log('service-worker-cache: PASS — Supabase API traffic always bypasses CacheStorage');
})().catch(error=>{console.error(error);process.exitCode=1;});
