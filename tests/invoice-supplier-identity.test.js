const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

const root=path.resolve(__dirname,'..');
const userId='user-1';
const storeId='store-1';
const supplierId='supplier-maximus';
const localKey=`NAYAD_DATA_V4:${userId}:${storeId}`;
const initial={
  companies:[{id:42,name:'maximus',supabase_supplier_id:supplierId,color:'green',status:'active',invoices:[]}],
  payments:[]
};
const storage=new Map([[localKey,JSON.stringify(initial)]]);
const notices=[];
const draftSaves=[];
const imageRowInserts=[];
const imageUploads=[];
let activeStoreId=storeId;
let sheetHtml='';
let closeCount=0;

function deferred(){
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

const elements={
  cloudGalleryInput:{files:[],value:'',onchange:null},
  cloudCameraInput:{files:[],value:'',onchange:null},
  cloudImageList:{innerHTML:'',style:{},addEventListener(){},querySelectorAll(){return[];}},
  cloudIDate:{value:'2026-08-20'},
  cloudIDueDate:{value:'2026-08-30'},
  cloudINo:{value:'INV-0001'},
  cloudIAmount:{value:'1000000'},
  cloudIDiscount:{value:'4'},
  cloudIDiscountDeadline:{value:'2026-08-25'},
  cloudSaveInvoiceBtn:{disabled:false,textContent:'Ноорог хадгалах'},
  cloudConfirmInvoiceBtn:{disabled:false,textContent:'Баталгаажуулах'}
};

const supplierRow={
  id:supplierId,name:'maximus',reg_no:null,address:null,director:null,director_phone:null,
  sales_rep:null,sales_phone:null,org_phone:null,bank_name:null,bank_account:null,is_active:true,
  created_at:'2026-08-20T00:00:00Z'
};

function query(table){
  const q={
    select(){return q;},
    eq(){return q;},
    order(){return q;},
    in(){return q;},
    limit(){return q;},
    maybeSingle(){
      if(table==='suppliers')return Promise.resolve({data:{id:supplierId,name:'maximus'},error:null});
      return Promise.resolve({data:null,error:null});
    },
    insert(payload){
      if(table==='invoice_images')imageRowInserts.push(payload);
      return Promise.resolve({data:null,error:null});
    },
    update(){return q;},
    delete(){return q;},
    then(resolve,reject){
      let response={data:[],error:null};
      if(table==='suppliers')response={data:[supplierRow],error:null};
      return Promise.resolve(response).then(resolve,reject);
    }
  };
  return q;
}

const testURL={
  createObjectURL:()=>`blob:test-${Math.random()}`,
  revokeObjectURL(){}
};

const context={
  console,Intl,URL:testURL,crypto:webcrypto,
  setTimeout:()=>1,clearTimeout(){},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  location:{reload(){}},
  navigator:{},
  document:{
    visibilityState:'visible',
    getElementById:id=>elements[id]||null,
    querySelector:()=>null,
    addEventListener(){},
    body:{style:{}},
    documentElement:{style:{}},
    elementFromPoint(){return null;}
  }
};
context.window=context;
context.window.__nayadUser={id:userId};
context.window.__nayadActiveStoreId=storeId;
context.window.__nayadActiveStore={id:storeId,name:'Namka store'};
context.window.__nayadStoreDataKey=()=>localKey;
context.window.__nayadGetActiveStore=async()=>({id:activeStoreId,name:activeStoreId===storeId?'Namka store':'Other store'});
context.window.addEventListener=()=>{};
context.window.sheet=html=>{sheetHtml=html;};
context.window.closeSheet=()=>{closeCount++;};
context.window.toast=message=>notices.push(message);
context.window.compressInvoiceImage=async file=>file;
context.window.nayadSupabase={
  auth:{getSession:async()=>({data:{session:{user:{id:userId}}},error:null})},
  rpc:async(name,args)=>{
    if(name==='save_invoice_draft'){draftSaves.push(args);return {data:[{invoice_id:args.p_invoice_id,invoice_status:'draft'}],error:null};}
    if(name==='confirm_invoice')return {data:[{invoice_id:args.p_invoice_id,invoice_status:'confirmed'}],error:null};
    if(name==='delete_invoice_draft')return {data:true,error:null};
    throw new Error('Unexpected RPC: '+name);
  },
  from:table=>query(table),
  storage:{from:bucket=>({
    upload:async(path,file,options)=>{imageUploads.push({bucket,path,file,options});return {error:null};},
    getPublicUrl:path=>({data:{publicUrl:`https://storage.test/${path}`}}),
    remove:async()=>({error:null})
  })}
};

vm.createContext(context);
vm.runInContext(`
  let data=${JSON.stringify(initial)};
  let selected=null;
  let page='companies';
  function render(){}
`,context);
vm.runInContext(fs.readFileSync(path.join(root,'app-state.js'),'utf8'),context,{filename:'app-state.js'});
vm.runInContext(fs.readFileSync(path.join(root,'invoice-cloud.js'),'utf8'),context,{filename:'invoice-cloud.js'});

(async()=>{
  await context.window.__nayadSyncInvoices();
  let saved=JSON.parse(storage.get(localKey));
  assert.equal(saved.companies.length,1,'a supplier with no financial rows must survive invoice sync');
  assert.equal(saved.companies[0].supabase_supplier_id,supplierId);
  assert.equal(saved.companies[0].id,42,'sync must preserve the supplier local ID when possible');

  context.window.invoice(42);
  assert.match(sheetHtml,/maximus/,'the invoice sheet must capture the selected supplier');

  const imageFile={name:'maximus-page-1.jpg',type:'image/jpeg',size:128};
  elements.cloudGalleryInput.files=[imageFile];
  elements.cloudGalleryInput.onchange();
  assert.match(elements.cloudImageList.innerHTML,/maximus-page-1\.jpg/,'the selected image must be staged in the invoice sheet');

  /* Hold the shared cloud queue so Cancel/reopen and a foreground state rebuild
     happen after Save snapshots the supplier and files, but before its task runs. */
  const gate=deferred();
  context.window.__nayadCloudSyncQueue=gate.promise;
  const savePromise=context.window.__saveCloudInvoice();
  assert.equal(draftSaves.length,0,'the invoice write must wait for the existing cloud queue');

  const sheetWhileSaving=sheetHtml;
  context.window.__cancelCloudInvoice();
  context.window.invoice(777);
  assert.equal(sheetHtml,sheetWhileSaving,'cancel/reopen must not replace the invoice sheet while saving');
  assert.equal(closeCount,0,'cancel must not close a saving invoice');
  assert.equal(notices.filter(message=>/хадгалагдаж байна/.test(message)).length,2,'cancel and reopen must both be blocked while saving');

  /* Reproduce the original race: while the sheet is open, a foreground sync
     rebuilds the same cloud supplier with a different disposable local ID. */
  const rebuilt={companies:[{...saved.companies[0],id:99,invoices:[]}],payments:[]};
  context.window.__nayadState.commit(rebuilt,{render:false});
  gate.resolve();
  await savePromise;

  assert.equal(draftSaves.length,2,'the draft is saved once, then linked to its uploaded cover image');
  assert.equal(draftSaves[0].p_supplier_id,supplierId,'save must use the stable Supabase supplier UUID');
  assert.equal(draftSaves[0].p_due_date,'2026-08-30');
  assert.equal(draftSaves[0].p_discount_percent,4);
  assert.equal(draftSaves[0].p_image_url,null);
  assert.match(draftSaves[1].p_image_url,/storage\.test/);
  assert.equal(imageUploads.length,1,'the image staged before queueing must upload exactly once');
  assert.equal(imageUploads[0].bucket,'invoice-images');
  assert.equal(imageUploads[0].file,imageFile);
  assert.match(imageUploads[0].path,new RegExp(`^${storeId}/${supplierId}/${draftSaves[0].p_invoice_id}/page-1-`));
  assert.equal(imageRowInserts.length,1,'the uploaded image must create exactly one invoice_images row');
  assert.equal(imageRowInserts[0].invoice_id,draftSaves[0].p_invoice_id);
  assert.equal(imageRowInserts[0].page_number,1);
  assert.equal(notices.some(message=>/Нийлүүлэгч олдсонгүй/.test(message)),false);
  saved=JSON.parse(storage.get(localKey));
  assert.equal(saved.companies.length,1,'saving must not duplicate the reconstructed supplier');
  assert.equal(saved.companies[0].id,99);
  assert.equal(saved.companies[0].invoices.length,1);

  context.window.invoice(99);
  activeStoreId='store-2';
  context.window.__nayadActiveStoreId='store-2';
  await context.window.__saveCloudInvoice();
  assert.equal(draftSaves.length,2,'an invoice sheet opened in another store must not insert');
  assert.match(notices.at(-1),/Дэлгүүр солигдсон/);

  console.log('invoice-supplier-identity: PASS — queued save snapshots stable supplier/image identity and blocks cancel/reopen races');
})().catch(error=>{console.error(error);process.exitCode=1;});
