const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','contact-types.js'),'utf8');
let sheetHtml='';
const values={};
const data={companies:[],payments:[]};
const context={
  console,document:{
    head:{appendChild(){}},
    getElementById:id=>id==='nayadContactTypeStyle'?null:{value:values[id]||''},
    createElement:()=>({id:'',textContent:'',appendChild(){}})
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
assert.match(source,/\.contactTypeOption\{appearance:none;background:transparent;border:0/);

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
data.companies.push({id:3,name:'Minimal',contactType:'organization',status:'active',invoices:[],debt:0});
const companiesHtml=context.companies();
assert.match(companiesHtml,/contactListRow/);
assert.doesNotMatch(companiesHtml,/class="card"/);
assert.match(source,/window\.filter=filterContacts/);

console.log('contact-types: PASS — minimal type picker, forms and divider list are wired');
