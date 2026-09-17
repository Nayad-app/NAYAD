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
const invoice=(id,due,status='confirmed',date='2026-08-01')=>({id,no:id,due_date:due,date,amount:100,paid:0,status});
const companies=[
  {id:1,name:'Alpha',contactType:'organization',debt:100,invoices:[invoice('A',addDays(3),'confirmed','2026-08-08')]},
  {id:2,name:'Beta',contactType:'organization',debt:500,invoices:[invoice('B',addDays(20),'confirmed','2026-08-03')]},
  {id:3,name:'Gamma',contactType:'organization',debt:300,invoices:[invoice('C',addDays(-2),'confirmed','2026-08-05')]},
  {id:4,name:'Delta',contactType:'organization',debt:200,invoices:[invoice('D',null,'confirmed','2026-08-01')]},
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
for(const label of ['Бүгд','7 хоногт төлөх','1 сард төлөх','Төлөх хугацаа хамгийн ойр','Хугацаа хэтэрсэн','Хугацаагүй','Их өртэй','Анх авсан огноо ↑','Нэрээр A–Я'])assert.match(controls,new RegExp(label));
assert.equal((controls.match(/homeDebtMenuIcon/g)||[]).length,9,'every menu row must have a leading icon');
assert.equal((controls.match(/class="homeQuickFilter /g)||[]).length,5,'five compact quick-filter icons must be visible in the title row');
assert.doesNotMatch(controls,/homeQuickFilter[^>]*>[^<]*Бүгд/,'quick filters must display icons only');
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
context.setHomeDebtView('invoice-date');
assert.deepEqual(Array.from(context.__nayadHomeDebtList(companies),row=>row.name),['Delta','Beta','Gamma','Alpha']);
assert.match(context.__nayadHomeDebtControls(),/Анх авсан огноо ↑/);
context.setHomeDebtView('invoice-date');
assert.deepEqual(Array.from(context.__nayadHomeDebtList(companies),row=>row.name),['Alpha','Gamma','Beta','Delta']);
assert.match(context.__nayadHomeDebtControls(),/Анх авсан огноо ↓/);
assert.equal(stored.NAYAD_HOME_DEBT_VIEW,'invoice-date-desc');
const todayCompany={id:8,name:'Today',contactType:'organization',debt:250,invoices:[invoice('TODAY',addDays(0))]};
context.setHomeDebtView('today');
assert.deepEqual(Array.from(context.__nayadHomeDebtList([...companies,todayCompany]),row=>row.name),['Today']);
const todaySummary=context.__nayadTodayDebtSummary([...companies,todayCompany]);
assert.equal(todaySummary.amount,100);
assert.equal(todaySummary.count,1);
context.setHomeDebtView('all');
const homeCard=context.card(companies[0],true);
assert.doesNotMatch(homeCard,/Төлөх<\/button>|Байгууллага|Дугааргүй|13 хоногийн дараа/,'home cards must keep only the compact approved content');
assert.match(homeCard,/homeDebtChevron/,'the whole compact card must advertise navigation');
const colorCard=(id,date,due)=>context.card({id,name:`Color ${id}`,contactType:'organization',debt:100,invoices:[invoice(id,due,'confirmed',date)]},true);
assert.match(colorCard('GREEN',addDays(0),addDays(30)),/style="color:#16A34A"/,'the first day must be green');
assert.match(colorCard('YELLOW',addDays(-30),addDays(30)),/style="color:#EAB308"/,'the midpoint of any invoice term must be yellow');
assert.match(colorCard('RED',addDays(-30),addDays(0)),/style="color:#DC2626"/,'the due date must be red');
const overdueColorCard=colorCard('BROWN',addDays(-31),addDays(-1));
assert.match(overdueColorCard,/style="color:#8B2B22"/,'the day after the due date must be dark red-brown');
assert.match(overdueColorCard,new RegExp(`Төлөх өдөр ${addDays(-1).replaceAll('-','\\.')}`),'only overdue cards must show their due date below the total');
const mixedRiskCard=context.card({id:99,name:'Mixed',contactType:'organization',debt:200,invoices:[invoice('SAFE',addDays(30),'confirmed',addDays(0)),invoice('LATE',addDays(-1),'confirmed',addDays(-31))]},true);
assert.match(mixedRiskCard,/style="color:#8B2B22"/,'a contact total must use the riskiest unpaid invoice color');
assert.equal(renders,11);

console.log('home-debt-menu: PASS — anchored icon menu, date filters, amount sort and name toggle are correct');
