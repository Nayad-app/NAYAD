const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'contact-types.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260921121041_add_supplier_iban.sql'),'utf8');
const values={eBankIban:'6900 0500',eBankAccount:'5125-107254'};
const copied=[];
const toasts=[];
const context={
  console,Intl,setTimeout:()=>1,clearTimeout(){},
  navigator:{clipboard:{writeText:async value=>copied.push(value)}},
  localStorage:{getItem:()=>null,setItem(){}},
  document:{
    head:{appendChild(){}},body:{appendChild(){}},addEventListener(){},querySelectorAll:()=>[],
    createElement:()=>({id:'',textContent:'',style:{},setAttribute(){},select(){},remove(){}}),
    getElementById:id=>id==='nayadContactTypeStyle'?null:{value:values[id]||'',classList:{contains:()=>false,add(){},remove(){},toggle(){}},setAttribute(){}}
  },
  data:{companies:[],payments:[]},selected:null,page:'home',
  sheet(){},closeSheet(){},save(){},render(){},sync(){},money:n=>String(n),tel:()=>'',
  escapeHtml:value=>String(value??''),bankSelect:()=>'',v:id=>values[id]||'',toast:message=>toasts.push(message)
};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'contact-types.js'});

(async()=>{
  assert.match(source,/IBAN — заавал биш/);
  assert.match(source,/Хуулах тэмдэг дарвал IBAN болон дансны дугаар хамт хуулагдана\./);
  assert.match(source,/copyBankIban\('\$\{prefix\}BankIban','\$\{prefix\}BankAccount'\)/);
  assert.match(source,/copyBankAccount\('\$\{prefix\}BankAccount'\)/);
  await context.copyBankIban('eBankIban','eBankAccount');
  await context.copyBankAccount('eBankAccount');
  assert.deepEqual(copied,['MN690005005125107254','5125107254']);
  assert.deepEqual(toasts,['IBAN болон дансны дугаар хуулагдлаа.','Дансны дугаар хуулагдлаа.']);
  assert.match(migration,/add column if not exists bank_iban text/i);
  console.log('supplier-iban: PASS — optional prefix and both copy modes use the approved values');
})().catch(error=>{console.error(error);process.exitCode=1;});
