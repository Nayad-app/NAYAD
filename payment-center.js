/* NAYAD 1.1 payment center — due-date ledger UI backed only by Supabase. */
(function(){
  if(window.__nayadPaymentCenterV11)return;
  window.__nayadPaymentCenterV11=true;

  let pendingPayment=null;
  let unreadNotifications=[];

  function sb(){return window.nayadSupabase||window.sb||null;}
  function state(){return window.__nayadState?.read?.()||{companies:[],payments:[]};}
  function esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function amount(value){return new Intl.NumberFormat('mn-MN',{maximumFractionDigits:2}).format(Number(value)||0)+' ₮';}
  function moneyInputValue(value){
    if(typeof window.__nayadParseMoneyInput==='function')return window.__nayadParseMoneyInput(value);
    const parsed=Number(String(value??'').replace(/,/g,''));return Number.isFinite(parsed)?parsed:0;
  }
  function moneyInputText(value){
    if(typeof window.__nayadFormatMoneyInput==='function')return window.__nayadFormatMoneyInput(value);
    return String(value??'');
  }
  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ulaanbaatar'}).format(new Date());}
  function dateLabel(value){if(!value)return 'Хугацаа оруулаагүй';const [y,m,d]=String(value).split('-');return `${y}.${m}.${d}`;}
  function daysBetween(from,to){
    if(!to)return Number.POSITIVE_INFINITY;
    const start=new Date(from+'T00:00:00Z'),end=new Date(to+'T00:00:00Z');
    return Math.round((end-start)/86400000);
  }
  function dueOf(invoice){return invoice.effective_due_date||invoice.due_date||null;}
  function balanceOf(invoice){return Math.max((Number(invoice.amount)||0)-(Number(invoice.paid)||0),0);}
  function isConfirmed(invoice){return (invoice.status||'confirmed')==='confirmed';}
  function notify(message){if(typeof window.toast==='function')window.toast(message);}
  function open(html){if(typeof window.sheet==='function')window.sheet(html);}
  function close(){if(typeof window.closeSheet==='function')window.closeSheet();}
  function activeStoreId(){return window.__nayadActiveStoreId||window.__nayadActiveStore?.id||null;}
  function companyById(id){return state().companies.find(company=>String(company.id)===String(id))||null;}
  function companyForInvoice(invoiceId){return state().companies.find(company=>(company.invoices||[]).some(invoice=>String(invoice.id)===String(invoiceId)))||null;}
  function invoiceById(invoiceId){const company=companyForInvoice(invoiceId);return company?(company.invoices||[]).find(invoice=>String(invoice.id)===String(invoiceId))||null:null;}
  function activeInvoices(){
    return state().companies.flatMap(company=>(company.invoices||[])
      .filter(invoice=>isConfirmed(invoice)&&balanceOf(invoice)>0)
      .map(invoice=>({company,invoice,due:dueOf(invoice),balance:balanceOf(invoice)})));
  }
  function orderedInvoices(){
    const current=today();
    return activeInvoices().sort((a,b)=>{
      const aDays=daysBetween(current,a.due),bDays=daysBetween(current,b.due);
      const aGroup=aDays<0?0:Number.isFinite(aDays)?1:2;
      const bGroup=bDays<0?0:Number.isFinite(bDays)?1:2;
      return aGroup-bGroup||aDays-bDays||String(a.invoice.created_at||a.invoice.date||'').localeCompare(String(b.invoice.created_at||b.invoice.date||''));
    });
  }
  function discountInfo(invoice,onDate=today()){
    const balance=balanceOf(invoice),percent=Number(invoice.discount_percent)||0;
    const eligible=percent>0&&invoice.discount_deadline&&onDate<=invoice.discount_deadline;
    /* The discount belongs to the original invoice, not to every remaining
       balance. Example: 1,500,000 with 3% = 45,000 discount. If 455,000 was
       paid first, the final timely payment is 1,000,000, never 1,013,650. */
    const fullDiscount=Math.round((Number(invoice.amount)||0)*percent)/100;
    const alreadyTaken=Math.max(Number(invoice.discount_taken)||0,0);
    const remainingDiscount=Math.max(fullDiscount-alreadyTaken,0);
    const cash=eligible?Math.max(Math.round((balance-remainingDiscount)*100)/100,0):balance;
    return {eligible,percent,cash,saving:Math.max(balance-cash,0),remainingDiscount};
  }
  function dueMeta(invoice){
    const due=dueOf(invoice),days=daysBetween(today(),due),negotiated=Array.isArray(invoice.agreements)&&invoice.agreements.length>0;
    if(!due)return {kind:'unknown',label:'Хугацаа оруулаагүй',days,negotiated};
    if(days<0)return {kind:'overdue',label:`${Math.abs(days)} хоног хэтэрсэн`,days,negotiated};
    if(days===0)return {kind:'today',label:'Өнөөдөр',days,negotiated};
    if(days===1)return {kind:'soon',label:'Маргааш',days,negotiated};
    return {kind:days<=7?'soon':'future',label:`${days} хоногийн дараа`,days,negotiated};
  }

  function financeSync(){
    try{
      const next=typeof data!=='undefined'?data:state();
      for(const company of next.companies||[]){
        company.debt=(company.invoices||[]).reduce((sum,invoice)=>sum+(isConfirmed(invoice)?balanceOf(invoice):0),0);
      }
      return next;
    }catch(_){return state();}
  }

  function summaryCard(label,value,count,kind,icon){return `<div class="paySummary ${kind||''}"><span class="paySummaryIcon">${icon}</span><small>${esc(label)}</small><b>${amount(value)}</b><em>${count} баримт</em></div>`;}
  function invoiceRow(item,index){
    const meta=dueMeta(item.invoice),discount=discountInfo(item.invoice);
    const classes=meta.kind==='overdue'?'overdue':meta.kind==='soon'||meta.kind==='today'?'soon':'';
    return `<article class="dueRow ${classes}" role="button" tabindex="0" onclick="window.showInvoiceDetails('${esc(item.invoice.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.showInvoiceDetails('${esc(item.invoice.id)}')}">
      <div class="dueRank">${index+1}</div>
      <div class="dueCompany"><span class="circle ${esc(item.company.color||'green')}">${esc((item.company.name||'N').slice(0,1).toUpperCase())}</span></div>
      <div class="dueDetails"><b>${esc(item.company.name)}</b><span>${esc(item.invoice.no||'Дугааргүй')}</span><span class="dueExact">Төлөх өдөр ${dateLabel(item.due)}</span><span class="dueState ${meta.kind}">${meta.negotiated?'Тохиролцсон · ':''}${esc(meta.label)}</span></div>
      <div class="dueMoney"><b>${amount(item.balance)}</b>${discount.eligible?`<span>${discount.percent}% хэмнэнэ</span>`:''}<button class="primary" onclick="event.stopPropagation();window.payment('${esc(item.company.id)}','${esc(item.invoice.id)}')">Төлөх</button>${meta.kind==='overdue'?`<button class="linkButton" onclick="event.stopPropagation();window.showInvoiceAgreement('${esc(item.invoice.id)}')">Тохиролцох</button>`:''}</div>
    </article>`;
  }

  function paymentCenter(){
    financeSync();
    const rows=orderedInvoices(),current=today();
    const dueToday=rows.filter(item=>daysBetween(current,item.due)===0);
    const week=rows.filter(item=>{const days=daysBetween(current,item.due);return days>=0&&days<=7;});
    const overdue=rows.filter(item=>daysBetween(current,item.due)<0);
    const drafts=state().companies.flatMap(company=>(company.invoices||[]).filter(invoice=>invoice.status==='draft').map(invoice=>({company,invoice})));
    return `<div class="paymentHead"><div><div class="hello">Өглөгийн удирдлага</div><div class="name">Төлбөрийн төв</div></div><button class="noticeButton" onclick="showNotificationCenter()" aria-label="Мэдэгдэл"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>${unreadNotifications.length?`<i>${unreadNotifications.length}</i>`:''}</button></div>
      <div class="paySummaryGrid">
        ${summaryCard('Өнөөдөр төлөх',dueToday.reduce((sum,item)=>sum+item.balance,0),dueToday.length,'today','▣')}
        ${summaryCard('Энэ 7 хоногт төлөх',week.reduce((sum,item)=>sum+item.balance,0),week.length,'week','▦')}
        ${summaryCard('Хугацаа хэтэрсэн',overdue.reduce((sum,item)=>sum+item.balance,0),overdue.length,'overdue','◷')}
      </div>
      ${drafts.length?`<section class="draftSection"><div class="paymentSectionTitle"><span>НООРОГ ПАДААН</span><b>${drafts.length}</b></div>${drafts.map(item=>`<button class="draftRow" onclick="invoice('${esc(item.company.id)}','${esc(item.invoice.id)}')"><span><b>${esc(item.company.name)}</b><small>${esc(item.invoice.no||'Дугааргүй')} · ${amount(item.invoice.amount)}</small></span><em>Засах →</em></button>`).join('')}</section>`:''}
      <div class="paymentSectionTitle"><span>ТӨЛӨХ ДАРААЛЛЫН ЖАГСААЛТ</span><small>Хугацаагаар эрэмбэлсэн</small></div>
      <div class="dueList">${rows.length?rows.map(invoiceRow).join(''):`<div class="emptyPay"><b>Төлөх падаан алга</b><span>Баталгаажсан падаанууд энд хугацааны дарааллаар харагдана.</span></div>`}</div>`;
  }

  function reportsV11(){
    const rows=orderedInvoices(),current=today();
    const groups=[
      {title:'Хугацаа хэтэрсэн — тохиролцоогүй',items:rows.filter(item=>daysBetween(current,item.due)<0&&!(item.invoice.agreements||[]).length),kind:'overdue'},
      {title:'Төлөх хугацаа ойртсон',items:rows.filter(item=>{const d=daysBetween(current,item.due);return d>=0&&d<=7;}),kind:'soon'},
      {title:'Тохиролцсон төлбөр',items:rows.filter(item=>(item.invoice.agreements||[]).length),kind:'agreement'}
    ];
    return `<div class="hello">Хугацааны тайлан</div><div class="name">Тайлан</div>${groups.map(group=>`<section class="reportGroup"><div class="paymentSectionTitle"><span>${group.title}</span><b>${group.items.length}</b></div>${group.items.length?group.items.map((item,index)=>invoiceRow(item,index)).join(''):`<div class="card sub">Мэдээлэл алга.</div>`}</section>`).join('')}`;
  }

  function companyV11(id){
    const company=companyById(id);if(!company)return;
    financeSync();
    try{selected=company;}catch(_){ }
    const invoices=(company.invoices||[]).slice().sort((a,b)=>String(dueOf(a)||a.date||'').localeCompare(String(dueOf(b)||b.date||'')));
    const content=document.getElementById('content');if(!content)return;
    content.innerHTML=`<button class="back" onclick="page='companies';render()">← Буцах</button><div class="center"><div class="circle ${esc(company.color||'green')}" style="margin:auto;width:48px;height:48px">${esc((company.name||'N').slice(0,1).toUpperCase())}</div><h2 style="margin:8px 0 2px">${esc(company.name)}</h2><div class="bigAmount">${amount(company.debt)}</div><div class="sub">Баталгаажсан нийт өр</div></div>
      <div class="sectionTitle">Компанийн мэдээлэл</div><div class="card"><div class="invoice"><div><small>Регистр</small><b>${esc(company.reg||'—')}</b></div></div><div class="invoice"><div><small>Хаяг</small><b>${esc(company.address||'—')}</b></div></div><div class="invoice"><div><small>Худалдааны төлөөлөгч</small><b>${esc(company.sales||'—')}</b></div><div>${typeof tel==='function'?tel(company.salesPhone):''}</div></div><div class="invoice"><div><small>Банк</small><b>${esc(company.bank||'—')}</b></div></div><div class="invoice"><div><small>Дансны дугаар</small><b>${esc(company.bankAccount||'—')}</b></div></div></div>
      <div class="sectionTitle">Падаанууд</div><div class="card">${invoices.length?invoices.map(invoice=>{const status=invoice.status||'confirmed',balance=balanceOf(invoice);return `<div class="invoice invoiceClickable" role="button" tabindex="0" onclick="window.showInvoiceDetails('${esc(invoice.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.showInvoiceDetails('${esc(invoice.id)}')}"><div><small>${esc(invoice.date||'')} · ${esc(invoice.no||'Дугааргүй')}</small><b>${amount(invoice.amount)}</b><span class="invoiceStatus ${status}">${status==='draft'?'Ноорог':status==='cancelled'?'Цуцалсан':balance?'Төлөх өдөр '+dateLabel(dueOf(invoice)):'Төлөгдсөн'}</span></div><div>${status==='draft'?`<button class="secondary" onclick="event.stopPropagation();window.invoice('${esc(company.id)}','${esc(invoice.id)}')">Засах</button>`:`<span class="${balance?'redText':'greenText'}">${balance?amount(balance):'Төлөгдсөн'}</span>`}<small class="detailHint">Дэлгэрэнгүй →</small></div></div>`;}).join(''):'<div class="sub">Падаан алга.</div>'}</div>
      <button class="primary full" onclick="invoice('${esc(company.id)}')">＋ Падаан нэмэх</button><button class="secondary full" style="margin-top:8px" onclick="payment('${esc(company.id)}')">Төлбөр бүртгэх</button><button class="secondary full" style="margin-top:8px" onclick="window.editCompany(Number('${esc(company.id)}'))">✎ Мэдээлэл засах</button>`;
  }

  function paymentForm(companyId,focusInvoiceId){
    const company=companyById(companyId);if(!company){notify('Нийлүүлэгч олдсонгүй.');return;}
    const invoices=(company.invoices||[]).filter(invoice=>isConfirmed(invoice)&&balanceOf(invoice)>0).sort((a,b)=>String(dueOf(a)||a.date||'').localeCompare(String(dueOf(b)||b.date||'')));
    if(!invoices.length){notify('Төлөгдөөгүй падаан алга.');return;}
    const focus=focusInvoiceId?String(focusInvoiceId):'';
    open(`<h2>Төлбөр бүртгэх</h2><div class="paySupplierCard"><b>${esc(company.name)}</b><span>${esc(company.bank||'Банк сонгоогүй')}${company.bankAccount?' · '+esc(company.bankAccount):''}</span></div>
      <div class="paymentSectionTitle"><span>ТӨЛӨГДӨӨГҮЙ ПАДААНУУД</span><small>Дүнг гараар өөрчилж болно</small></div>
      <div id="allocationList">${invoices.map((invoice,index)=>{const discount=discountInfo(invoice),checked=focus?String(invoice.id)===focus:index===0;return `<label class="allocationRow"><input class="allocationCheck" type="checkbox" data-invoice="${esc(invoice.id)}" ${checked?'checked':''} onchange="togglePaymentAllocation(this)"><span><b>${esc(invoice.no||'Дугааргүй')}</b><small>Төлөх өдөр ${dateLabel(dueOf(invoice))} · Үлдэгдэл ${amount(balanceOf(invoice))}</small>${discount.eligible?`<em>${discount.percent}% хөнгөлөлт · ${amount(discount.saving)} хэмнэнэ</em>`:''}</span><input class="allocationAmount" data-money-input data-invoice="${esc(invoice.id)}" data-default-amount="${discount.cash}" type="text" inputmode="decimal" autocomplete="off" value="${moneyInputText(checked?discount.cash:0)}" oninput="recalculatePaymentTotal()"></label>`;}).join('')}</div>
      <div class="payTotal"><span>Нийт төлөх дүн</span><b id="paymentCenterTotal">0 ₮</b></div>
      <div class="field"><label>Төлбөрийн арга</label><select id="pcMethod"><option>Банк</option><option>Бэлэн мөнгө</option><option>QPay</option><option>Карт</option><option>Бусад</option></select></div>
      <div class="field"><label>Огноо</label><input id="pcDate" type="date" value="${today()}"></div>
      <div class="field"><label>Гүйлгээний утга / баримтын дугаар — заавал биш</label><input id="pcReference" maxlength="120"></div>
      <div class="field"><label>Тайлбар — заавал биш</label><textarea id="pcNote" maxlength="300"></textarea></div>
      <div class="actions"><button class="secondary" onclick="closeSheet()">Болих</button><button class="primary" onclick="reviewPaymentCenter('${esc(company.id)}')">Үргэлжлүүлэх</button></div>`);
    setTimeout(()=>window.recalculatePaymentTotal(),0);
  }

  window.recalculatePaymentTotal=function(){
    let total=0;
    document.querySelectorAll('.allocationCheck').forEach(check=>{
      const input=document.querySelector(`.allocationAmount[data-invoice="${check.dataset.invoice}"]`);
      if(input){input.disabled=!check.checked;if(check.checked)total+=Math.max(moneyInputValue(input.value),0);}
    });
    const target=document.getElementById('paymentCenterTotal');if(target)target.textContent=amount(total);
    return total;
  };

  /* Checking an invoice means “pay this invoice in full” by default. The
     amount remains editable, so a partial/manual payment is still possible. */
  window.togglePaymentAllocation=function(check){
    const input=document.querySelector(`.allocationAmount[data-invoice="${check.dataset.invoice}"]`);
    if(check.checked&&input&&Math.max(moneyInputValue(input.value),0)===0){
      input.value=moneyInputText(input.dataset.defaultAmount||0);
    }
    return window.recalculatePaymentTotal();
  };

  window.reviewPaymentCenter=function(companyId){
    const company=companyById(companyId);if(!company)return;
    const allocations=[];
    document.querySelectorAll('.allocationCheck:checked').forEach(check=>{
      const input=document.querySelector(`.allocationAmount[data-invoice="${check.dataset.invoice}"]`);
      const cash=Math.max(moneyInputValue(input?.value),0);if(cash>0)allocations.push({invoice_id:check.dataset.invoice,amount:cash});
    });
    const total=allocations.reduce((sum,item)=>sum+item.amount,0);if(!total){notify('Төлөх дүн оруулна уу.');return;}
    const selectedInvoices=allocations.map(item=>invoiceById(item.invoice_id)).filter(Boolean);
    const discount=allocations.reduce((sum,item,index)=>{const inv=selectedInvoices[index],info=inv?discountInfo(inv,document.getElementById('pcDate')?.value||today()):{saving:0,cash:0};return sum+(Math.abs(item.amount-info.cash)<0.01?info.saving:0);},0);
    pendingPayment={companyId,companyName:company.name,supplierId:company.supabase_supplier_id,allocations,total,discount,date:document.getElementById('pcDate')?.value||today(),method:document.getElementById('pcMethod')?.value||'Бусад',reference:document.getElementById('pcReference')?.value.trim()||null,note:document.getElementById('pcNote')?.value.trim()||null,previousDebt:Number(company.debt)||0};
    open(`<h2>Төлбөр баталгаажуулах</h2><div class="confirmPay"><span>Нийлүүлэгч<b>${esc(company.name)}</b></span><span>Өмнөх өр<b>${amount(pendingPayment.previousDebt)}</b></span><span>Банкнаас төлөх<b>${amount(total)}</b></span>${discount?`<span class="discountLine">Хөнгөлөлтөөр хаагдах<b>${amount(discount)}</b></span>`:''}<span class="newBalance">Төлсний дараах өр<b>${amount(Math.max(pendingPayment.previousDebt-total-discount,0))}</b></span></div><p class="sub">Төлбөр баталгаажсаны дараа устгахгүй. Алдаа гарвал шалтгаантай буцаалт хийнэ.</p><div class="actions"><button class="secondary" onclick="payment('${esc(companyId)}')">Буцах</button><button id="commitPaymentBtn" class="primary" onclick="commitPaymentCenter()">Баталгаажуулах</button></div>`);
  };

  window.commitPaymentCenter=async function(){
    const payment=pendingPayment;if(!payment)return;
    const button=document.getElementById('commitPaymentBtn');if(button){button.disabled=true;button.textContent='Бүртгэж байна...';}
    window.__nayadCriticalOperation='payment-v11';
    try{
      if(!payment.supplierId)throw new Error('Нийлүүлэгчийн cloud дугаар олдсонгүй.');
      const paymentId=crypto.randomUUID();
      const {data:result,error}=await sb().rpc('post_supplier_payment_v11',{
        p_payment_id:paymentId,p_supplier_id:payment.supplierId,p_amount:payment.total,
        p_payment_date:payment.date,p_method:payment.method,p_note:payment.note,
        p_reference:payment.reference,p_allocations:payment.allocations
      });
      if(error)throw error;
      const row=Array.isArray(result)?result[0]:result;
      pendingPayment=null;close();
      notify(`Төлбөр бүртгэгдлээ. Үлдэгдэл: ${amount(row?.remaining_balance)}`);
      await window.__nayadStartCloudSync?.({reason:'payment-v11-posted',force:true});
      try{page='payments';render();}catch(_){ }
    }catch(error){console.error('Payment center commit:',error);notify(error?.message||'Төлбөр бүртгэхэд алдаа гарлаа.');if(button){button.disabled=false;button.textContent='Баталгаажуулах';}}
    finally{if(window.__nayadCriticalOperation==='payment-v11')delete window.__nayadCriticalOperation;}
  };

  async function postedPaymentsForInvoice(invoiceId){
    const client=sb();if(!client)return [];
    const {data,error}=await client.from('payment_allocations')
      .select('payment_id,cash_amount,discount_amount,payments!inner(id,payment_date,amount,method,note,reference,status)')
      .eq('invoice_id',invoiceId)
      .eq('payments.status','posted');
    if(error)throw error;
    return (data||[]).filter(row=>row?.payments?.status==='posted');
  }

  function paymentReversalRows(rows,invoiceId){
    if(!rows.length)return `<div class="agreementInfo" style="margin-top:10px">Энэ бол хуучин төлбөр тул автоматаар буцаах боломжгүй байна.</div>`;
    return `<div class="paymentSectionTitle" style="margin-top:16px"><span>ОРСОН ТӨЛБӨР</span><small>Буцаасны дараа засна</small></div>${rows.map(row=>{const payment=row.payments||{},cash=Number(row.cash_amount)||0,discount=Number(row.discount_amount)||0;return `<div class="card" style="margin-bottom:8px"><div class="row"><div><b>${amount(cash)}${discount?` + ${amount(discount)} хөнгөлөлт`:''}</b><span class="sub">${dateLabel(payment.payment_date)} · ${esc(payment.method||'Бусад')}</span></div><button class="secondary" onclick="window.showPaymentReversal('${esc(payment.id||row.payment_id)}','${esc(invoiceId)}')">Буцаах</button></div></div>`;}).join('')}`;
  }

  window.showInvoiceDetails=async function(invoiceId){
    const invoice=invoiceById(invoiceId),company=companyForInvoice(invoiceId);if(!invoice||!company)return;
    const status=invoice.status||'confirmed',balance=balanceOf(invoice),discount=Number(invoice.discount_percent)||0;
    const canRevise=status==='confirmed'&&Number(invoice.paid||0)===0;
    const paid=Number(invoice.paid)||0;
    let postedPayments=[];
    if(paid){try{postedPayments=await postedPaymentsForInvoice(invoiceId);}catch(error){console.warn('Invoice payment history:',error);}}
    open(`<h2>Падааны дэлгэрэнгүй</h2>
      <div class="invoiceDetailCard"><b>${esc(company.name)}</b><span>${esc(invoice.no||'Дугааргүй')}</span><div class="detailGrid"><small>Падааны огноо<b>${dateLabel(invoice.date)}</b></small><small>Төлөх хугацаа<b>${dateLabel(dueOf(invoice))}</b></small><small>Нийт дүн<b>${amount(invoice.amount)}</b></small><small>Үлдэгдэл<b class="${balance?'redText':'greenText'}">${amount(balance)}</b></small></div>${discount?`<div class="agreementInfo">Хугацаандаа төлбөл ${discount}% хөнгөлөлт эдэлнэ${invoice.discount_deadline?' · '+dateLabel(invoice.discount_deadline)+' хүртэл':''}.</div>`:''}</div>
      ${status==='draft'?`<p class="sub">Энэ ноорог тул засварлаж, дараа нь баталгаажуулна.</p><button class="primary full" onclick="closeSheet();window.invoice('${esc(company.id)}','${esc(invoice.id)}')">Ноорог засах</button>`:canRevise?`<p class="sub">Төлбөр ороогүй баталгаажсан падааныг залруулж болно. Өмнөх утгууд болон шалтгаан түүхэнд хадгалагдана.</p><button class="primary full" onclick="window.editConfirmedInvoice('${esc(invoice.id)}')">✎ Падаан залруулах</button>`:`<div class="agreementWarning"><b>Шууд засах боломжгүй</b><span>${paid?`Энэ падаанд ${amount(paid)} төлбөр орсон байна. Эхлээд тухайн төлбөрийг шалтгаантай буцаасны дараа залруулна.`:'Цуцалсан падааныг засах боломжгүй.'}</span></div>${paid?paymentReversalRows(postedPayments,invoiceId):''}`}
      <button class="secondary full" style="margin-top:9px" onclick="closeSheet()">Хаах</button>`);
  };

  window.showPaymentReversal=function(paymentId,invoiceId){
    if(!paymentId)return notify('Төлбөрийн дугаар олдсонгүй.');
    open(`<h2>Төлбөр буцаах</h2><div class="agreementWarning"><b>Анхаар</b><span>Энэ гүйлгээг бүхэлд нь буцаана. Нэг төлбөр олон падаанд хуваарилагдсан бол тэдгээрийн дүн мөн сэргэнэ. Буцаалтын түүх устахгүй.</span></div><div class="field"><label>Буцаалтын шалтгаан</label><textarea id="paymentReversalReason" maxlength="300" placeholder="Жишээ: Буруу падаанд төлбөр хуваарилсан"></textarea></div><div class="actions"><button class="secondary" onclick="window.showInvoiceDetails('${esc(invoiceId)}')">Болих</button><button id="reversePaymentBtn" class="primary" style="background:#D64545;color:#fff" onclick="window.reversePayment('${esc(paymentId)}','${esc(invoiceId)}')">ТӨЛБӨР БУЦААХ</button></div>`);
  };

  window.reversePayment=async function(paymentId,invoiceId){
    const reason=(document.getElementById('paymentReversalReason')?.value||'').trim();
    if(!reason){notify('Буцаалтын шалтгаан оруулна уу.');return;}
    const button=document.getElementById('reversePaymentBtn');if(button){button.disabled=true;button.textContent='Буцааж байна...';}
    window.__nayadCriticalOperation='payment-reversal';
    try{
      const {data,error}=await sb().rpc('reverse_supplier_payment',{p_payment_id:paymentId,p_reason:reason});
      if(error)throw error;
      await window.__nayadStartCloudSync?.({reason:'payment-reversed',force:true});
      try{page='payments';render();}catch(_){ }
      notify(`Төлбөр буцаагдлаа. Үлдэгдэл: ${amount((Array.isArray(data)?data[0]:data)?.remaining_balance)}`);
      await window.showInvoiceDetails(invoiceId);
    }catch(error){console.error('Payment reversal:',error);notify(error?.message||'Төлбөр буцаахад алдаа гарлаа.');if(button){button.disabled=false;button.textContent='ТӨЛБӨР БУЦААХ';}}
    finally{if(window.__nayadCriticalOperation==='payment-reversal')delete window.__nayadCriticalOperation;}
  };

  window.editConfirmedInvoice=function(invoiceId){
    const invoice=invoiceById(invoiceId),company=companyForInvoice(invoiceId);if(!invoice||!company)return;
    if((invoice.status||'confirmed')!=='confirmed'||Number(invoice.paid||0)!==0){notify('Төлбөр орсон падааныг эхлээд буцаалтын дараа залруулна.');return;}
    open(`<h2>Падаан залруулах</h2><div class="agreementInfo">Өмнөх утга, шинэ утга болон засварын шалтгаан түүхэнд хадгалагдана.</div><div class="card" style="margin-top:10px"><b>${esc(company.name)}</b><span class="sub">${esc(invoice.no||'Дугааргүй')}</span></div>
      <div class="field"><label>Падааны огноо</label><input id="reviseInvoiceDate" type="date" value="${esc(invoice.date||today())}"></div>
      <div class="field"><label>Төлөх хугацаа</label><input id="reviseInvoiceDueDate" type="date" value="${esc(invoice.due_date||'')}"></div>
      <div class="field"><label>Падааны дугаар</label><input id="reviseInvoiceNo" maxlength="120" value="${esc(invoice.no||'')}"></div>
      <div class="field"><label>Нийт дүн</label><input id="reviseInvoiceAmount" data-money-input type="text" inputmode="decimal" autocomplete="off" value="${moneyInputText(Number(invoice.amount)||'')}"></div>
      <div class="field"><label>Хугацаандаа төлөх хөнгөлөлт (%) — заавал биш</label><input id="reviseInvoiceDiscount" type="number" inputmode="decimal" min="0" max="99.99" step="0.01" value="${Number(invoice.discount_percent)||''}"></div>
      <div class="field"><label>Хөнгөлөлтийн эцсийн өдөр — заавал биш</label><input id="reviseInvoiceDiscountDeadline" type="date" value="${esc(invoice.discount_deadline||'')}"></div>
      <div class="field"><label>Засварын шалтгаан</label><textarea id="reviseInvoiceReason" maxlength="300" placeholder="Жишээ: Падааны дүн буруу оруулсан"></textarea></div>
      <div class="actions"><button class="secondary" onclick="window.showInvoiceDetails('${esc(invoice.id)}')">Болих</button><button id="saveInvoiceRevisionBtn" class="primary" onclick="window.saveConfirmedInvoiceRevision('${esc(invoice.id)}')">Залруулгыг хадгалах</button></div>`);
  };

  window.saveConfirmedInvoiceRevision=async function(invoiceId){
    const invoice=invoiceById(invoiceId);if(!invoice)return;
    const input=id=>document.getElementById(id)?.value||'';
    const invoiceDate=input('reviseInvoiceDate'),dueDate=input('reviseInvoiceDueDate'),invoiceNo=input('reviseInvoiceNo').trim();
    const invoiceAmount=moneyInputValue(input('reviseInvoiceAmount')),discountPercent=Number(input('reviseInvoiceDiscount'))||0;
    const discountDeadline=input('reviseInvoiceDiscountDeadline')||null,reason=input('reviseInvoiceReason').trim();
    if(!invoiceDate||!dueDate||!Number.isFinite(invoiceAmount)||invoiceAmount<=0){notify('Огноо, төлөх хугацаа болон зөв дүн оруулна уу.');return;}
    if(dueDate<invoiceDate){notify('Төлөх хугацаа падааны өдрөөс өмнө байж болохгүй.');return;}
    if(discountPercent>0&&!discountDeadline){notify('Хөнгөлөлтийн эцсийн өдрийг оруулна уу.');return;}
    if(!reason){notify('Засварын шалтгаан оруулна уу.');return;}
    const button=document.getElementById('saveInvoiceRevisionBtn');if(button){button.disabled=true;button.textContent='Хадгалж байна...';}
    window.__nayadCriticalOperation='invoice-revision';
    try{
      const {error}=await sb().rpc('revise_confirmed_invoice',{p_invoice_id:invoiceId,p_invoice_no:invoiceNo,p_invoice_date:invoiceDate,p_due_date:dueDate,p_amount:invoiceAmount,p_discount_percent:discountPercent,p_discount_deadline:discountDeadline,p_reason:reason});
      if(error)throw error;
      close();
      await window.__nayadStartCloudSync?.({reason:'confirmed-invoice-revised',force:true});
      try{render();}catch(_){}
      notify('Падаан амжилттай залруулагдлаа.');
    }catch(error){console.error('Invoice revision:',error);notify(error?.message||'Падаан залруулахад алдаа гарлаа.');if(button){button.disabled=false;button.textContent='Залруулгыг хадгалах';}}
    finally{if(window.__nayadCriticalOperation==='invoice-revision')delete window.__nayadCriticalOperation;}
  };

  window.showInvoiceAgreement=function(invoiceId){
    const invoice=invoiceById(invoiceId),company=companyForInvoice(invoiceId);if(!invoice||!company)return;
    open(`<h2>Төлбөрийн тохиролцоо</h2><div class="agreementWarning"><b>${esc(company.name)}</b><span>${esc(invoice.no||'Дугааргүй')} · Үлдэгдэл ${amount(balanceOf(invoice))}</span><span>Анхны хугацаа: ${dateLabel(invoice.due_date)}</span></div><div class="field"><label>Шинэ төлөх огноо</label><input id="agreementDue" type="date" min="${today()}"></div><div class="field"><label>Тохиролцсон дүн</label><input id="agreementAmount" data-money-input type="text" inputmode="decimal" autocomplete="off" value="${moneyInputText(balanceOf(invoice))}"></div><div class="field"><label>Холбогдох хүн — заавал биш</label><input id="agreementContact"></div><div class="field"><label>Утас — заавал биш</label><input id="agreementPhone" type="tel"></div><div class="field"><label>Тайлбар</label><textarea id="agreementNote" maxlength="200" placeholder="Жишээ: Бараа нийлүүлэлт хойшилсон тул хугацааг сунгав."></textarea></div><div class="agreementInfo">Шинэ огноогоор сануулна. Анхны хугацаа түүхэнд хадгалагдана.</div><div class="actions"><button class="secondary" onclick="closeSheet()">Болих</button><button id="agreementSaveBtn" class="primary" onclick="saveInvoiceAgreement('${esc(invoiceId)}')">Тохиролцоо хадгалах</button></div>`);
  };

  window.saveInvoiceAgreement=async function(invoiceId){
    const due=document.getElementById('agreementDue')?.value,agreedAmount=moneyInputValue(document.getElementById('agreementAmount')?.value);
    if(!due||agreedAmount<=0){notify('Шинэ огноо, тохиролцсон дүнг оруулна уу.');return;}
    const button=document.getElementById('agreementSaveBtn');if(button)button.disabled=true;
    try{
      const {error}=await sb().rpc('set_invoice_agreement',{p_invoice_id:invoiceId,p_installments:[{due_date:due,amount:agreedAmount}],p_note:document.getElementById('agreementNote')?.value||null,p_contact_name:document.getElementById('agreementContact')?.value||null,p_contact_phone:document.getElementById('agreementPhone')?.value||null});
      if(error)throw error;close();notify('Төлбөрийн тохиролцоо хадгалагдлаа.');await window.__nayadStartCloudSync?.({reason:'agreement-saved',force:true});render();
    }catch(error){notify(error?.message||'Тохиролцоо хадгалахад алдаа гарлаа.');if(button)button.disabled=false;}
  };

  async function refreshNotifications(showBrowser=false){
    const storeId=activeStoreId(),client=sb();if(!storeId||!client)return;
    try{
      await client.rpc('refresh_my_due_notifications',{p_store_id:storeId});
      const {data:rows,error}=await client.from('due_notifications').select('id,invoice_id,kind,title,body,payload,created_at,read_at,snoozed_until').eq('store_id',storeId).is('read_at',null).order('created_at',{ascending:false}).limit(30);
      if(error)throw error;
      unreadNotifications=(rows||[]).filter(row=>!row.snoozed_until||new Date(row.snoozed_until)<=new Date());
      if(showBrowser&&unreadNotifications[0]&&'Notification' in window&&Notification.permission==='granted'){
        const registration=await navigator.serviceWorker?.ready;
        await registration?.showNotification(unreadNotifications[0].title,{body:unreadNotifications[0].body,icon:'./icon-192.png',tag:'nayad-'+unreadNotifications[0].id,data:unreadNotifications[0].payload});
      }
      if(typeof page!=='undefined'&&page==='payments')render();
    }catch(error){console.warn('Due notifications:',error);}
  }

  window.showNotificationCenter=function(){
    open(`<h2>Сануулга</h2><div class="noticeActions"><button class="secondary" onclick="enableNayadNotifications()">🔔 Төхөөрөмжийн мэдэгдэл</button><button class="secondary" onclick="refreshDueNotifications()">↻ Шинэчлэх</button></div>${unreadNotifications.length?unreadNotifications.map(row=>`<div class="notificationRow ${esc(row.kind)}"><div><b>${esc(row.title)}</b><span>${esc(row.body)}</span></div><div><button class="secondary" onclick="snoozeDueNotification('${esc(row.id)}')">1 цаг</button><button class="primary" onclick="readDueNotification('${esc(row.id)}')">Уншсан</button></div></div>`).join(''):'<div class="emptyPay"><b>Шинэ сануулга алга</b></div>'}<button class="secondary full" onclick="closeSheet()">Хаах</button>`);
  };
  window.enableNayadNotifications=async function(){
    if(!('Notification'in window)){notify('Энэ төхөөрөмж мэдэгдэл дэмжихгүй байна.');return;}
    const permission=await Notification.requestPermission();
    if(permission==='granted'){
      const storeId=activeStoreId(),userId=window.__nayadUser?.id||null;
      if(storeId&&userId){
        const {error}=await sb().from('notification_preferences').upsert({store_id:storeId,user_id:userId,browser_enabled:true,updated_at:new Date().toISOString()},{onConflict:'store_id,user_id'});
        if(error)console.warn('Notification preference:',error);
      }
      notify('Төхөөрөмжийн мэдэгдэл зөвшөөрөгдлөө.');
      await refreshNotifications(true);
    }else notify('Мэдэгдлийн зөвшөөрөл олгогдоогүй.');
  };
  window.refreshDueNotifications=async function(){await refreshNotifications(false);window.showNotificationCenter();};
  window.readDueNotification=async function(id){await sb().rpc('mark_due_notification_read',{p_notification_id:id,p_snooze_minutes:null});await refreshNotifications(false);window.showNotificationCenter();};
  window.snoozeDueNotification=async function(id){await sb().rpc('mark_due_notification_read',{p_notification_id:id,p_snooze_minutes:60});await refreshNotifications(false);window.showNotificationCenter();};

  window.payments=paymentCenter;
  window.reports=reportsV11;
  window.company=companyV11;
  window.payment=paymentForm;
  try{payments=paymentCenter;reports=reportsV11;company=companyV11;payment=paymentForm;sync=financeSync;}catch(_){ }

  const style=document.createElement('style');
  style.textContent=`
    .paymentHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.noticeButton{position:relative;width:44px;height:44px;padding:0;background:#fff;border:1px solid var(--line);font-size:23px}.noticeButton i{position:absolute;right:-4px;top:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--yellow);font:800 10px/18px sans-serif;color:#111}.paySummaryGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:20px 0 24px}.paySummary{min-width:0;min-height:126px;padding:12px 10px;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:var(--shadow-sm)}.paySummary.today{background:#fffaf0;border-color:#f3d56a}.paySummary.overdue{background:var(--red-soft);border-color:#f6caca}.paySummaryIcon{display:block;font-size:19px;margin-bottom:10px}.paySummary small{display:block;min-height:28px;color:#555;font-size:9px;font-weight:750;line-height:1.3}.paySummary b{display:block;margin-top:7px;font-size:15px;letter-spacing:-.4px;white-space:nowrap}.paySummary.overdue b{color:var(--red)}.paySummary em{display:block;margin-top:8px;color:var(--muted);font-size:9px;font-style:normal}.paymentSectionTitle{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:22px 4px 10px;font-size:11px;font-weight:850}.paymentSectionTitle small{color:var(--muted);font-size:9px;font-weight:650}.paymentSectionTitle b{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--yellow-soft);font-size:10px;line-height:20px;text-align:center}.dueList{display:flex;flex-direction:column;gap:10px}.dueRow{position:relative;display:grid;grid-template-columns:22px 42px 1fr auto;gap:8px;align-items:center;padding:12px 10px;background:#fff;border:1px solid var(--line);border-radius:17px;box-shadow:var(--shadow-sm);cursor:pointer}.dueRow:focus-visible,.invoiceClickable:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}.dueRow.overdue{border-color:#f1c3c3}.dueRank{align-self:start;width:21px;height:21px;border-radius:50%;background:var(--yellow);font-size:10px;font-weight:900;display:grid;place-items:center}.dueCompany .circle{width:40px;height:40px}.dueDetails{min-width:0}.dueDetails b,.dueDetails span{display:block}.dueDetails b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dueDetails span{margin-top:3px;color:var(--muted);font-size:9px}.dueDetails .dueExact{color:#444;font-weight:700}.dueDetails .dueState{display:inline-block;width:max-content;padding:3px 6px;border-radius:7px;background:#f3f3ef}.dueDetails .dueState.overdue{background:#fff0f0;color:#d33}.dueDetails .dueState.today,.dueDetails .dueState.soon{background:#fff4cc;color:#6a5200}.dueMoney{text-align:right}.dueMoney>b,.dueMoney>span{display:block}.dueMoney>b{font-size:12px;color:#111}.dueRow.overdue .dueMoney>b{color:var(--red)}.dueMoney>span{margin:4px 0;color:#27733f;font-size:8px}.dueMoney button{padding:6px 10px;font-size:10px;margin-top:6px}.dueMoney .linkButton{display:block;margin-left:auto;padding:2px 0;background:transparent;color:#555;text-decoration:underline}.emptyPay{padding:34px 18px;text-align:center;background:#fff;border:1px solid var(--line);border-radius:18px}.emptyPay b,.emptyPay span{display:block}.emptyPay span{margin-top:7px;color:var(--muted);font-size:11px}.draftSection{padding:2px 0}.draftRow{width:100%;margin-bottom:7px;padding:11px 13px;display:flex;align-items:center;justify-content:space-between;text-align:left;background:#fffaf0;border:1px dashed #e6c95f}.draftRow span b,.draftRow span small{display:block}.draftRow small{margin-top:4px;color:var(--muted);font-size:9px}.draftRow em{font-style:normal;color:#6a5200;font-size:10px}.invoiceStatus{display:inline-block!important;width:max-content;margin-top:5px;padding:3px 7px;border-radius:7px;background:#f2f2ee;color:#555;font-size:9px!important}.invoiceStatus.draft{background:#fff4cc;color:#725800}.invoiceStatus.cancelled{background:#fff0f0;color:#c33}.invoiceClickable{cursor:pointer}.detailHint{display:block;margin-top:6px;color:var(--muted);font-size:9px}.paySupplierCard,.invoiceDetailCard{padding:14px;background:#fff;border:1px solid var(--line);border-radius:15px}.paySupplierCard b,.paySupplierCard span,.invoiceDetailCard>b,.invoiceDetailCard>span{display:block}.paySupplierCard span,.invoiceDetailCard>span{margin-top:5px;color:var(--muted);font-size:10px}.detailGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.detailGrid small{display:block;color:var(--muted);font-size:10px}.detailGrid small b{display:block;margin-top:4px;color:#111;font-size:13px}.allocationRow{display:grid;grid-template-columns:24px 1fr 105px;gap:9px;align-items:center;padding:12px 8px;border-bottom:1px solid var(--line)}.allocationRow>input[type=checkbox]{width:19px;height:19px;accent-color:var(--yellow)}.allocationRow span b,.allocationRow span small,.allocationRow span em{display:block}.allocationRow span b{font-size:12px}.allocationRow span small{margin-top:4px;color:var(--muted);font-size:9px;line-height:1.35}.allocationRow span em{margin-top:5px;color:#2d7a42;font-size:9px;font-style:normal}.allocationAmount{width:100%;padding:10px 8px;border:1px solid var(--line);border-radius:10px;text-align:right;font-size:12px}.payTotal,.confirmPay span{display:flex;align-items:center;justify-content:space-between;gap:10px}.payTotal{padding:18px 4px 8px;font-weight:850}.payTotal b{font-size:22px}.confirmPay{border:1px solid var(--line);border-radius:16px;padding:13px}.confirmPay span{padding:10px 0;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px}.confirmPay span:last-child{border-bottom:0}.confirmPay b{color:#111;font-size:13px}.confirmPay .discountLine b{color:#267a42}.confirmPay .newBalance{font-weight:850}.confirmPay .newBalance b{font-size:18px}.agreementWarning,.agreementInfo{padding:13px;border:1px solid #f4caca;border-radius:14px;background:#fff5f5}.agreementWarning b,.agreementWarning span{display:block}.agreementWarning span{margin-top:5px;color:#a33;font-size:10px}.agreementInfo{border-color:#eed69b;background:#fffaf0;color:#654f16;font-size:10px;line-height:1.5}.noticeActions{display:flex;gap:8px;margin-bottom:12px}.noticeActions button{flex:1;padding:10px 8px;font-size:10px}.notificationRow{margin-bottom:9px;padding:12px;border:1px solid var(--line);border-radius:15px}.notificationRow.overdue{border-color:#f4caca;background:#fff8f8}.notificationRow b,.notificationRow span{display:block}.notificationRow span{margin-top:5px;color:var(--muted);font-size:10px}.notificationRow>div:last-child{display:flex;justify-content:flex-end;gap:7px;margin-top:10px}.notificationRow button{padding:7px 9px;font-size:9px}.reportGroup{margin-top:20px}@media(max-width:370px){.paySummaryGrid{gap:6px}.paySummary{padding:10px 7px}.paySummary b{font-size:13px}.dueRow{grid-template-columns:20px 36px 1fr auto;padding:10px 8px;gap:6px}.dueCompany .circle{width:34px;height:34px}.allocationRow{grid-template-columns:20px 1fr 88px}}
  `;
  document.head.appendChild(style);

  const nightStyle=document.createElement('style');
  nightStyle.textContent=`
    .noticeButton{display:grid;place-items:center;border-radius:14px;box-shadow:var(--shadow-sm);transition:transform .14s ease,background .18s ease}.noticeButton svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.noticeButton i{border:2px solid var(--surface);box-shadow:0 2px 5px rgba(0,0,0,.16)}
    html.nightMode .noticeButton{background:#272725;color:var(--yellow);border-color:#464640;box-shadow:0 5px 16px rgba(0,0,0,.28)}html.nightMode .noticeButton i{border-color:#272725}
    html.nightMode .paySummary{background:#1D1D1B;border-color:#3C3C38;box-shadow:0 7px 20px rgba(0,0,0,.22)}html.nightMode .paySummary.today{background:#31280D;border-color:#715D18}html.nightMode .paySummary.overdue{background:#3A2022;border-color:#743F43}html.nightMode .paySummary small{color:#D2D2CA}html.nightMode .paySummaryIcon{color:var(--yellow)}
    html.nightMode .dueRow{background:#1D1D1B;border-color:#3C3C38;box-shadow:0 7px 20px rgba(0,0,0,.22)}html.nightMode .dueRow.overdue{border-color:#743F43}html.nightMode .dueDetails b{color:#F4F4EF;font-size:13px;font-weight:900}html.nightMode .dueDetails .dueExact{color:#D1D1C8}html.nightMode .dueDetails .dueState{background:#30302D;color:#D8D8D0}html.nightMode .dueDetails .dueState.overdue{background:#472426;color:#FFD0D0}html.nightMode .dueDetails .dueState.today,html.nightMode .dueDetails .dueState.soon{background:#3B2E08;color:#FFE39A}html.nightMode .dueMoney>b{color:#F4F4EF}html.nightMode .dueMoney .linkButton{color:#D1D1C8}
    html.nightMode .emptyPay,html.nightMode .paySupplierCard,html.nightMode .invoiceDetailCard{background:#1D1D1B;border-color:#3C3C38}html.nightMode .draftRow{background:#31280D;border-color:#715D18}html.nightMode .draftRow em{color:#FFE39A}html.nightMode .invoiceStatus{background:#30302D;color:#D8D8D0}html.nightMode .invoiceStatus.draft{background:#3B2E08;color:#FFE39A}html.nightMode .invoiceStatus.cancelled{background:#472426;color:#FFD0D0}
    html.nightMode .detailGrid small b,html.nightMode .confirmPay b{color:#F4F4EF}html.nightMode .allocationAmount{background:#252523;color:#F4F4EF;border-color:#4A4A45}html.nightMode .agreementWarning{background:#3A2022;border-color:#743F43}html.nightMode .agreementWarning span{color:#FFD0D0}html.nightMode .agreementInfo{background:#31280D;border-color:#715D18;color:#FFE39A}html.nightMode .notificationRow{background:#1D1D1B;border-color:#3C3C38}html.nightMode .notificationRow.overdue{background:#3A2022;border-color:#743F43}
  `;
  document.head.appendChild(nightStyle);

  window.addEventListener('load',()=>setTimeout(()=>refreshNotifications(true),2200));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>refreshNotifications(false),500);});
})();
