const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const listeners={};
let invoiceSyncs=0;
let supplierSyncs=0;
let subscribed=false;

const channel={
  on(){return channel;},
  subscribe(){subscribed=true;return channel;}
};
const context={
  console,
  setTimeout:fn=>{fn();return 1;},clearTimeout(){},setInterval:()=>1,
  document:{visibilityState:'visible',addEventListener:(name,fn)=>{listeners['document:'+name]=fn;}},
};
context.window=context;
context.window.addEventListener=(name,fn)=>{listeners[name]=fn;};
context.window.__nayadUser={id:'user-1'};
context.window.__nayadActiveStoreId='store-1';
context.window.__nayadActiveStore={id:'store-1',name:'Store'};
context.window.__nayadStores=[{id:'store-1',name:'Store',role:'owner'}];
context.window.__nayadStoresUserId='other-user';
context.window.__nayadSyncInvoices=async()=>{invoiceSyncs++;};
context.window.__nayadSyncSuppliers=async()=>{supplierSyncs++;};
context.window.nayadSupabase={
  auth:{getSession:async()=>({data:{session:{user:{id:'user-1'}}},error:null})},
  channel:()=>channel,
  removeChannel:async()=>{}
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'cloud-runtime.js'),'utf8'),context,{filename:'cloud-runtime.js'});

(async()=>{
  assert.equal(typeof listeners.load,'function','cloud sync must bind an initial load handler');
  listeners.load();
  for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(subscribed,false,'cloud runtime must reject a store list tagged for another user');
  context.window.__nayadStoresUserId='user-1';
  listeners.load();
  for(let i=0;i<8&&!subscribed;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(invoiceSyncs>0,'initial load must fetch cloud invoices');
  assert.ok(supplierSyncs>0,'initial load must fetch cloud suppliers');
  assert.equal(subscribed,true,'initial load must subscribe to store changes');
  console.log('cloud-runtime: PASS — app load syncs and watches the active store');
})().catch(error=>{console.error(error);process.exitCode=1;});
