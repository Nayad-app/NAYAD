const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const userId='user-duplicate';
const key='NAYAD_DATA_V3:'+userId;
const storage=new Map([[key,JSON.stringify({companies:[{id:1,name:'vitafit',invoices:[]}],payments:[]})]]);
let originalSaveCalls=0;
let message='';

const values={newName:' VITAFIT ',newBank:'',newBankAccount:''};
const context={
  console,Intl,
  setTimeout:()=>1,clearTimeout(){},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  document:{getElementById:id=>Object.prototype.hasOwnProperty.call(values,id)?{value:values[id]}:null},
  MutationObserver:function(){this.observe=()=>{};}
};
context.window=context;
context.window.__nayadUser={id:userId};
context.window.addEventListener=()=>{};
context.window.saveCompany=()=>{originalSaveCalls++;};
context.window.toast=value=>{message=value;};
context.window.nayadSupabase={auth:{getSession:async()=>({data:{session:null}})}};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'supplier-cloud.js'),'utf8'),context,{filename:'supplier-cloud.js'});

(async()=>{
  await context.window.saveCompany();
  assert.equal(originalSaveCalls,0,'duplicate name must not create another local supplier');
  assert.equal(message,'Ийм нэртэй компани бүртгэлтэй байна.');
  console.log('duplicate-supplier: PASS — same name is rejected before save');
})().catch(error=>{console.error(error);process.exitCode=1;});
