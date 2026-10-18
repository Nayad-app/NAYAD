const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
const dom=new JSDOM('<div id="modal"><div id="sheet"></div></div>',{url:'https://nayad.store',runScripts:'outside-only'}),w=dom.window;
const company={id:1,name:'Жишээ',supabase_supplier_id:'supplier',bankAccount:'001234',paymentReference:'Дэлгүүр & "123"',invoices:[{id:'new',no:'NEW',date:'2026-10-05',due_date:'2026-10-06',amount:1000000,paid:0},{id:'old',no:'OLD',date:'2026-09-20',due_date:'2026-12-01',amount:500000,paid:0}]};
let calls=[],clipboard=[];w.__nayadActiveStoreId='store';w.__nayadState={read:()=>({companies:[company],payments:[]})};w.sheet=html=>w.document.getElementById('sheet').innerHTML=html;w.closeSheet=()=>{};w.toast=()=>{};w.nayadSupabase={rpc:async(name,args)=>{calls.push(args);return {data:{remaining_balance:700000}}}};
w.eval('function payment(){} function payments(){} function reports(){} function company(){} function sync(){} function render(){}');
Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>clipboard.push(text)}});
w.eval(fs.readFileSync('payment-center.js','utf8'));
const el=id=>w.document.getElementById(id),tick=()=>new Promise(r=>setImmediate(r));
function enter(n){el('pcAmount').value=n;w.recalculatePaymentTotal();}
w.payment(1);assert.equal(el('pcReference').value,company.paymentReference);await w.copyPaymentField('reference',w.document.querySelector('.pcCopy'));assert.equal(clipboard.pop(),company.paymentReference);enter('800,000');assert.equal(el('pcContinue').disabled,false);assert.ok(el('allocationList').textContent.indexOf('OLD')<el('allocationList').textContent.indexOf('NEW'));assert.match(el('paymentCenterTotal').textContent,/700.?000/);
for(const value of ['0','-1','1500000.01']){enter(value);assert.equal(el('pcContinue').disabled,true);w.reviewPaymentCenter(1);assert.ok(el('pcAmount'));}
enter('1700000');assert.match(el('pcWarning').textContent,/200.?000/);w.adjustPaymentAmount();assert.equal(el('pcAmount').value,'1500000');
enter('800000');el('pcReference').value='Төлбөр 123';for(const key of ['account','amount','reference'])await w.copyPaymentField(key,w.document.querySelector('.pcCopy'));assert.deepEqual(clipboard,['001234','800000','Төлбөр 123']);assert.equal(w.document.querySelector('.pcCopy').textContent,'Амжилттай хуулагдлаа');
w.reviewPaymentCenter(1);w.commitPaymentCenter();w.commitPaymentCenter();await tick();assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0].p_allocations)),[{invoice_id:'old',amount:500000},{invoice_id:'new',amount:300000}]);
company.invoices=[{id:'discount',date:'2026-09-01',amount:1500000,paid:455000,discount_percent:3,discount_deadline:'2099-12-31'}];w.payment(1);enter('1000000');assert.match(el('paymentCenterTotal').textContent,/^0/);assert.match(el('allocationList').textContent,/45.?000/);el('pcDate').value='2100-01-01';w.recalculatePaymentTotal();assert.match(el('paymentCenterTotal').textContent,/45.?000/);
console.log('PASS FIFO by invoice date, partial/full, overpayment/zero/negative, discount expiry, copy feedback, duplicate submission');w.close();
})().catch(e=>{console.error(e);process.exitCode=1});
