/* Transfer instructions are display/copy only. Recording requires explicit confirmation. */
(function(){
  'use strict';
  const B=window.NayadLoanEditorBridge;if(!B)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('mn-MN',{maximumFractionDigits:2}).format(v)+' ₮';
  const copyIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="7" width="12" height="14" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12"/></svg>';
  let root=null,context=null,busy=false,focus=null;
  function close(){if(busy)return;root?.remove();root=null;context=null;document.body.classList.remove('loanFormOpen');focus?.focus?.();}
  function valid(){return context&&context.store===B.storeId()&&context.user===window.__nayadUser?.id&&B.canManage();}
  function message(text){if(root)root.querySelector('[role="status"]').textContent=text;}
  async function copy(key){
    if(!valid())return message('Дэлгүүр эсвэл хэрэглэгч өөрчлөгдсөн байна. Дахин нээнэ үү.');
    const text=context.values[key];if(!text)return;
    const copyRoot=root,button=root.querySelector(`[data-copy="${key}"]`);
    function feedback(ok){
      if(root!==copyRoot)return;
      message(ok?'Амжилттай хуулагдлаа':'Хуулж чадсангүй. Мэдээллээ удаан дарж сонгоод хуулна уу.');
      if(!button)return;
      button.parentElement.style.gridTemplateColumns='minmax(85px,.8fr) minmax(0,1.2fr) auto';
      clearTimeout(button.copyFeedbackTimer);
      button.textContent=ok?'Амжилттай хуулагдлаа':'Дахин хуулах';
      button.style.cssText='width:auto;min-width:44px;max-width:120px;white-space:normal;font-size:12px';
      button.copyFeedbackTimer=setTimeout(()=>{button.innerHTML=copyIcon;button.style.cssText='';},2200);
    }
    try{if(!navigator.clipboard?.writeText)throw Error('fallback');await navigator.clipboard.writeText(text);feedback(true);}
    catch(e){
      if(root!==copyRoot)return;
      const input=document.createElement('textarea');input.value=text;input.style.cssText='position:fixed;opacity:0;top:0';copyRoot.appendChild(input);input.focus();input.select();input.setSelectionRange(0,text.length);
      let ok=false;try{ok=document.execCommand('copy');}catch(_){}input.remove();button?.focus();feedback(ok);
    }
  }
  async function record(){
    if(busy)return;if(!valid())return message('Дэлгүүр эсвэл хэрэглэгч өөрчлөгдсөн байна. Дахин нээнэ үү.');
    if(!confirm(`${money(context.amount)}-ийг банкаар төлсөн бол төлөлтөө бүртгэх үү?`))return;
    busy=true;window.__nayadCriticalOperation='loan-payment';root.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
      const {error}=await B.client().rpc('record_loan_installment_payment',{p_store_id:context.store,p_loan_id:context.loan,p_installment_id:context.row,p_expected_revision:context.revision});if(error)throw error;
      busy=false;close();window.toast?.('Зээлийн төлөлт бүртгэгдлээ.');await B.sync();window.render?.();
    }catch(e){message(e.message||'Төлөлт бүртгэхэд алдаа гарлаа.');}
    finally{busy=false;root?.querySelectorAll('button').forEach(b=>b.disabled=false);if(window.__nayadCriticalOperation==='loan-payment')delete window.__nayadCriticalOperation;}
  }
  function open(loanId,rowId){
    if(busy)return;if(!B.canManage())return window.toast?.('Төлөлт бүртгэх эрхгүй байна.');
    const loan=B.find(loanId),row=loan?.installments.find(r=>String(r.id)===String(rowId));if(!row||row.status==='paid')return;
    window.closeSheet?.();window.NayadContractEditor?.close();close();focus=document.activeElement;
    const d=loan.payment_details||{},amount=Math.max(0,Math.round((Number(row.total_amount)-Number(row.paid_amount||0))*100)/100);
    const values={iban:(d.iban||'').replace(/\s/g,'').toUpperCase(),account:(d.account||'').replace(/\s/g,''),amount:amount.toFixed(2).replace(/\.00$/,''),reference:d.reference||''};
    context={store:B.storeId(),user:window.__nayadUser?.id,loan:loan.id,row:row.id,revision:loan.schedule_revision||0,amount,values};
    const line=(label,text,key)=>`<div class="loanTransferRow"><span>${label}</span><strong>${esc(text||'Оруулаагүй')}</strong>${key&&text?`<button type="button" data-copy="${key}" aria-label="${label} хуулах">${copyIcon}</button>`:''}</div>`;
    root=document.createElement('div');root.className='loanContractOverlay';root.id='loanPaymentOverlay';
    root.innerHTML=`<section class="loanContractDialog" role="dialog" aria-modal="true" aria-labelledby="loanPaymentTitle"><header><h2 id="loanPaymentTitle">Зээл төлөх</h2><button type="button" data-close aria-label="Хаах">×</button></header><div class="loanContractBody"><h3>${esc(loan.lender_name)}</h3><p class="contractHelp">Төлөх өдөр: ${esc(row.due_date)}</p>${line('Банк',d.bank)}${line('Данс эзэмшигч',d.holder)}${line('IBAN',values.iban,'iban')}${line('Дансны дугаар',values.account,'account')}${line('Төлөх дүн',money(amount),'amount')}${line('Гүйлгээний утга',values.reference,'reference')}${!values.iban&&!values.account?'<p class="contractHelp">Дансны мэдээллээ «Зээл засах» хэсэгт нөхөж оруулна уу.</p>':''}<p class="contractHelp">Банкны аппдаа төлсний дараа төлөлтөө бүртгэнэ.</p><p class="loanTransferStatus" role="status" aria-live="polite"></p></div><footer><button type="button" class="primary full" data-record>Төлөлт бүртгэх</button><button type="button" class="secondary full" data-close style="margin-top:8px">Болих</button></footer></section>`;
    document.body.appendChild(root);document.body.classList.add('loanFormOpen');
    root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;if(b.hasAttribute('data-close'))close();else if(b.dataset.copy)copy(b.dataset.copy);else if(b.hasAttribute('data-record'))record();});
    root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...root.querySelectorAll('button')].filter(n=>!n.disabled),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
    root.querySelector('button').focus();
  }
  window.NayadLoanPayment={open,close};
})();
