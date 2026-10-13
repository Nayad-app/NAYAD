const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const d=new JSDOM('<div class="loanSwipe"><div class="loanSwipeActions" inert></div><article class="loanCard"><button class="loanMore"></button><span>Loan</span></article></div>',{url:'https://nayad.store',runScripts:'outside-only'}),w=d.window;
 let writes=[],store='s';const loan={id:'l',lender_name:'Lender',schedule_revision:4,installments:[{id:'r',installment_number:1,status:'paid',paid_amount:10}]};
 w.__nayadUser={id:'u'};w.toast=()=>{};w.NayadLoanEditorBridge={find:()=>loan,storeId:()=>store,canManage:()=>true,sync:async()=>{},client:()=>({rpc:async(n,a)=>{writes.push(a);return {data:{}};}})};w.eval(fs.readFileSync('loan-actions.js','utf8'));
 const click=s=>w.document.querySelector(s).click(),tick=()=>new Promise(r=>setImmediate(r));
 w.NayadLoanActions.open('delete','l');assert.equal(w.document.querySelector('#loanActionOverlay'),null,'paid loan not deletable');
 w.NayadLoanActions.open('reverse','l','r');assert.match(w.document.querySelector('[role=dialog]').textContent,/банк/);click('[data-dismiss]');assert.equal(writes.length,0);
 w.NayadLoanActions.open('reverse','l','r');store='other';click('[data-submit]');await tick();assert.equal(writes.length,0);store='s';click('[data-submit]');click('[data-submit]');await tick();assert.equal(writes.length,1);assert.equal(writes[0].p_action,'reverse');
 loan.installments=[];w.NayadLoanActions.open('delete','l');const input=w.document.querySelector('input');assert.equal(w.document.querySelector('[data-submit]').disabled,true);input.value='yes';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.document.querySelector('[data-submit]').disabled,true);input.value='устгах';input.dispatchEvent(new w.Event('input',{bubbles:true}));click('[data-submit]');await tick();assert.equal(writes[1].p_confirmation,'устгах');
 const el=w.document.querySelector('.loanSwipe');w.NayadLoanActions.toggle(el);assert.equal(el.classList.contains('revealed'),true);assert.equal(el.querySelector('.loanSwipeActions').inert,false);w.NayadLoanActions.toggle(el);assert.equal(el.querySelector('.loanSwipeActions').inert,true);
 function pointer(type,x,y){const e=new w.Event(type,{bubbles:true});Object.assign(e,{pointerType:'touch',clientX:x,clientY:y});el.querySelector('span').dispatchEvent(e);}
 pointer('pointerdown',200,100);pointer('pointerup',195,230);assert.equal(el.classList.contains('revealed'),false,'vertical scrolling leaves actions closed');pointer('pointerdown',200,100);pointer('pointerup',100,105);assert.equal(el.classList.contains('revealed'),true);
 console.log('PASS: typed deletion, paid-history guard, reverse confirmation, context switch, duplicate clicks, swipe and vertical scroll');w.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
