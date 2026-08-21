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
assert.match(swSource,/const CACHE = "nayad-v77";/,'the share fix must invalidate the installed app shell');
assert.match(swSource,/\.\/invoice-cloud\.js\?v=66/);
assert.match(indexSource,/\.\/invoice-cloud\.js\?v=66/,'index and service worker must load the same invoice code');
assert.match(swSource,/\.\/supplier-cloud\.js\?v=57/);
assert.match(indexSource,/\.\/supplier-cloud\.js\?v=57/,'index and service worker must load the same supplier code');

vm.createContext(context);
vm.runInContext(swSource,context,{filename:'sw.js'});

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
