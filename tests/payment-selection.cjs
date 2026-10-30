const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
const dom=new JSDOM('<div id="modal"><div id="sheet"></div></div>',{url:'https://nayad.store',runScripts:'outside-only'}),w=dom.window;
const supplier={id:1,name:'Synthetic',supabase_supplier_id:'supplier',invoices:[{id:'new',no:'NEW',date:'2026-10-26',amount:532720,paid:0},{id:'middle',no:'MIDDLE',date:'2026-10-12',amount:438700,paid:0},{id:'old',no:'OLD',date:'2026-10-08',amount:427235,paid:0},{id:'draft',status:'draft',amount:100,paid:0},{id:'paid',amount:100,paid:100},{id:'cancelled',status:'cancelled',amount:100,paid:0}]};
let calls=[];w.__nayadActiveStoreId='store';w.__nayadState={read:()=>({companies:[supplier],payments:[]})};w.sheet=h=>w.document.getElementById('sheet').innerHTML=h;w.closeSheet=()=>{};w.toast=()=>{};w.nayadSupabase={rpc:async(name,args)=>{calls.push(args);return {data:{remaining_balance:865935}}}};
w.eval('function payment(){} function payments(){} function reports(){} function company(){} function sync(){} function render(){}');w.eval(fs.readFileSync('payment-center.js','utf8'));
const el=id=>w.document.getElementById(id),enter=n=>{el('pcAmount').value=String(n);w.recalculatePaymentTotal();},payload=()=>JSON.parse(JSON.stringify(calls.at(-1).p_allocations));
w.payment(1);enter(500000);assert.equal(el('pcModeFifo').getAttribute('aria-pressed'),'true');assert.match(el('paymentCenterTotal').textContent,/898.?655/);
w.setPaymentMode('selected');assert.equal(el('pcAmount').value,'0');assert(el('pcContinue').disabled);assert.equal(w.document.querySelectorAll('.pcInvoiceCheck').length,3);
w.reviewPaymentCenter(1);assert(el('pcAmount'));assert.equal(calls.length,0);
// Select through the actual checkbox handler, newest invoice only.
const checks=w.document.querySelectorAll('.pcInvoiceCheck');checks[2].checked=true;checks[2].dispatchEvent(new w.Event('change'));
assert.equal(el('pcAmount').value,'532720');assert.match(el('paymentCurrentBalance').textContent,/1.?398.?655/);assert.match(el('paymentCenterTotal').textContent,/865.?935/);assert.equal(el('pcContinue').disabled,false);
enter(532721);assert(el('pcContinue').disabled);assert.match(el('pcWarning').textContent,/Сонгосон/);w.adjustPaymentAmount();
el('pcNote').value='Saved note';el('pcMethod').value='Бэлэн мөнгө';el('pcDate').value='2026-10-30';w.reviewPaymentCenter(1);assert(w.document.body.textContent.includes('NEW'));assert(!w.document.body.textContent.includes('MIDDLE'));
w.backPaymentCenter();w.recalculatePaymentTotal();assert.equal(el('pcAmount').value,'532720');assert.equal(el('pcDate').value,'2026-10-30');assert.equal(el('pcMethod').value,'Бэлэн мөнгө');assert.equal(el('pcNote').value,'Saved note');assert.equal(w.document.querySelectorAll('.pcInvoiceCheck:checked').length,1);
w.reviewPaymentCenter(1);await w.commitPaymentCenter();assert.deepEqual(payload(),[{invoice_id:'new',amount:532720}]);
// Several nonadjacent invoices: oldest within selection, no spill into middle.
w.payment(1);w.setPaymentMode('selected');w.selectPaymentInvoice('new',true);w.selectPaymentInvoice('old',true);enter(500000);w.reviewPaymentCenter(1);await w.commitPaymentCenter();assert.deepEqual(payload(),[{invoice_id:'old',amount:427235},{invoice_id:'new',amount:72765}]);
// Removing selection and switching back to FIFO.
w.payment(1);w.setPaymentMode('selected');w.selectPaymentInvoice('new',true);w.selectPaymentInvoice('new',false);assert(el('pcContinue').disabled);w.setPaymentMode('fifo');enter(500000);w.reviewPaymentCenter(1);await w.commitPaymentCenter();assert.deepEqual(payload(),[{invoice_id:'old',amount:427235},{invoice_id:'middle',amount:72765}]);
// Direct invoice payment opens that invoice selected.
w.payment(1,'middle');w.recalculatePaymentTotal();assert.equal(el('pcModeSelected').getAttribute('aria-pressed'),'true');assert.equal(el('pcAmount').value,'438700');
// Discount applies only on full timely settlement; deadline changes shown immediately.
supplier.invoices=[{id:'d',no:'DISCOUNT',date:'2026-01-01',amount:1500000,paid:455000,discount_percent:3,discount_deadline:'2026-10-30'},{id:'untouched',no:'OTHER',date:'2025-01-01',amount:100000,paid:0}];
w.payment(1);el('pcDate').value='2026-10-30';w.setPaymentMode('selected');w.selectPaymentInvoice('d',true);assert.equal(el('pcAmount').value,'1000000');assert.match(el('allocationList').textContent,/45.?000/);assert.match(el('paymentCenterTotal').textContent,/100.?000/);enter(100000);assert(!el('allocationList').textContent.includes('Хөнгөлөлт:'));el('pcDate').value='2026-10-31';w.adjustPaymentAmount();assert.equal(el('pcAmount').value,'1045000');assert(!el('allocationList').textContent.includes('Хөнгөлөлт:'));
// Changed data never silently pays another invoice.
supplier.invoices[0].status='cancelled';w.recalculatePaymentTotal();assert(el('pcContinue').disabled);const count=calls.length;w.reviewPaymentCenter(1);assert(el('pcAmount'));assert.equal(calls.length,count);
// Store switching blocks review/commit.
w.payment(1);enter(50000);w.reviewPaymentCenter(1);w.__nayadActiveStoreId='other';await w.commitPaymentCenter();assert.equal(calls.length,count);
w.close();console.log('payment-selection: PASS — FIFO, newest only, multi-select, partial, overpayment, zero selection, focus, restored draft, discount expiry, stale invoice and store isolation');
})().catch(e=>{console.error(e);process.exit(1)});
