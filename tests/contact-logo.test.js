const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const userId='logo-user';
const storeId='11111111-1111-4111-8111-111111111111';
const supplierId='22222222-2222-4222-8222-222222222222';
const key='NAYAD_DATA_V3:'+userId;
const logoBytes=new Uint8Array([137,80,78,71]).buffer;
const logoFile={type:'image/png',size:1200,name:'logo.png',arrayBuffer:async()=>logoBytes};
const state={companies:[{id:1,supabase_supplier_id:supplierId,name:'Эра жимс',contactType:'organization',logoPath:`${storeId}/old.png`,logoUrl:'https://signed.test/old',invoices:[]}],payments:[]};
const storage=new Map([[key,JSON.stringify(state)]]);
const values={eContactType:'organization',eName:'Эра жимс',ePhone:'88888888',eAddress:'',eDirector:'',eDirectorPhone:'',eSales:'',eSalesPhone:'',eNote:'',eBank:'ХААН банк',eBankAccount:'5000000000',eBankAccountHolder:'Эра жимс',eStatus:'active'};
const uploads=[],removals=[],updates=[];
let supplier={id:supplierId,store_id:storeId,name:'Эра жимс',contact_type:'organization',logo_path:`${storeId}/old.png`};
let originalSaveCalls=0;

function supplierQuery(kind,body){
  const response=()=>({data:{...supplier},error:null});
  const q={
    select(){return q;},eq(){return q;},ilike(){return q;},limit(){return q;},
    maybeSingle:async()=>response(),
    single:async()=>{if(kind==='update'){supplier={...supplier,...body};updates.push(body);}return response();},
    then(resolve,reject){if(kind==='update'){supplier={...supplier,...body};updates.push(body);}return Promise.resolve(response()).then(resolve,reject);}
  };
  return q;
}

const context={
  console,Intl,Math,
  crypto:{randomUUID:()=> '33333333-3333-4333-8333-333333333333'},
  setTimeout:fn=>{fn();return 1;},clearTimeout(){},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  document:{getElementById:id=>Object.prototype.hasOwnProperty.call(values,id)?{value:values[id]}:null},
  MutationObserver:function(){this.observe=()=>{};}
};
context.window=context;
context.window.__nayadUser={id:userId};
context.window.__nayadActiveStore={id:storeId,name:'Store',registration_completed_at:'2026-09-11T00:00:00Z'};
context.window.__nayadGetActiveStore=async()=>context.window.__nayadActiveStore;
context.window.__nayadGetContactLogoChange=()=>({file:logoFile,remove:false});
context.window.addEventListener=()=>{};
context.window.saveEdit=()=>{originalSaveCalls++;};
context.window.toast=()=>{};
context.window.nayadSupabase={
  auth:{getSession:async()=>({data:{session:{user:{id:userId}}}})},
  from:table=>{
    assert.equal(table,'suppliers');
    return {select(){return supplierQuery('select');},update(body){return supplierQuery('update',body);},insert(){throw new Error('edit must not insert a duplicate supplier');}};
  },
  storage:{from(bucket){
    assert.equal(bucket,'contact-logos');
    return {
      upload:async(filePath,content,options)=>{uploads.push({filePath,content,options});return {data:{path:filePath},error:null};},
      remove:async paths=>{removals.push(...paths);return {data:{},error:null};},
      createSignedUrl:async filePath=>({data:{signedUrl:'https://signed.test/'+encodeURIComponent(filePath)},error:null})
    };
  }}
};

vm.createContext(context);
vm.runInContext(`let selected=${JSON.stringify(state.companies[0])};`,context);
vm.runInContext(fs.readFileSync(path.join(root,'supplier-cloud.js'),'utf8'),context,{filename:'supplier-cloud.js'});

(async()=>{
  await context.window.saveEdit();
  assert.equal(originalSaveCalls,1,'local edit must complete after cloud logo save');
  assert.equal(uploads.length,1,'new logo must upload once');
  assert.equal(uploads[0].content,logoBytes,'iOS-safe upload must send non-empty binary content instead of a detached File body');
  assert.equal(uploads[0].options.upsert,false,'logo replacement must use a unique path instead of stale CDN upsert');
  assert.match(uploads[0].filePath,new RegExp(`^${storeId}/${supplierId}-33333333-3333-4333-8333-333333333333\\.png$`));
  assert.ok(updates.some(update=>update.logo_path===uploads[0].filePath),'supplier row must point to the new logo path');
  assert.ok(removals.includes(`${storeId}/old.png`),'old logo must be removed only after the new path is saved');
  const selected=vm.runInContext('selected',context);
  assert.equal(selected.logoPath,uploads[0].filePath);
  assert.match(selected.logoUrl,/^https:\/\/signed\.test\//);
  console.log('contact-logo: PASS — private logo replacement updates the supplier and cleans the old file');
})().catch(error=>{console.error(error);process.exitCode=1;});
