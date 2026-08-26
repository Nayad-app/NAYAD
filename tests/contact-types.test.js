const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','contact-types.js'),'utf8');
let sheetHtml='';
const values={};
const data={companies:[],payments:[]};
const typeButtons=['person','organization'].map(type=>{
  const button={dataset:{contactType:type},selected:false,attributes:{}};
  button.classList={toggle(name,value){if(name==='selected')button.selected=Boolean(value);}};
  button.setAttribute=(name,value)=>{button.attributes[name]=value;};
  return button;
});
const context={
  console,document:{
    head:{appendChild(){}},
    getElementById:id=>id==='nayadContactTypeStyle'?null:{value:values[id]||''},
    createElement:()=>({id:'',textContent:'',appendChild(){}}),
    querySelectorAll:selector=>selector==='.contactTypeOption'?typeButtons:[]
  },
  setTimeout:()=>1,
  window:null,
  data,
  sheet:html=>{sheetHtml=html},
  closeSheet(){},
  toast(){},
  save(){},
  render(){},
  sync(){},
  money:n=>`${n} ₮`,
  tel:()=>'<span>—</span>',
  escapeHtml:value=>String(value??''),
  bankSelect:(id,label,value='')=>`<div data-bank="${id}">${label}:${value}</div>`,
  bankAccountField:(id,value='')=>`<input id="${id}" value="${value}">`,
  v:id=>values[id]||''
};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'contact-types.js'});

context.showContactTypePicker();
assert.match(sheetHtml,/Хувь хүн/);
assert.match(sheetHtml,/Байгууллага/);
assert.match(sheetHtml,/contactTypeOption/);
assert.match(sheetHtml,/contactTypeIcon/);
assert.doesNotMatch(sheetHtml,/Хувийн харилцагч/);
assert.doesNotMatch(sheetHtml,/Дэлгүүр, компани/);
assert.match(source,/\.contactTypeOption\{appearance:none;background:transparent;border:0/);
context.selectContactType('person');
assert.equal(typeButtons[0].selected,true);
assert.equal(typeButtons[0].attributes['aria-pressed'],'true');
assert.equal(typeButtons[1].selected,false);
assert.match(source,/\.contactTypeOption\.selected \.contactTypeIcon/);

context.showContactForm('person');
assert.match(sheetHtml,/Хувь хүн бүртгэх/);
assert.match(sheetHtml,/Нэмэлт тэмдэглэл/);
assert.doesNotMatch(sheetHtml,/Регистр/);
assert.match(sheetHtml,/Данс эзэмшигчийн нэр/);

context.showContactForm('organization');
assert.match(sheetHtml,/Байгууллага бүртгэх/);
assert.match(sheetHtml,/Захирал/);
assert.match(sheetHtml,/Захирлын утас/);
assert.match(sheetHtml,/Худалдааны төлөөлөгч/);
assert.match(sheetHtml,/ХТ-ийн утас/);
assert.doesNotMatch(sheetHtml,/Регистр/);

const card=vm.runInContext('card({id:1,name:"Бат",contactType:"person",invoices:[],debt:0})',context);
assert.match(card,/Хувь хүн/);
assert.match(card,/<svg/);
const orgCard=vm.runInContext('card({id:2,name:"MCS",contactType:"organization",invoices:[],debt:0})',context);
assert.match(orgCard,/Байгууллага/);
const dueCard=vm.runInContext('card({id:4,name:"Due customer",contactType:"organization",invoices:[{id:"i1",no:"INV-2045",due_date:"2099-09-01",amount:1000,paid:0}],debt:1000},true)',context);
assert.match(dueCard,/INV-2045/);
assert.match(dueCard,/Төлөх өдөр <b>2099\.09\.01<\/b>/);
assert.match(dueCard,/homeDueState future/);
data.companies.push({id:3,name:'Minimal',contactType:'organization',status:'active',invoices:[],debt:0});
const companiesHtml=context.companies();
assert.match(companiesHtml,/contactListRow/);
assert.doesNotMatch(companiesHtml,/class="card"/);
assert.match(companiesHtml,/НЭГДСЭН ЖАГСААЛТ/);
assert.match(companiesHtml,/Нэр эсвэл утасны дугаараар хайх/);
assert.match(companiesHtml,/data-contact-filter="person"/);
assert.match(companiesHtml,/data-contact-filter="organization"/);
assert.match(companiesHtml,/ХАРИЛЦАГЧ НЭМЭХ/);
assert.match(source,/window\.filter=filterContacts/);
assert.match(source,/contact\.phone,contact\.directorPhone,contact\.salesPhone/,'search must include contact phone fields');
assert.match(source,/window\.setContactListFilter=setContactListFilter/);

console.log('contact-types: PASS — contact picker, unified search, type filters and cards are wired');
