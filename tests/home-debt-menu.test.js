const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'contact-types.js'),'utf8');
const indexSource=fs.readFileSync(path.join(root,'index.html'),'utf8');
const stored={};
let renders=0;

const addDays=days=>{
  const now=new Date(),date=new Date(now.getFullYear(),now.getMonth(),now.getDate()+days);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
const invoice=(id,due,status='confirmed')=>({id,no:id,due_date:due,amount:100,paid:0,status});
const companies=[
  {id:1,name:'Alpha',contactType:'organization',debt:100,invoices:[invoice('A',addDays(3))]},
  {id:2,name:'Beta',contactType:'organization',debt:500,invoices:[invoice('B',addDays(20))]},
  {id:3,name:'Gamma',contactType:'organization',debt:300,invoices:[invoice('C',addDays(-2))]},
  {id:4,name:'Delta',contactType:'organization',debt:200,invoices:[invoice('D',null)]},
  {id:5,name:'Paid',contactType:'organization',debt:0,invoices:[{...invoice('E',addDays(1)),paid:100}]},
  {id:6,name:'Draft',contactType:'organization',debt:0,invoices:[invoice('F',addDays(2),'draft')]},
  {id:7,name:'Cancelled',contactType:'organization',debt:0,invoices:[invoice('G',addDays(2),'cancelled')]}
];

const context={
  console,Date,Number,String,Math,Intl,Array,JSON,
  document:{
    head:{appendChild(){}},
    getElementById:id=>id==='nayadContactTypeStyle'?null:null,
    createElement:()=>({id:'',textContent:''}),
    querySelectorAll:()=>[],
    addEventListener(){}
  },
  localStorage:{getItem:key=>stored[key]||null,setItem:(key,value)=>{stored[key]=String(value);}},
  setTimeout:()=>1,clearTimeout(){},
  data:{companies,payments:[]},
  render(){renders++;},sync(){},save(){},sheet(){},closeSheet(){},toast(){},
  money:value=>`${value} ₮`,tel:()=>'',escapeHtml:value=>String(value??''),
  bankSelect:()=>'',bankAccountField:()=>'',v:()=>'',window:null
};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'contact-types.js'});

const controls=context.__nayadHomeDebtControls();
for(const label of ['Бүгд','7 хоногт төлөх','1 сард төлөх','Төлөх хугацаа хамгийн ойр','Хугацаа хэтэрсэн','Хугацаагүй','Их өртэй','Нэрээр A–Я'])assert.match(controls,new RegExp(label));
assert.equal((controls.match(/homeDebtMenuIcon/g)||[]).length,8,'every menu row must have a leading icon');
assert.doesNotMatch(controls,/ЭРЭМБЭЛЭХ|ХУГАЦААГААР ШҮҮХ|<hr/,'the anchored menu must contain only the approved list');
assert.match(controls,/homeDebtMenu hide/,'the list must open as an anchored dropdown, not a bottom sheet');
assert.match(source,/if\(!event\.target\?\.closest\?\.\('\.homeUrgentHead'\)\)closeHomeDebtMenu/,'outside taps must close the dropdown');
assert.match(source,/event\.key==='Escape'/,'Escape must close the dropdown');
assert.match(indexSource,/class="title homeUrgentHead"/);
assert.doesNotMatch(indexSource,/filter\(c=>c\.debt>0\)\.slice\(0,4\)/,'matching home debts must not be silently limited to four');

context.setHomeDebtView('next7');
assert.deepEqual(Array.from(context.__nayadHomeDebtList(companies),row=>row.name),['Alpha']);
context.setHomeDebtView('next30');
assert.deepEqual(Array.from(context.__nayadHomeDebtList(companies),row=>row.name),['Alpha','Beta']);
context.setHomeDebtView('overdue');
assert.deepEqual(Array.from(context.__nayadHomeDebtList(companies),row=>row.name),['Gamma']);
context.setHomeDebtView('missing');
assert.deepEqual(Array.from(context.__nayadHomeDebtList(companies),row=>row.name),['Delta']);
context.setHomeDebtView('debt');
assert.deepEqual(Array.from(context.__nayadHomeDebtList(companies),row=>row.name),['Beta','Gamma','Delta','Alpha']);
context.setHomeDebtView('name');
assert.deepEqual(Array.from(context.__nayadHomeDebtList(companies),row=>row.name),['Alpha','Beta','Delta','Gamma']);
context.setHomeDebtView('name');
assert.deepEqual(Array.from(context.__nayadHomeDebtList(companies),row=>row.name),['Gamma','Delta','Beta','Alpha']);
assert.equal(stored.NAYAD_HOME_DEBT_VIEW,'name-desc');
assert.equal(renders,7);

console.log('home-debt-menu: PASS — anchored icon menu, date filters, amount sort and name toggle are correct');
