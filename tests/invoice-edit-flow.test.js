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
const uploads=[];
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
  storage:{from:()=>({
    remove:async()=>({error:null}),
    upload:async(path,content,options)=>{uploads.push({path,content,options});return {error:null};},
    getPublicUrl:path=>({data:{publicUrl:'https://storage.test/'+path}})
  })}
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
  values.invoiceEditPreviews={innerHTML:''};
  const validBytes=new Uint8Array([255,216,255,217]).buffer;
  const validImage={name:'photo.jpg',type:'image/jpeg',arrayBuffer:async()=>validBytes};
  for(const arrayBuffer of [async()=>new ArrayBuffer(0),async()=>{throw new Error('Camera file unavailable');}]){
    context.window.selectInvoiceEditFiles([validImage,{name:'empty.jpg',type:'image/jpeg',arrayBuffer}]);
    await context.window.saveConfirmedInvoiceRevision(invoice.id);
    assert.equal(uploads.length,0,'validate all pages before any upload');
    assert.equal(rpcCalls.length,1,'unreadable images must not change the existing invoice');
    assert.match(notices.at(-1),/2-р зургийг уншиж чадсангүй/);
    assert.equal(values.saveInvoiceRevisionBtn.disabled,false,'allow correcting the image and retrying');
  }
  context.window.removeInvoiceEditFile(1);
  await context.window.saveConfirmedInvoiceRevision(invoice.id);
  assert.equal(uploads.length,1,'adding a photo later must upload once');
  assert.equal(uploads[0].content,validBytes,'upload stable bytes instead of the temporary File');
  assert.equal(uploads[0].options.contentType,'image/jpeg');
  assert.equal(rpcCalls.length,2);
  assert.equal(rpcCalls[1].args.p_images.length,1);
  assert.equal(rpcCalls[1].args.p_images[0].page_number,1);
  assert.equal(invoice.paid,455000,'image edits must not change paid money');
  context.window.selectInvoiceEditFiles([{name:'empty.jpg',type:'image/jpeg',arrayBuffer:async()=>new ArrayBuffer(0)}]);
  context.window.removeInvoiceEditFile(0);
  await context.window.saveConfirmedInvoiceRevision(invoice.id);
  assert.equal(rpcCalls.at(-1).args.p_images,null,'no selected photo remains optional');
  assert.equal(uploads.length,1);
  console.log('invoice-edit-flow: PASS — paid totals are protected and valid edits preserve payments');
})().catch(error=>{console.error(error);process.exitCode=1;});
