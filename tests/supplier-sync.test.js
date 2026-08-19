const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const userId='user-1';
const key='NAYAD_DATA_V3:'+userId;
const authoritative={companies:[{id:1,name:'vitafit',supabase_supplier_id:'supplier-1',bank:'',invoices:[{id:'invoice-1',amount:100000,paid:85800}],debt:14200}],payments:[]};
const stale=JSON.parse(JSON.stringify(authoritative));
stale.companies[0].invoices[0].paid=85500;
stale.companies[0].debt=14500;
stale.companies.push({id:2,name:'bat',invoices:[{id:'local-only',amount:1200,paid:0}],debt:1200});
stale.companies.push({id:3,name:'vitafit',supabase_supplier_id:'supplier-1',invoices:[],debt:0});
const storage=new Map([[key,JSON.stringify(authoritative)]]);
let onLoad=null;
let renderedDebt=null;

function supplierQuery(){
  const response={data:[{id:'supplier-1',name:'vitafit',reg_no:null,address:null,director:null,director_phone:null,sales_rep:null,sales_phone:null,org_phone:null,bank_name:'ХААН банк',bank_account:'5000000000',is_active:true}],error:null};
  const q={select(){return q;},eq(){return q;},order(){return q;},then(resolve,reject){return Promise.resolve(response).then(resolve,reject);}};
  return q;
}

const context={
  console,Intl,
  setTimeout:fn=>{fn();return 1;},clearTimeout(){},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  location:{reload(){throw new Error('supplier sync must not reload or replace a fresh payment state');}},
  document:{getElementById:()=>null},
  MutationObserver:function(){this.observe=()=>{};}
};
context.window=context;
context.window.__nayadUser={id:userId};
context.window.addEventListener=(event,handler)=>{if(event==='load')onLoad=handler;};
context.window.nayadSupabase={
  auth:{getSession:async()=>({data:{session:{user:{id:userId}}}})},
  rpc:async name=>{
    if(name==='ensure_my_store')return {data:[{id:'store-1'}],error:null};
    throw new Error('Unexpected RPC: '+name);
  },
  from:table=>{if(table!=='suppliers')throw new Error('Unexpected table: '+table);return supplierQuery();}
};

vm.createContext(context);
context.rendered=debt=>{renderedDebt=debt;};
vm.runInContext(`
  let data=${JSON.stringify(stale)};
  let selected=null;
  function render(){rendered(data.companies[0].debt)}
`,context);
vm.runInContext(fs.readFileSync(path.join(root,'app-state.js'),'utf8'),context,{filename:'app-state.js'});
vm.runInContext(fs.readFileSync(path.join(root,'supplier-cloud.js'),'utf8'),context,{filename:'supplier-cloud.js'});

(async()=>{
  assert.equal(typeof onLoad,'function','supplier sync load hook must be registered');
  onLoad();
  await context.window.__nayadCloudSyncQueue;
  const saved=JSON.parse(storage.get(key));
  const liveDebt=vm.runInContext('data.companies[0].debt',context);
  assert.equal(saved.companies[0].debt,14200,'supplier metadata must preserve the newest stored balance');
  assert.equal(saved.companies[0].invoices[0].paid,85800,'supplier metadata must preserve paid invoice values');
  assert.equal(saved.companies[0].bank,'ХААН банк','supplier metadata still needs to update');
  assert.equal(saved.companies.length,1,'a stale device-only supplier must be removed');
  assert.equal(liveDebt,14200,'supplier sync must replace stale visible state');
  assert.equal(renderedDebt,14200,'supplier sync must render the preserved balance');
  console.log('supplier-sync: PASS — metadata refresh cannot revert a 14,200 ₮ payment balance');
})().catch(error=>{console.error(error);process.exitCode=1;});
