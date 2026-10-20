const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){const window={__nayadActiveStoreId:'a',__nayadCan:()=>true};const context={window,Intl,Date,Map,Set,console,setTimeout:()=>{},document:{createElement:()=>({}),head:{appendChild(){}}}};vm.runInNewContext(fs.readFileSync('reports.js','utf8'),context);return window.NayadReports;}
function fixture(){return {suppliers:[{id:'s',name:'Test'}],invoices:[{id:'old',supplier_id:'s',invoice_date:'2026-09-01',due_date:'2026-10-19',amount:1000,paid:400,status:'confirmed'},{id:'new',supplier_id:'s',invoice_date:'2026-10-20',due_date:'2026-10-25',amount:100.25,paid:0,status:'confirmed'},{id:'void',amount:999,status:'cancelled'}],payments:[{id:'p1',payment_date:'2026-09-05',amount:100,status:'posted'},{id:'p2',payment_date:'2026-10-20',amount:250,status:'posted'},{id:'p3',payment_date:'2026-10-20',amount:999,status:'reversed'}],allocations:[{invoice_id:'old',payment_id:'p1',cash_amount:100,discount_amount:0},{invoice_id:'old',payment_id:'p2',cash_amount:250,discount_amount:50},{invoice_id:'old',payment_id:'p3',cash_amount:999,discount_amount:0}],agreements:[]};}
test('report reconciles opening, additions, cash and discounts in cents',()=>{const r=setup().calculate(fixture(),'2026-10-01','2026-10-20','2026-10-20');assert.equal(r.opening,90000);assert.equal(r.added,10025);assert.equal(r.cash,25000);assert.equal(r.discount,5000);assert.equal(r.closing,70025);assert.equal(r.current,r.closing);assert.equal(r.change,-19975);assert.equal(r.uncertain,false);assert.equal(r.overdue.length,1);assert.equal(r.soon.length,1);assert.equal(r.month.length,0);});
test('missing historical allocation suppresses invented opening and movement',()=>{const s=fixture();s.invoices[0].paid=500;assert.equal(setup().calculate(s,'2026-10-01','2026-10-20','2026-10-20').uncertain,true);});
test('period boundaries include last date and exclude later payments',()=>{const r=setup().calculate(fixture(),'2026-09-01','2026-09-30','2026-10-20');assert.equal(r.opening,0);assert.equal(r.added,100000);assert.equal(r.cash,10000);assert.equal(r.closing,90000);});
test('all time and month-end due windows do not double count',()=>{const s=fixture();s.invoices[1].due_date='2026-11-02';const r=setup().calculate(s,'','','2026-10-29');assert.equal(r.opening,0);assert.equal(r.current,r.closing);assert.equal(r.soon.length,1);assert.equal(r.month.length,0);});
test('reports require both invoice and payment read permission',()=>{const window={__nayadActiveStoreId:'a',__nayadCan:m=>m==='invoices'};const ctx={window,Intl,Date,Map,Set,setTimeout(){throw Error('must not fetch');},document:{createElement:()=>({}),head:{appendChild(){}}}};vm.runInNewContext(fs.readFileSync('reports.js','utf8'),ctx);assert.match(window.NayadReports.html(),/эрх шаардлагатай/);});
test('loader paginates beyond 500 and scopes allocation reads to store',async()=>{
 const calls=[];const invoices=Array.from({length:501},(_,i)=>({id:String(i),supplier_id:'s',invoice_date:'2026-10-01',due_date:'2026-10-25',amount:1,paid:0,status:'confirmed'}));
 const rows={invoices,payments:[],payment_allocations:[],suppliers:[{id:'s',name:'<img src=x>'}],invoice_agreements:[]};
 const client={from(table){return {select(){return this;},eq(key,value){calls.push([table,key,value]);return this;},order(){return this;},async range(a,b){return {data:rows[table].slice(a,b+1),error:null};}};}};
 const window={__nayadActiveStoreId:'a',nayadSupabase:client,__nayadCan:()=>true};
 vm.runInNewContext(fs.readFileSync('reports.js','utf8'),{window,Intl,Date,Map,Set,setTimeout:()=>{},document:{createElement:()=>({}),head:{appendChild(){}}}});
 window.NayadReports.html();window.NayadReports.reload();await new Promise(r=>setImmediate(r));
 const html=window.NayadReports.html();assert.match(html,/501 ₮/);assert.match(html,/&lt;img src=x&gt;/);assert.ok(calls.some(([t,k,s])=>t==='payment_allocations'&&k==='payments.store_id'&&s==='a'));assert.equal(calls.filter(([t])=>t==='invoices').length,2);
 window.__nayadActiveStoreId='b';assert.doesNotMatch(window.NayadReports.html(),/&lt;img src=x&gt;/);
});
