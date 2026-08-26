const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','contact-types.js'),'utf8');
const indexSource=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
assert.doesNotMatch(`${source}\n${indexSource}`,/ХТ(?:-|\s|$)/,'user-facing code must spell out худалдааны төлөөлөгч');
let sheetHtml='';
const values={};
const data={companies:[],payments:[]};
const contactListNode={innerHTML:''};
const contactFilterMenuNode={hidden:false,classList:{add(name){if(name==='hide')contactFilterMenuNode.hidden=true;},contains(name){return name==='hide'&&contactFilterMenuNode.hidden;},toggle(name,force){if(name==='hide')contactFilterMenuNode.hidden=Boolean(force);}}};
const contactFilterToggleNode={attributes:{},setAttribute(name,value){this.attributes[name]=value;}};
const classNode=()=>{const names=new Set();return {classList:{add:name=>names.add(name),contains:name=>names.has(name),toggle(name,force){if(force===undefined){if(names.has(name))names.delete(name);else names.add(name);}else if(force)names.add(name);else names.delete(name);return names.has(name);}}};};
const modalNode=classNode(),sheetNode=classNode();
const typeButtons=['person','organization'].map(type=>{
  const button={dataset:{contactType:type},selected:false,attributes:{}};
  button.classList={toggle(name,value){if(name==='selected')button.selected=Boolean(value);}};
  button.setAttribute=(name,value)=>{button.attributes[name]=value;};
  return button;
});
const context={
  console,document:{
    head:{appendChild(){}},
    getElementById:id=>id==='nayadContactTypeStyle'?null:id==='contactUnifiedList'?contactListNode:id==='contactFilterMenu'?contactFilterMenuNode:id==='contactFilterToggle'?contactFilterToggleNode:id==='modal'?modalNode:id==='sheet'?sheetNode:{value:values[id]||''},
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
assert.match(sheetHtml,/Худалдааны төлөөлөгчийн утас/);
assert.doesNotMatch(sheetHtml,/ХТ(?:-|\s|$)/,'the app must not abbreviate худалдааны төлөөлөгч');
assert.match(sheetHtml,/ногоон залгах товч энэ дугаар руу шууд залгана/);
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
data.companies.push({id:3,name:'Minimal',contactType:'organization',phone:'99112233',salesPhone:'88112233',status:'active',invoices:[],debt:0});
const companiesHtml=context.companies();
assert.match(companiesHtml,/contactListRow/);
assert.doesNotMatch(companiesHtml,/class="card"/);
assert.doesNotMatch(companiesHtml,/НЭГДСЭН ЖАГСААЛТ/);
assert.match(companiesHtml,/Нэр эсвэл утасны дугаараар хайх/);
assert.match(companiesHtml,/contactSearchRow/);
assert.match(companiesHtml,/contactFilterToggle/);
assert.match(companiesHtml,/contactFilterMenu hide/);
assert.match(companiesHtml,/data-contact-filter="person"/);
assert.match(companiesHtml,/data-contact-filter="organization"/);
assert.doesNotMatch(companiesHtml,/class="contactFilters"/,'type choices must live inside the anchored filter menu');
assert.match(companiesHtml,/contactListIdentity"><b>Minimal<\/b><span class="contactListDebt">0 ₮<\/span>/);
assert.match(companiesHtml,/href="tel:88112233"/,'organization call button must use only the sales representative phone');
assert.doesNotMatch(companiesHtml,/href="tel:99112233"/,'organization call button must not fall back to the general phone');
assert.doesNotMatch(companiesHtml,/contactListArrow|contactListBalance|Нийт үлдэгдэл/,'compact rows must show only the debt amount and call action');
assert.match(companiesHtml,/ХАРИЛЦАГЧ НЭМЭХ/);
data.companies.push({id:5,name:'Missing sales phone',contactType:'organization',phone:'70001234',salesPhone:'',status:'active',invoices:[],debt:0});
const missingPhoneHtml=context.companies();
assert.match(missingPhoneHtml,/showMissingContactPhone\(5\)/,'the green call icon must remain visible when the sales representative phone is missing');
assert.doesNotMatch(missingPhoneHtml,/href="tel:70001234"/,'a missing sales representative phone must not fall back to the general organization phone');
assert.doesNotMatch(source,/contactCallPlaceholder/,'missing phone rows must never hide the call icon');
context.showMissingContactPhone(5);
assert.match(sheetHtml,/Худалдааны төлөөлөгчийн утас бүртгэгдээгүй/);
assert.match(sheetHtml,/худалдааны төлөөлөгчийн утасны дугаарыг оруулна уу/);
assert.match(sheetHtml,/openMissingContactEdit\(5\)/,'the warning must open the selected contact edit form directly');
assert.equal(modalNode.classList.contains('contactCallNoticeModal'),true);
assert.equal(sheetNode.classList.contains('contactCallNoticeSheet'),true);
context.openMissingContactEdit(5);
assert.match(sheetHtml,/id="eSalesPhone"/);
assert.match(sheetHtml,/Худалдааны төлөөлөгчийн утас/);
assert.equal(modalNode.classList.contains('contactCallNoticeModal'),false);
assert.equal(sheetNode.classList.contains('contactCallNoticeSheet'),false);
data.companies.push({id:4,name:'Person',contactType:'person',phone:'+976 9900-2233',status:'active',invoices:[],debt:25});
context.setContactListFilter('person');
assert.match(contactListNode.innerHTML,/Person/);
assert.match(contactListNode.innerHTML,/href="tel:\+97699002233"/,'person call button must use the person phone');
assert.doesNotMatch(contactListNode.innerHTML,/Minimal/,'the anchored type filter must update the unified list');
assert.equal(contactFilterMenuNode.hidden,true);
assert.equal(contactFilterToggleNode.attributes['aria-expanded'],'false');
assert.match(source,/window\.filter=filterContacts/);
assert.match(source,/contact\.phone,contact\.directorPhone,contact\.salesPhone/,'search must include contact phone fields');
assert.match(source,/window\.setContactListFilter=setContactListFilter/);
assert.match(source,/\.contactCallButton\{[^}]*width:36px;height:36px;[^}]*background:#20A44B;color:#fff/,'call action must use the approved green circle and white icon');
assert.match(source,/if\(!event\.target\?\.closest\?\.\('\.contactSearchRow'\)\)closeContactFilterMenu/,'outside taps must close the contact dropdown');

console.log('contact-types: PASS — compact cards, sales-rep calling and anchored type filter are wired');
