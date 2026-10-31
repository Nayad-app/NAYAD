const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
const d=new JSDOM('<div id="app"><header><button id="storeBackgroundButton"></button></header><main id="content"><div class="invoice" data-cart-invoice="a">Invoice</div></main><div id="modal"><div id="sheet"></div></div></div>',{url:'https://nayad.store',runScripts:'outside-only'}),w=d.window;
const server=new Map(),flush=()=>new Promise(r=>setTimeout(r,10));
let calls=[],fail=false,can=true;
const from=()=>{let action='select',row,filters={};const q={select(){return q},upsert(r){action='add';row=r;return q},delete(){action='delete';return q},eq(k,v){filters[k]=v;return q},then(resolve){if(action==='add')server.set(row.store_id+':'+row.invoice_id,row);if(action==='delete')server.delete(filters.store_id+':'+filters.invoice_id);return Promise.resolve({data:[...server.values()].filter(r=>r.store_id===filters.store_id),error:null}).then(resolve)}};return q;};const cs=[{id:1,name:'One',supabase_supplier_id:'s1',invoices:[{id:'a',no:'A',amount:100,paid:0,date:'2026-01-01'},{id:'b',no:'B',amount:200,paid:0,date:'2026-01-02'},{id:'d',amount:100,paid:0,status:'draft'}]},{id:2,name:'Two',supabase_supplier_id:'s2',invoices:[{id:'c',no:'C',amount:300,paid:0,date:'2026-01-01'}]}];
w.__nayadUser={id:'u'};w.__nayadStoresUserId='u';w.__nayadActiveStoreId='s';w.__nayadCan=()=>can;w.__nayadState={read:()=>({companies:cs,payments:[]})};w.toast=()=>{};w.sheet=h=>w.document.getElementById('sheet').innerHTML=h;w.closeSheet=()=>w.document.getElementById('sheet').innerHTML='';w.nayadSupabase={from,rpc:async(n,a)=>{if(fail)return {error:new Error('synthetic failure')};calls.push(a);for(const x of a.p_allocations){const i=cs.flatMap(c=>c.invoices).find(i=>i.id===x.invoice_id);i.paid+=x.amount;if(i.paid>=i.amount)server.delete('s:'+i.id);}return {data:{remaining_balance:0}};}};w.console.error=()=>{};
w.eval('function payment(){} function payments(){} function reports(){} function company(){} function sync(){} function render(){}');w.eval(fs.readFileSync('payment-center.js','utf8'));w.eval(fs.readFileSync('invoice-cart.js','utf8'));
const cart=w.NayadInvoiceCart,el=id=>w.document.getElementById(id),stored=()=>[...server.values()].filter(r=>r.store_id===w.__nayadActiveStoreId).map(r=>r.invoice_id);
await cart.sync();
assert.equal(el('invoiceCartButton').nextElementSibling.id,'storeBackgroundButton');
// Horizontal swipe reveals; vertical movement keeps page scrolling, and swipe click does not open details.
const front=w.document.querySelector('[data-cart-invoice]'),wrap=front.parentElement;
const touch=(type,x,y)=>{const e=new w.Event(type,{bubbles:true});Object.defineProperty(e,'touches',{value:[{clientX:x,clientY:y}]});front.dispatchEvent(e);};
touch('touchstart',160,100);touch('touchmove',70,103);assert(wrap.classList.contains('revealed'));front.click();assert(!wrap.classList.contains('revealed'));
touch('touchstart',160,100);touch('touchmove',155,160);assert(!wrap.classList.contains('revealed'));
// Clicking the visible chevron must not open invoice details or add a payment.
let detailClicks=0;front.addEventListener('click',()=>detailClicks++);
const toggle=front.querySelector('.cartRevealToggle');assert(toggle);toggle.click();assert(wrap.classList.contains('revealed'));assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(detailClicks,0);assert.equal(stored().length,0);
toggle.click();assert(!wrap.classList.contains('revealed'));assert.equal(toggle.getAttribute('aria-expanded'),'false');
toggle.click();wrap.querySelector('.cartSwipeAction').click();await flush();assert(stored().includes('a'));assert(!wrap.classList.contains('revealed'));assert.equal(calls.length,0);assert.equal(detailClicks,0);
await cart.add('a');await cart.add('a');await cart.add('b');await cart.add('c');await cart.add('d');assert.equal(stored().length,3);assert.equal(calls.length,0);
cart.open();assert.equal(w.document.querySelectorAll('.cartGroup').length,2);assert.match(w.document.querySelector('.cartFooter').textContent,/600/);
// Cart removal requires an explicit action after swipe; original invoice stays unchanged.
let removeButton=w.document.querySelector('[data-cart-remove="b"]'),removeWrap=removeButton.parentElement,cartRow=removeWrap.querySelector('.cartItem');
const cartTouch=(type,x,y)=>{const e=new w.Event(type,{bubbles:true});Object.defineProperty(e,'touches',{value:[{clientX:x,clientY:y}]});cartRow.dispatchEvent(e);};
cartTouch('touchstart',180,100);cartTouch('touchmove',175,155);assert(!removeWrap.classList.contains('revealed'));
cartTouch('touchstart',180,100);cartTouch('touchmove',80,102);assert(removeWrap.classList.contains('revealed'));assert(stored().includes('b'));assert.equal(calls.length,0);
w.document.querySelector('.cartList').scrollTop=80;removeButton.click();await flush();assert(!stored().includes('b'));assert.equal(cs[0].invoices.length,3);assert.equal(cs[0].invoices[1].amount,200);assert.equal(cs[0].invoices[1].paid,0);assert.equal(calls.length,0);assert.equal(w.document.querySelector('.cartList').scrollTop,80);
assert.match(w.document.querySelector('.cartFooter').textContent,/400/);await cart.add('b');cart.open();
// Persist across module reinitialization; isolated users and stores.
w.__nayadActiveStoreId='s2';cart.refresh();assert.equal(el('invoiceCartView'),null);assert.deepEqual(stored(),[]);w.__nayadActiveStoreId='s';assert.equal(stored().length,3);w.__nayadUser.id='other';w.__nayadStoresUserId='other';await cart.sync();assert.equal(stored().length,3);w.__nayadUser.id='u';w.__nayadStoresUserId='u';
await cart.sync();cart.open();w.document.querySelector('[data-cart-pay="1"]').click();w.recalculatePaymentTotal();assert.equal(el('pcAmount').value,'300');assert.equal(w.document.querySelectorAll('.pcInvoiceCheck:checked').length,2);
el('pcAmount').value='150';w.recalculatePaymentTotal();w.reviewPaymentCenter(1);await w.commitPaymentCenter();assert.deepEqual(JSON.parse(JSON.stringify(calls[0].p_allocations)),[{invoice_id:'a',amount:100},{invoice_id:'b',amount:50}]);assert.deepEqual(stored().sort(),['b','c']);assert.match(w.document.querySelector('.cartFooter').textContent,/450/);
// Failed payments preserve cart. Unselected supplier is untouched.
w.document.querySelector('[data-cart-pay="1"]').click();w.recalculatePaymentTotal();w.reviewPaymentCenter(1);fail=true;await w.commitPaymentCenter();assert.deepEqual(stored().sort(),['b','c']);assert.equal(cs[1].invoices[0].paid,0);fail=false;
// Invoice edits, cancellation and discounts read current state.
cs[0].invoices[1].amount=250;cart.open();assert.match(w.document.querySelector('.cartFooter').textContent,/500/);cs[1].invoices[0].status='cancelled';cart.refresh();assert.equal(w.document.querySelectorAll('.cartGroup').length,1);
cs[0].invoices[1].discount_percent=10;cs[0].invoices[1].discount_deadline='2099-01-01';cart.refresh();assert.match(w.document.querySelector('.cartFooter').textContent,/175/);
// Cross-scope completion cannot change another store cart.
const key=cart.scope();w.__nayadActiveStoreId='s2';cart.settled(key,['b']);w.__nayadActiveStoreId='s';assert(stored().includes('b'));
await cart.remove('b');assert(!stored().includes('b'));can=false;cart.refresh();assert(el('invoiceCartButton').hidden);assert.equal(el('invoiceCartView'),null);
// A second signed-in member/device observes and changes the same server rows.
can=true;cart.refresh();
const d2=new JSDOM('<div id="app"><button id="storeBackgroundButton"></button><div id="sheet"></div></div>',{url:'https://nayad.store',runScripts:'outside-only'}),w2=d2.window;
Object.assign(w2,{__nayadUser:{id:'member'},__nayadStoresUserId:'member',__nayadActiveStoreId:'s',__nayadCan:()=>true,__nayadState:w.__nayadState,nayadSupabase:{from},toast:()=>{},sheet:h=>w2.document.getElementById('sheet').innerHTML=h,closeSheet:()=>w2.document.getElementById('sheet').innerHTML=''});
w2.eval(fs.readFileSync('invoice-cart.js','utf8'));await w2.NayadInvoiceCart.sync();
cs[1].invoices[0].status='confirmed';
await Promise.all([cart.add('b'),w2.NayadInvoiceCart.add('c')]);
await cart.sync();await w2.NayadInvoiceCart.sync();cart.open();w2.NayadInvoiceCart.open();
assert.equal(w.document.querySelectorAll('[data-cart-remove]').length,2);assert.equal(w2.document.querySelectorAll('[data-cart-remove]').length,2);
await w2.NayadInvoiceCart.remove('b');await cart.sync();assert.equal(w.document.querySelectorAll('[data-cart-remove="b"]').length,0);
w2.close();w.close();console.log('invoice-cart: PASS — grouping, totals, persistence, isolation, selected allocations, partial settlement, failures, live edits, cancellation, discount and permissions');
})().catch(e=>{console.error(e);process.exit(1)});
