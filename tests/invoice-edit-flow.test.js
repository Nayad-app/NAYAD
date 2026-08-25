const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

const root=path.resolve(__dirname,'..');
const invoice={
  id:'11111111-1111-4111-8111-111111111111',no:'INV-PAID',date:'2026-08-01',due_date:'2026-08-30',
  amount:1500000,paid:455000,status:'confirmed',discount_percent:0,note:'Хуучин тэмдэглэл',image_paths:[]
};
const state={companies:[{id:1,supabase_supplier_id:'22222222-2222-4222-8222-222222222222',name:'Paid Supplier',invoices:[invoice]}],payments:[]};
const values={};
const notices=[];
const rpcCalls=[];
let sheetHtml='';
let syncCount=0;

const context={
  console,Intl,Date,Number,String,Math,JSON,Promise,crypto:webcrypto,
  URL:{createObjectURL:()=>'',revokeObjectURL(){}},
  setTimeout:()=>1,clearTimeout(){},navigator:{},Notification:{permission:'denied'},
  document:{
    visibilityState:'visible',head:{appendChild(){}},createElement:()=>({textContent:''}),addEventListener(){},querySelectorAll:()=>[],
    getElementById:id=>values[id]||null
  }
};
context.window=context;
context.window.addEventListener=()=>{};
context.window.__nayadState={read:()=>state};
context.window.__nayadActiveStoreId='33333333-3333-4333-8333-333333333333';
context.window.__nayadStartCloudSync=async()=>{syncCount++;};
context.window.sheet=html=>{sheetHtml=html;};
context.window.closeSheet=()=>{};
context.window.toast=message=>notices.push(message);
context.window.nayadSupabase={
  rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:[{invoice_id:invoice.id,invoice_status:'confirmed'}],error:null};},
  from:()=>({select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});}}),
  storage:{from:()=>({remove:async()=>({error:null})})}
};

vm.createContext(context);
vm.runInContext(`
  let data=${JSON.stringify(state)};
  let page='companies';
  let selected=null;
  function render(){}
  function payments(){}
  function reports(){}
  function company(){}
  function payment(){}
  function sync(){}
`,context);
vm.runInContext(fs.readFileSync(path.join(root,'payment-center.js'),'utf8'),context,{filename:'payment-center.js'});

context.window.editConfirmedInvoice(invoice.id);
assert.match(sheetHtml,/Падаан засах/);
assert.match(sheetHtml,/455,000|455 000|455 000/,'the edit sheet must show the already-paid amount');
assert.match(sheetHtml,/Төлсөн мөнгө өөрчлөгдөхгүй/);

Object.assign(values,{
  reviseInvoiceDate:{value:'2026-08-02'},
  reviseInvoiceDueDate:{value:'2026-09-01'},
  reviseInvoiceNo:{value:'INV-PAID-EDIT'},
  reviseInvoiceAmount:{value:'400000'},
  reviseInvoiceDiscount:{value:'0'},
  reviseInvoiceDiscountDeadline:{value:''},
  reviseInvoiceNote:{value:'Шинэ тэмдэглэл'},
  saveInvoiceRevisionBtn:{disabled:false,textContent:'ӨӨРЧЛӨЛТИЙГ ХАДГАЛАХ'}
});

(async()=>{
  await context.window.saveConfirmedInvoiceRevision(invoice.id);
  assert.equal(rpcCalls.length,0,'a total below paid must be rejected before the database call');
  assert.match(notices.at(-1),/455,000|455 000|455 000/);

  values.reviseInvoiceAmount.value='1400000';
  await context.window.saveConfirmedInvoiceRevision(invoice.id);
  assert.equal(rpcCalls.length,1);
  assert.equal(rpcCalls[0].name,'edit_confirmed_invoice');
  assert.equal(rpcCalls[0].args.p_amount,1400000);
  assert.equal(rpcCalls[0].args.p_note,'Шинэ тэмдэглэл');
  assert.equal(rpcCalls[0].args.p_images,null,'leaving images untouched must preserve existing image rows');
  assert.equal(syncCount,1);
  assert.match(notices.at(-1),/өөрчлөлт хадгалагдлаа/);
  console.log('invoice-edit-flow: PASS — paid totals are protected and valid edits preserve payments');
})().catch(error=>{console.error(error);process.exitCode=1;});
