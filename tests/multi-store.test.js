const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const userId='user-1';
const ownId='store-own';
const sharedId='store-shared';
const values=new Map([
  [`NAYAD_ACTIVE_STORE:${userId}`,ownId],
  [`NAYAD_DATA_V4:${userId}:${ownId}`,JSON.stringify({companies:[{id:1,name:'OWN DATA',invoices:[]}],payments:[]})],
  [`NAYAD_DATA_V4:${userId}:${sharedId}`,JSON.stringify({companies:[{id:2,name:'SHARED DATA',invoices:[]}],payments:[]})]
]);
let pickerHtml='';
let renderedCompany='';
let invoiceSyncs=0;
let supplierSyncs=0;
let releasePendingCloud;
const pendingCloud=new Promise(resolve=>{releasePendingCloud=resolve;});
const content={firstChild:null,querySelector:()=>null,insertBefore(){}};
const app={classList:{contains:()=>false}};

function membershipsQuery(){
  const response={data:[
    {store_id:ownId,role:'owner',created_at:'2026-08-17',stores:{id:ownId,name:'tsendun store'}},
    {store_id:sharedId,role:'member',created_at:'2026-08-18',stores:{id:sharedId,name:'NAYAD'}}
  ],error:null};
  const q={select(){return q;},eq(){return q;},order(){return q;},then(resolve,reject){return Promise.resolve(response).then(resolve,reject);}};
  return q;
}

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
context.window.__nayadUser={id:userId};
context.window.addEventListener=()=>{};
context.window.closeSheet=()=>{};
context.window.sheet=html=>{pickerHtml=html;};
context.window.__nayadSyncInvoices=async()=>{invoiceSyncs++;};
context.window.__nayadSyncSuppliers=async()=>{supplierSyncs++;};
context.window.__nayadCloudSyncQueue=pendingCloud;
context.window.nayadSupabase={
  auth:{getSession:async()=>({data:{session:{user:{id:userId}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:table=>{assert.equal(table,'store_members');return membershipsQuery();},
  rpc:async name=>{throw new Error('Unexpected RPC: '+name);}
};

vm.createContext(context);
context.capture=value=>{renderedCompany=value;};
vm.runInContext(`
  let data={companies:[],payments:[]};
  let selected={id:99};
  let page='companies';
  function render(){capture(data.companies[0]?.name||'')}
`,context);
const root=path.resolve(__dirname,'..');
vm.runInContext(fs.readFileSync(path.join(root,'app-state.js'),'utf8'),context,{filename:'app-state.js'});
vm.runInContext(fs.readFileSync(path.join(root,'store-switcher.js'),'utf8'),context,{filename:'store-switcher.js'});

(async()=>{
  const stores=await context.window.__nayadRefreshStores({sync:false,close:false});
  assert.equal(stores.length,2,'both owned and shared stores must be listed');
  assert.equal(context.window.__nayadActiveStoreId,ownId);
  assert.equal(renderedCompany,'OWN DATA','remembered owned store data must load');
  context.window.showNayadStorePicker();
  assert.match(pickerHtml,/tsendun store/);
  assert.match(pickerHtml,/NAYAD/);
  assert.match(pickerHtml,/Эзэмшигч/);
  assert.match(pickerHtml,/Гишүүн/);

  const switching=context.window.selectNayadStore(sharedId);
  await Promise.resolve();
  assert.equal(context.window.__nayadActiveStoreId,ownId,'active store must not change while an older cloud write is pending');
  releasePendingCloud();
  await switching;
  assert.equal(context.window.__nayadActiveStoreId,sharedId);
  assert.equal(renderedCompany,'SHARED DATA','shared store must use a separate cache');
  assert.equal(vm.runInContext('page',context),'home');
  assert.equal(vm.runInContext('selected',context),null);
  assert.equal(invoiceSyncs,1);
  assert.equal(supplierSyncs,1);

  await context.window.selectNayadStore(ownId);
  assert.equal(renderedCompany,'OWN DATA','switching back must restore owned store data');
  assert.equal(values.get(`NAYAD_ACTIVE_STORE:${userId}`),ownId);
  console.log('multi-store: PASS — two stores remain separate and switch safely');
})().catch(error=>{console.error(error);process.exitCode=1;});
