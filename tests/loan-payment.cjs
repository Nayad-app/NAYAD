const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const dom=new JSDOM('<button>Start</button>',{url:'https://nayad.store',runScripts:'outside-only'}),w=dom.window;
 let store='s',writes=[],copied=[],approved=true,fail=false;
 let loan={id:'l',lender_name:'Test <script>bad</script>',schedule_revision:8,payment_details:{bank:'Bank',holder:'Holder',iban:'mn12 345',account:'001 234',reference:'Contract 123'},installments:[{id:'i',status:'pending',due_date:'2026-11-09',total_amount:2133000.50,paid_amount:100}]};
 w.__nayadUser={id:'u'};w.confirm=()=>approved;w.toast=()=>{};Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>copied.push(text)}});
 w.NayadLoanEditorBridge={find:()=>loan,canManage:()=>true,storeId:()=>store,client:()=>({rpc:async(name,args)=>{writes.push({name,args});return fail?{error:{message:'Network error'}}:{};}}),sync:async()=>{}};
 w.eval(fs.readFileSync('loan-payment.js','utf8'));const click=s=>w.document.querySelector(s).click(),tick=()=>new Promise(r=>setImmediate(r));
 w.NayadLoanPayment.open('l','i');assert.equal(writes.length,0);assert.equal(w.document.querySelectorAll('script').length,0);
 for(const key of ['iban','account','amount','reference']){click(`[data-copy="${key}"]`);await tick();assert.equal(w.document.querySelector(`[data-copy="${key}"]`).textContent,'Амжилттай хуулагдлаа');assert.equal(w.document.querySelector('[role=status]').textContent,'Амжилттай хуулагдлаа');}
 w.navigator.clipboard.writeText=async()=>{throw Error('denied')};w.document.execCommand=()=>false;click('[data-copy="iban"]');await tick();assert.equal(w.document.querySelector('[data-copy="iban"]').textContent,'Дахин хуулах');
 w.document.execCommand=()=>true;click('[data-copy="iban"]');await tick();assert.equal(w.document.querySelector('[data-copy="iban"]').textContent,'Амжилттай хуулагдлаа');
 assert.deepEqual(copied,['MN12345','001234','2132900.50','Contract 123']);assert.equal(writes.length,0,'copy never records payment');
 approved=false;click('[data-record]');await tick();assert.equal(writes.length,0);
 approved=true;store='other';click('[data-record]');await tick();assert.equal(writes.length,0);store='s';fail=true;click('[data-record]');await tick();assert.match(w.document.querySelector('[role=status]').textContent,/Network/);assert.ok(w.document.querySelector('#loanPaymentOverlay'));
 fail=false;click('[data-record]');click('[data-record]');await tick();assert.equal(writes.length,2,'only one successful request');assert.equal(writes[1].name,'record_loan_installment_payment');assert.equal(writes[1].args.p_expected_revision,8);assert.equal(w.document.querySelector('#loanPaymentOverlay'),null);
 loan.payment_details={};w.NayadLoanPayment.open('l','i');assert.equal(w.document.querySelectorAll('[data-copy]').length,1);click('[data-close]');assert.equal(writes.length,2);
 console.log('PASS: optional details, exact clipboard values, escaped labels, no writes on copy/cancel, context guard, retry, duplicate guard');w.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
