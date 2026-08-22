const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const state={
  companies:[
    {id:1,name:'Overdue Co',color:'red',invoices:[{id:'inv-overdue',no:'OLD-1',date:'2026-08-01',due_date:'2026-08-20',amount:100000,paid:0,status:'confirmed'}]},
    {id:2,name:'Upcoming Co',color:'green',invoices:[{id:'inv-upcoming',no:'NEXT-1',date:'2026-08-10',due_date:'2026-08-24',amount:50000,paid:0,status:'confirmed',discount_percent:4,discount_deadline:'2026-08-24'}]},
    {id:3,name:'Unknown Co',color:'blue',invoices:[{id:'inv-unknown',no:'NO-DUE',date:'2026-08-11',due_date:null,amount:25000,paid:0,status:'confirmed'}]},
    {id:4,name:'Draft Co',color:'purple',invoices:[{id:'inv-draft',no:'DRAFT-1',date:'2026-08-21',due_date:'2026-08-23',amount:999999,paid:0,status:'draft'}]}
  ],
  payments:[]
};

const listeners={};
const context={
  console,Intl,Date,Number,String,Math,JSON,Promise,setTimeout:()=>1,clearTimeout(){},
  crypto:require('node:crypto').webcrypto,
  navigator:{},Notification:{permission:'denied'},
  document:{
    visibilityState:'visible',
    head:{appendChild(){}},
    createElement:()=>({textContent:''}),
    addEventListener(type,handler){listeners[type]=handler;},
    getElementById:()=>null,
    querySelectorAll:()=>[]
  }
};
context.window=context;
context.window.addEventListener=(type,handler)=>{listeners[type]=handler;};
context.window.__nayadState={read:()=>JSON.parse(JSON.stringify(state))};
context.window.__nayadActiveStoreId='store-1';
context.window.nayadSupabase={rpc:async()=>({data:0,error:null}),from:()=>({select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});}})};
context.window.sheet=()=>{};
context.window.closeSheet=()=>{};
context.window.toast=()=>{};

vm.createContext(context);
vm.runInContext(`
  let data=${JSON.stringify(state)};
  let page='payments';
  let selected=null;
  function payments(){return 'legacy payments'}
  function reports(){return 'legacy reports'}
  function company(){}
  function payment(){}
  function sync(){}
  function render(){}
`,context);
vm.runInContext(fs.readFileSync(path.join(root,'payment-center.js'),'utf8'),context,{filename:'payment-center.js'});

const html=vm.runInContext('payments()',context);
assert.match(html,/Төлбөрийн төв/);
assert.match(html,/НООРОГ ПАДААН/);
assert.match(html,/Төлөх өдөр 2026\.08\.20/);
assert.match(html,/Төлөх өдөр 2026\.08\.24/);
assert.match(html,/Хугацаа оруулаагүй/);
assert.ok(html.indexOf('Overdue Co')<html.indexOf('Upcoming Co'),'overdue invoices must be first');
assert.ok(html.indexOf('Upcoming Co')<html.indexOf('Unknown Co'),'dated upcoming invoices must precede missing due dates');
assert.doesNotMatch(html,/999,999 ₮[\s\S]*Өнөөдөр төлөх/,'draft amount must not enter payable summaries');
assert.match(html,/4% хэмнэнэ/,'invoice-specific discount must be visible on the payment order');

const source=fs.readFileSync(path.join(root,'payment-center.js'),'utf8');
assert.match(source,/onchange="togglePaymentAllocation\(this\)"/,'checking another invoice must trigger allocation defaulting');
assert.match(source,/data-default-amount="\$\{discount\.cash\}"/,'each invoice needs a full-payment default amount');
assert.match(source,/window\.togglePaymentAllocation=function\(check\)/,'a checked zero-value invoice must receive its default payment amount');

vm.runInContext('sync()',context);
assert.equal(vm.runInContext('data.companies.find(c=>c.id===4).debt',context),0,'draft invoice must not create debt');

console.log('payment-center-v11: PASS — overdue/upcoming ordering, exact dates, discounts and drafts are correct');
