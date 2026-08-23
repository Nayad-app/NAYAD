const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

const root=path.resolve(__dirname,'..');
const userId='user-create-queue';
const storeId='store-create-queue';
const supplierId='supplier-maximus';
const key='NAYAD_DATA_V3:'+userId;
const empty=()=>({companies:[],payments:[]});
const storage=new Map([[key,JSON.stringify(empty())]]);
const events=[];
const inserts=[];
let originalSaveCalls=0;

function deferred(){
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

const values={
  newContactType:'organization',newName:'maximus',newPhone:'70000000',newAddress:'',newDirector:'',newDirectorPhone:'',
  newSales:'',newSalesPhone:'',newNote:'',newBank:'ХААН банк',newBankAccount:'5000000000',newBankAccountHolder:'maximus'
};

function supplierQuery(){
  let inserted=null;
  const query={
    select(){return query;},
    eq(){return query;},
    ilike(){return query;},
    limit(){return query;},
    insert(payload){
      inserted=payload;
      inserts.push(payload);
      events.push('cloud-insert');
      return query;
    },
    single(){
      return Promise.resolve({data:{id:supplierId,...inserted},error:null});
    },
    then(resolve,reject){
      return Promise.resolve({data:[],error:null}).then(resolve,reject);
    }
  };
  return query;
}

const gate=deferred();
const context={
  console,Intl,crypto:webcrypto,
  setTimeout:()=>1,clearTimeout(){},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  document:{getElementById:id=>({value:values[id]??''})}
};
context.window=context;
context.window.__nayadUser={id:userId};
context.window.__nayadGetActiveStore=async()=>({id:storeId,name:'Namka store'});
context.window.addEventListener=()=>{};
context.window.toast=()=>{};
context.window.saveCompany=()=>{
  originalSaveCalls++;
  events.push('local-save');
  const data=JSON.parse(storage.get(key)||JSON.stringify(empty()));
  data.companies.push({id:101,name:values.newName.trim(),color:'green',status:'active',invoices:[]});
  storage.set(key,JSON.stringify(data));
};
context.window.nayadSupabase={
  auth:{getSession:async()=>({data:{session:{user:{id:userId}}},error:null})},
  from:table=>{
    if(table!=='suppliers')throw new Error('Unexpected table: '+table);
    return supplierQuery();
  }
};

/* Model an older authoritative sync which already owns the shared queue. If
   supplier creation bypasses that queue, its local row is written first and
   this stale snapshot removes it when the gate opens. */
context.window.__nayadCloudSyncQueue=gate.promise.then(()=>{
  events.push('old-snapshot');
  storage.set(key,JSON.stringify(empty()));
});
context.window.__nayadQueueCloudSync=function(task){
  const run=(context.window.__nayadCloudSyncQueue||Promise.resolve()).catch(()=>{}).then(task);
  context.window.__nayadCloudSyncQueue=run.catch(()=>{});
  return run;
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'supplier-cloud.js'),'utf8'),context,{filename:'supplier-cloud.js'});

(async()=>{
  const savePromise=context.window.saveCompany();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(inserts.length,0,'cloud insert must wait for the older queued snapshot');
  assert.equal(originalSaveCalls,0,'local supplier save must wait for the older queued snapshot');
  assert.deepEqual(JSON.parse(storage.get(key)),empty(),'no local supplier may appear before its queue turn');
  assert.match(String(context.window.__nayadCriticalOperation||''),/^supplier:/,'queued supplier mutation must block reload/logout');

  gate.resolve();
  await savePromise;

  assert.deepEqual(events,['old-snapshot','cloud-insert','local-save'],'older snapshot must finish before supplier creation begins');
  assert.equal(inserts.length,1,'supplier must be inserted exactly once');
  assert.equal(inserts[0].store_id,storeId);
  assert.equal(inserts[0].name,'maximus');
  assert.equal(originalSaveCalls,1,'the local supplier must be created exactly once');

  const saved=JSON.parse(storage.get(key));
  assert.equal(saved.companies.length,1,'the older snapshot must not overwrite the new supplier');
  assert.equal(saved.companies[0].name,'maximus');
  assert.equal(saved.companies[0].supabase_supplier_id,supplierId,'the local supplier must retain its cloud UUID');
  assert.equal(context.window.__nayadCriticalOperation,undefined,'critical-operation guard must clear after save');

  console.log('supplier-create-queue: PASS — creation waits for older cloud sync and keeps its cloud UUID');
})().catch(error=>{console.error(error);process.exitCode=1;});
