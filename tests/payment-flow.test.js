const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const storage=new Map();
const userId='user-1';
const localKey='NAYAD_DATA_V3:'+userId;
const initial={
  companies:[{id:1,name:'vitafit',supabase_supplier_id:'supplier-1',invoices:[{id:'invoice-1',date:'2026-08-18',amount:100000,paid:85500}],debt:14500}],
  payments:[]
};
storage.set(localKey,JSON.stringify(initial));

let latestPaymentId='';
/* Deliberately return a stale invoice SELECT after the RPC. The authoritative
   RPC balance must guard the UI from jumping back to 14,500. */
const server={remaining:14200,staleReadPaid:85500,refreshError:true};

function resultFor(table,mode){
  if(table==='suppliers'&&mode==='maybeSingle')return {data:{id:'supplier-1',name:'vitafit'},error:null};
  if(table==='invoices'&&server.refreshError)return {data:null,error:new Error('temporary invoice refresh failure')};
  if(table==='invoices')return {data:[{id:'invoice-1',supplier_id:'supplier-1',invoice_no:'INV-1',invoice_date:'2026-08-18',amount:100000,paid:server.staleReadPaid,image_url:null}],error:null};
  if(table==='payments')return {data:[{id:latestPaymentId,supplier_id:'supplier-1',payment_date:'2026-08-18',amount:300,method:'Банк',note:null,created_at:'2026-08-18T00:00:00Z'}],error:null};
  if(table==='suppliers')return {data:[{id:'supplier-1',name:'vitafit',reg_no:null,address:null,director:null,director_phone:null,sales_phone:null,is_active:true}],error:null};
  if(table==='invoice_images')return {data:[],error:null};
  return {data:[],error:null};
}

function query(table){
  let mode='list';
  const q={
    select(){return q;},eq(){return q;},order(){return q;},in(){return q;},limit(){return q;},
    maybeSingle(){mode='maybeSingle';return Promise.resolve(resultFor(table,mode));},
    single(){mode='single';return Promise.resolve(resultFor(table,mode));},
    then(resolve,reject){return Promise.resolve(resultFor(table,mode)).then(resolve,reject);}
  };
  return q;
}

const fields={
  pCompany:{value:'1'},pAmount:{value:'300'},pDate:{value:'2026-08-18'},pMethod:{value:'Банк'}
};
const renders=[];
const notices=[];
let postPaymentRefreshes=0;
const context={
  console,setTimeout,clearTimeout,Intl,URL,crypto,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  location:{reload(){throw new Error('payment flow must not reload the page');}},
  navigator:{},
  document:{
    visibilityState:'visible',
    getElementById:id=>fields[id]||null,
    querySelector:()=>({disabled:false,textContent:'Төлөх'}),
    addEventListener(){},body:{style:{}},documentElement:{style:{}},elementFromPoint(){return null;}
  }
};
context.window=context;
context.window.__nayadUser={id:userId};
context.window.addEventListener=()=>{};
context.window.__nayadRefreshPaymentView=()=>{postPaymentRefreshes++;};
context.window.toast=message=>notices.push(message);
context.window.closeSheet=()=>{};
context.window.nayadSupabase={
  auth:{getSession:async()=>({data:{session:{user:{id:userId}}}})},
  rpc:async(name,args)=>{
    if(name==='get_my_store')return {data:[{id:'store-1'}],error:null};
    if(name==='record_supplier_payment'){
      latestPaymentId=args.p_payment_id;
      return {data:[{payment_id:latestPaymentId,remaining_balance:server.remaining}],error:null};
    }
    throw new Error('Unexpected RPC: '+name);
  },
  from:table=>query(table)
};

vm.createContext(context);
vm.runInContext(`
  let data=${JSON.stringify(initial)};
  let selected=null;
  let page='home';
  function sync(){for(const c of data.companies)c.debt=c.invoices.reduce((s,i)=>s+Number(i.amount)-Number(i.paid),0)}
  function render(){sync();renders.push(data.companies.find(c=>c.id===1).debt)}
`,context);
context.renders=renders;
vm.runInContext(fs.readFileSync(path.join(root,'app-state.js'),'utf8'),context,{filename:'app-state.js'});
vm.runInContext(fs.readFileSync(path.join(root,'invoice-cloud.js'),'utf8'),context,{filename:'invoice-cloud.js'});

(async()=>{
  await context.window.savePayment();
  const saved=JSON.parse(storage.get(localKey));
  const liveDebt=vm.runInContext('data.companies.find(c=>c.id===1).debt',context);
  const livePaid=vm.runInContext('data.companies.find(c=>c.id===1).invoices[0].paid',context);
  assert.equal(saved.companies[0].debt,14200,'local balance must equal the RPC result');
  assert.equal(saved.companies[0].invoices[0].paid,85800,'local invoice paid amount must be authoritative');
  assert.equal(liveDebt,14200,'visible state must update without reload');
  assert.equal(livePaid,85800,'visible invoice must update without reload');
  assert.equal(saved.payments.filter(p=>p.id===latestPaymentId).length,1,'payment must not be duplicated');
  assert.equal(renders.at(-1),14200,'last rendered balance must be authoritative');
  assert.match(notices.at(-1),/14,200|14 200|14 200/,'success message must show the same balance');
  assert.equal(postPaymentRefreshes,1,'committed payment must refresh even when verification read fails');
  console.log('payment-flow: PASS — server, storage and visible UI all remain at 14,200 ₮');
})().catch(error=>{console.error(error);process.exitCode=1;});
