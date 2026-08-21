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
assert.match(swSource,/const CACHE = "nayad-v78";/,'the session isolation fix must invalidate the installed app shell');
assert.match(swSource,/\.\/store-switcher\.js\?v=58/);
assert.match(indexSource,/\.\/store-switcher\.js\?v=58/,'index and service worker must load the same store switcher');
assert.match(swSource,/\.\/store-recovery\.js\?v=53/);
assert.match(indexSource,/\.\/store-recovery\.js\?v=53/,'store recovery must be loaded directly, not only injected by the service worker');
assert.match(swSource,/\.\/auth-guard\.js\?v=56/);
assert.match(indexSource,/\.\/auth-guard\.js\?v=56/,'auth guard must be loaded directly, not only injected by the service worker');
assert.match(swSource,/\.\/cloud-runtime\.js\?v=58/);
assert.match(indexSource,/\.\/cloud-runtime\.js\?v=58/,'index and service worker must load the same cloud runtime');
assert.match(swSource,/\.\/invoice-cloud\.js\?v=66/);
assert.match(indexSource,/\.\/invoice-cloud\.js\?v=66/,'index and service worker must load the same invoice code');
assert.match(swSource,/\.\/supplier-cloud\.js\?v=57/);
assert.match(indexSource,/\.\/supplier-cloud\.js\?v=57/,'index and service worker must load the same supplier code');

vm.createContext(context);
vm.runInContext(swSource,context,{filename:'sw.js'});

const legacyHtml='<body><script src="./store-switcher.js?v=57"></script><script src="./invoice-cloud.js?v=66"></script></body>';
const patchedOnce=context.patchDocument(legacyHtml);
const patchedTwice=context.patchDocument(patchedOnce);
for(const asset of ['./store-recovery.js?v=53','./auth-guard.js?v=56','./cloud-runtime.js?v=58']){
  assert.equal(patchedTwice.split(asset).length-1,1,`${asset} must be injected exactly once`);
}
assert.ok(
  patchedTwice.indexOf('./store-switcher.js?v=58')<patchedTwice.indexOf('./store-recovery.js?v=53')&&
  patchedTwice.indexOf('./store-recovery.js?v=53')<patchedTwice.indexOf('./auth-guard.js?v=56')&&
  patchedTwice.indexOf('./auth-guard.js?v=56')<patchedTwice.indexOf('./cloud-runtime.js?v=58')&&
  patchedTwice.indexOf('./cloud-runtime.js?v=58')<patchedTwice.indexOf('./invoice-cloud.js?v=66'),
  'legacy documents must receive the same safe store/auth/cloud script order'
);

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
