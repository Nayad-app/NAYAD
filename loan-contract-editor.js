/* Two-step contract schedule editor. Production data is read only until Save. */
(function(){
  'use strict';
  const B=window.NayadLoanEditorBridge,S=window.NayadLoanSchedule;
  if(!B||!S)return;
  let requestId=null;
  let simpleMode=true;
  let draft=null,rows=[],savedRows=[],loan=null,storeId=null,userId=null,busy=false,revision=0,files=[],savedId=null,step=1,returnFocus=null;
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('mn-MN',{maximumFractionDigits:2}).format(Number(v)||0)+' ₮';
  const value=id=>$(id)?.value??'';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ulaanbaatar'}).format(new Date());
  const error=e=>{$('contractError').textContent=e.message||String(e);$('contractError').focus();};
  function contextOK(){return storeId===B.storeId()&&userId===window.__nayadUser?.id&&B.canManage();}
  function close(){if(busy)return;$('loanContractOverlay')?.remove();document.body.classList.remove('loanFormOpen');draft=null;files=[];returnFocus?.focus?.();}
  function open(id){
    if(!B.canManage())return window.toast?.('Зээлийг зөвхөн эзэн эсвэл менежер бүртгэнэ.');
    if(busy)return;window.closeSheet?.();B.closeLegacy();close();returnFocus=document.activeElement;
    loan=id?B.find(id):null;if(id&&!loan)return window.toast?.('Зээл олдсонгүй.');
    storeId=B.storeId();userId=window.__nayadUser?.id;revision=loan?.schedule_revision||0;requestId=window.crypto.randomUUID();savedId=null;files=[];step=1;
    rows=loan?loan.installments.map(r=>({...r})):[];savedRows=rows.map(r=>({...r}));
    draft=loan?{lenderType:loan.lender_type,lenderName:loan.lender_name,loanName:loan.loan_name,principal:loan.principal,startDate:loan.start_date,firstDate:rows[0]?.due_date||'',paymentDay:loan.payment_day,term:loan.term_months,regular:rows[0]?.total_amount||'',last:rows.at(-1)?.total_amount||''}:{lenderType:'bank',lenderName:'',loanName:'',principal:'',startDate:today(),firstDate:'',paymentDay:'',term:'',regular:'',last:''};
    draft.paymentDetails={...(loan?.payment_details||{})};
    simpleMode=!loan||loan.principal==null;draft.endDate=rows.at(-1)?.due_date||'';
    drawForm();
  }
  function frame(title,body,button,action){
    $('loanContractOverlay')?.remove();const root=document.createElement('div');root.id='loanContractOverlay';root.className='loanContractOverlay';
    root.innerHTML=`<section class="loanContractDialog" role="dialog" aria-modal="true" aria-labelledby="contractTitle"><header>${step===2?'<button type="button" data-action="back" aria-label="Буцах">←</button>':''}<h2 id="contractTitle">${title}</h2><button type="button" data-action="close" aria-label="Хаах">×</button></header><div class="loanContractBody">${body}<p id="contractError" role="alert" tabindex="-1"></p></div><footer><button type="button" id="contractPrimary" class="primary full" data-action="${action}">${button}</button></footer></section>`;
    document.body.appendChild(root);document.body.classList.add('loanFormOpen');
    root.addEventListener('click',onClick);root.addEventListener('change',onChange);
    root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...root.querySelectorAll('button,input,select,[tabindex="0"]')].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
    root.querySelector('input,button')?.focus();
  }
  const field=(label,id,v,type='text',attrs='')=>`<label class="contractField"><span>${label}</span><input id="${id}" type="${type}" value="${esc(v)}" ${attrs}></label>`;
  function bankFields(){
    return `<details class="contractBankDetails"><summary>Банк, дансны мэдээлэл <small>Заавал биш</small></summary>
      ${field('Банк','cBank',draft.paymentDetails?.bank||'','text','maxlength="120" list="loanBankOptions"')}<datalist id="loanBankOptions">${['ХААН банк','Голомт банк','Худалдаа хөгжлийн банк','Төрийн банк','ХасБанк','Капитрон банк','Богд банк'].map(n=>`<option value="${n}"></option>`).join('')}</datalist>
      ${field('Данс эзэмшигчийн нэр','cHolder',draft.paymentDetails?.holder||'','text','maxlength="120"')}${field('IBAN','cIban',draft.paymentDetails?.iban||'','text','maxlength="120" autocapitalize="characters"')}${field('Дансны дугаар','cAccount',draft.paymentDetails?.account||'','text','maxlength="120"')}${field('Гүйлгээний утга','cReference',draft.paymentDetails?.reference||'','text','maxlength="300"')}
      </details>`;
  }
  function paymentDetails(){return Object.fromEntries([['bank','cBank'],['holder','cHolder'],['iban','cIban'],['account','cAccount'],['reference','cReference']].map(([k,id])=>[k,value(id).trim()]));}
  function readSimple(){
    const name=value('cName').trim();if(!name)throw Error('Зээлийн нэрийг оруулна уу.');
    const result=S.simple(value('cFirst'),value('cEnd'),value('cRegular'));
    const changed=rows.length&&['firstDate','endDate','regular'].some(k=>String(result.draft[k])!==String(draft[k]));
    if(changed&&loan&&savedRows.some(r=>r.status==='paid'))throw Error('Төлсөн түүхтэй байна. Хуваарь харах хэсгээс төлөөгүй мөрөө засна уу.');
    if(!rows.length||changed)rows=result.rows;
    draft={...draft,...result.draft,lenderType:loan?.lender_type||'person',lenderName:loan?.lender_name||name,loanName:name,paymentDetails:paymentDetails()};
    if(loan)draft.startDate=loan.start_date;
    S.validate(draft,rows);return true;
  }
  function drawSimple(){
    step=1;frame(loan?'Зээл засах':'Зээл нэмэх',`${field('Зээлийн нэр','cName',draft.loanName,'text','maxlength="120" placeholder="Жишээ: ХААН банкны зээл"')}
      ${field('Сар бүр төлөх дүн','cRegular',draft.regular,'text','inputmode="decimal" placeholder="850,000"')}
      ${field(loan?'Хуваарийн эхний төлөх өдөр':'Дараагийн төлөх өдөр','cFirst',draft.firstDate,'date')}${field('Зээл дуусах өдөр','cEnd',draft.endDate,'date')}
      ${bankFields()}<button type="button" class="contractDisclosure" data-action="advanced">Дэлгэрэнгүй бүртгэх <span>›</span></button>
      ${loan?'<button type="button" class="contractDisclosure" data-action="simplePreview">Хуваарь харах / засах <span>›</span></button>':''}`,loan?'ӨӨРЧЛӨЛТ ХАДГАЛАХ':'Зээл бүртгэх','simpleSave');
    const footer=$('contractPrimary').parentElement;footer.classList.add('contractSimpleFooter');footer.insertAdjacentHTML('afterbegin','<button type="button" class="secondary" data-action="close">Болих</button>');
  }
  function drawForm(){
    if(simpleMode)return drawSimple();
    step=1;
    frame(loan?'Зээл засах':'Зээл бүртгэх',`
      <label class="contractField"><span>Зээл олгогчийн төрөл</span><select id="cType">${[['bank','Банк'],['nbfi','ББСБ'],['person','Хувь хүн']].map(([v,t])=>`<option value="${v}" ${draft.lenderType===v?'selected':''}>${t}</option>`).join('')}</select></label>
      ${field('Банк / ББСБ / хүний нэр','cLender',draft.lenderName,'text','maxlength="120"')}${field('Зээлийн нэр','cName',draft.loanName,'text','maxlength="120"')}
      ${field('Зээлийн дүн','cPrincipal',draft.principal,'text','inputmode="decimal"')}
      <div class="contractGrid">${field('Зээл авсан огноо','cStart',draft.startDate,'date')}${field('Анхны төлөлт','cFirst',draft.firstDate,'date')}${field('Сар бүр төлөх өдөр','cDay',draft.paymentDay,'number','min="1" max="31"')}${field('Төлөлтийн тоо','cTerm',draft.term,'number','min="1" max="600"')}</div>
      ${field('Сар бүр төлөх дүн','cRegular',draft.regular,'text','inputmode="decimal"')}${field('Сүүлийн төлөлтийн дүн','cLast',draft.last,'text','inputmode="decimal" placeholder="Ижил бол хоосон үлдээнэ"')}
      <details class="contractBankDetails" ${Object.values(draft.paymentDetails||{}).some(Boolean)?'open':''}><summary>Төлбөрийн дансны мэдээлэл · заавал биш</summary>
      ${field('Банк','cBank',draft.paymentDetails?.bank||'','text','maxlength="120"')}${field('Данс эзэмшигч','cHolder',draft.paymentDetails?.holder||'','text','maxlength="120"')}${field('IBAN','cIban',draft.paymentDetails?.iban||'','text','maxlength="120" autocapitalize="characters"')}${field('Дансны дугаар','cAccount',draft.paymentDetails?.account||'','text','maxlength="120"')}${field('Гүйлгээний утга','cReference',draft.paymentDetails?.reference||'','text','maxlength="300" placeholder="Гэрээний дугаар, шаардсан утга"')}
      <p class="contractHelp">Дараа нь нөхөж оруулж болно. Төлөх үед энд хадгалсан мэдээллийг хуулна.</p></details>
      ${loan?'<p class="contractHelp">Хавсаргасан гэрээ болон төлсөн түүх хэвээр хадгалагдана.</p>':`<label class="contractFile">▧ Хуваарийн зураг / PDF хавсаргах<input id="cFiles" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" multiple></label><small class="contractHelp">Заавал биш · 20 хүртэл файл · тус бүр 10MB</small><div id="cFileList">${fileList()}</div>`}`,'ХУВААРЬ ХАРАХ','preview');
  }
  function fileList(){return files.map((f,i)=>`<div class="contractFileRow"><span>${esc(f.name)}</span><button type="button" data-action="removeFile" data-index="${i}" aria-label="Файл хасах">×</button></div>`).join('');}
  function readForm(){
    const d={lenderType:value('cType'),lenderName:value('cLender').trim(),loanName:value('cName').trim(),principal:S.money(value('cPrincipal')),startDate:value('cStart'),firstDate:value('cFirst'),paymentDay:Number(value('cDay')),term:Number(value('cTerm')),regular:S.money(value('cRegular')),last:value('cLast')===''?'':S.money(value('cLast'))};
    if(!d.lenderName||!d.loanName)throw Error('Зээл олгогч болон зээлийн нэрийг оруулна уу.');
    d.paymentDetails=Object.fromEntries([['bank','cBank'],['holder','cHolder'],['iban','cIban'],['account','cAccount'],['reference','cReference']].map(([k,id])=>[k,value(id).trim()]));
    const generated=S.generate(d),keys=['startDate','firstDate','paymentDay','term','regular','last'];
    const changed=rows.length&&keys.some(k=>String(d[k])!==String(draft[k]));
    if(changed){
      if(loan&&savedRows.some(r=>r.status==='paid'))throw Error('Төлсөн түүхтэй зээлийн хуваарийг дахин үүсгэхгүй. Хуваарь дотор төлөөгүй мөрүүдээ засна уу.');
      if(!confirm('Хуваарийн огноо эсвэл дүн өөрчлөгдсөн байна. Мөрүүдэд хийсэн засварыг шинэ хуваариар солих уу?'))return false;
    }
    if(!rows.length||changed)rows=generated;draft=d;S.validate(draft,rows);return true;
  }
  function drawSchedule(){
    step=2;const total=rows.reduce((sum,r)=>sum+Math.round(r.total_amount*100),0)/100;
    frame('Төлөлтийн хуваарь',`<h3>${esc(draft.loanName)}</h3><p class="contractHelp">${rows.length} төлөлт · Сар бүрийн ${draft.paymentDay}<br>Огноо, дүнг банкны хуваарьтай тулгаж засна уу.</p>
      <div class="contractRows">${rows.map((r,i)=>{const locked=Boolean(loan&&savedRows[i]?.status==='paid');return `<div class="contractRow" data-row="${i}"><div class="contractGrid">${field(`${i+1}-р төлөлт`,'cDate'+i,r.due_date,'date',`data-key="due_date" ${locked?'disabled':''}`)}${field('Төлөх дүн','cTotal'+i,r.total_amount,'text',`inputmode="decimal" data-key="total_amount" ${locked?'disabled':''}`)}</div>
      <details><summary>Үндсэн зээл, хүүгийн задаргаа</summary><small class="contractHelp">Заавал биш. Банкны хуваарь дээрх дүнг оруулна.</small><div class="contractGrid">${field('Үндсэн зээл','cPrincipal'+i,r.principal_amount??'','text',`inputmode="decimal" data-key="principal_amount" ${locked?'disabled':''}`)}${field('Хүү','cInterest'+i,r.interest_amount??'','text',`inputmode="decimal" data-key="interest_amount" ${locked?'disabled':''}`)}</div></details>
      ${locked?'<small class="contractPaid">Төлсөн · Түүх хадгалагдана</small>':!loan?`<div class="contractHistory" ${$('cHistory')?.checked?'':'hidden'}><label><input type="checkbox" data-key="paid" ${r.status==='paid'?'checked':''}> Төлсөн</label><input aria-label="Төлсөн огноо ${i+1}" type="date" data-key="paid_at" value="${esc(r.paid_at?.slice(0,10)||'')}" max="${today()}" ${r.status==='paid'?'':'hidden'}></div>`:''}</div>`;}).join('')}</div>
      ${!loan?'<label class="contractHistoryToggle"><input id="cHistory" type="checkbox"> Өмнөх төлөлтүүдийг тэмдэглэх</label>':''}
      <p class="contractHelp">Задаргаа оруулаагүй бол үндсэн зээл, хүүг таамгаар тооцохгүй.</p><div class="contractTotal"><span>Нийт төлөх</span><b id="cSum">${money(total)}</b></div>`,loan?'ӨӨРЧЛӨЛТ ХАДГАЛАХ':'ЗЭЭЛ ХАДГАЛАХ','save');
    if(!loan&&rows.some(r=>r.status==='paid')){$('cHistory').checked=true;document.querySelectorAll('.contractHistory').forEach(n=>n.hidden=false);}
  }
  function captureRows(){
    document.querySelectorAll('.contractRow').forEach((el,i)=>{
      const r=rows[i];if(loan&&savedRows[i]?.status==='paid')return;
      r.due_date=el.querySelector('[data-key="due_date"]').value;
      r.total_amount=S.money(el.querySelector('[data-key="total_amount"]').value);
      for(const k of ['principal_amount','interest_amount']){const v=el.querySelector(`[data-key="${k}"]`).value;r[k]=v===''?null:S.money(v,true);}
      if(!loan){const paid=el.querySelector('[data-key="paid"]').checked,date=el.querySelector('[data-key="paid_at"]').value;r.status=paid?'paid':'pending';r.paid_amount=paid?r.total_amount:0;r.paid_at=paid&&date?date+'T12:00:00+08:00':null;}
    });
  }
  function onClick(e){
    const b=e.target.closest('[data-action]');if(!b||busy)return;
    try{switch(b.dataset.action){case 'simpleSave':if(readSimple())save();break;case 'simplePreview':if(readSimple())drawSchedule();break;case 'advanced':
      draft.loanName=value('cName').trim();draft.regular=value('cRegular');draft.firstDate=value('cFirst');draft.endDate=value('cEnd');draft.paymentDay=Number(draft.firstDate.slice(-2))||'';draft.paymentDetails=paymentDetails();
      if(!loan){draft.lenderName=draft.paymentDetails.bank||draft.loanName;draft.principal='';}
      simpleMode=false;drawForm();break;
      case 'close':close();break;case 'preview':if(readForm())drawSchedule();break;case 'back':captureRows();drawForm();break;case 'save':save();break;case 'finish':close();B.sync();break;case 'removeFile':files.splice(Number(b.dataset.index),1);$('cFileList').innerHTML=fileList();break;}}
    catch(e){error(e);}
  }
  function onChange(e){
    try{
      if(e.target.id==='cFirst'&&!value('cDay'))$('cDay').value=Number(e.target.value.slice(-2));
      if(e.target.id==='cFiles'){
        for(const f of Array.from(e.target.files||[])){if(files.length>=20)throw Error('20 хүртэл файл хавсаргана.');if(!['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'].includes(f.type)||!f.size||f.size>10*1024*1024)throw Error('Хоосон, дэмжихгүй эсвэл 10MB-аас том файл байна.');files.push(f);}
        e.target.value='';$('cFileList').innerHTML=fileList();
      }
      if(e.target.id==='cHistory'){
        if(!e.target.checked&&rows.some(r=>r.status==='paid')){if(!confirm('Энэ бүртгэл дээр тэмдэглэсэн өмнөх төлөлтүүдийг арилгах уу?')){e.target.checked=true;return;}rows.forEach(r=>{r.status='pending';r.paid_amount=0;r.paid_at=null;});drawSchedule();}
        document.querySelectorAll('.contractHistory').forEach(n=>n.hidden=!$('cHistory').checked);
      }
      if(e.target.dataset.key==='paid'){e.target.closest('.contractRow').querySelector('[data-key="paid_at"]').hidden=!e.target.checked;}
      if(e.target.closest('.contractRow')){captureRows();$('cSum').textContent=money(rows.reduce((s,r)=>s+Math.round(r.total_amount*100),0)/100);}
    }catch(e){error(e);}
  }
  async function save(){
    if(busy)return;
    try{
      if(!contextOK())throw Error('Дэлгүүр эсвэл хэрэглэгч өөрчлөгдсөн байна. Цонхоо дахин нээнэ үү.');
      if(!savedId){captureRows();S.validate(draft,rows);}
      busy=true;window.__nayadCriticalOperation='loan-contract-save';
      document.querySelectorAll('#loanContractOverlay input,#loanContractOverlay button,#loanContractOverlay select').forEach(n=>n.disabled=true);$('contractPrimary').textContent='Хадгалж байна…';
      if(!savedId){
        const {data,error:rpcError}=await B.client().rpc('save_contract_loan_v2',{p_payment_details:draft.paymentDetails,p_request_id:requestId,p_store_id:storeId,p_loan_id:loan?.id||null,p_expected_revision:loan?revision:null,p_lender_type:draft.lenderType,p_lender_name:draft.lenderName,p_loan_name:draft.loanName,p_principal:draft.principal,p_start_date:draft.startDate,p_payment_day:draft.paymentDay,p_rows:rows.map(({installment_number,due_date,total_amount,principal_amount,interest_amount,status,paid_at})=>({installment_number,due_date,total_amount,principal_amount,interest_amount,status,paid_at}))});
        if(rpcError)throw rpcError;savedId=data;
      }
      if(files.length)await B.upload({id:savedId},storeId,userId,files);
      busy=false;close();window.toast?.('Зээл болон төлөлтийн хуваарь хадгалагдлаа.');await B.sync();window.render?.();
    }catch(e){
      busy=false;
      if(savedId){frame('Зээл хадгалагдсан','<p>Зээл болон хуваарь хадгалагдсан. Харин хавсралт хадгалагдсангүй. Дахин оролдоход зээл давхар бүртгэгдэхгүй.</p><button type="button" class="secondary" data-action="finish">Хавсралтгүй дуусгах</button>','ХАВСРАЛТЫГ ДАХИН ХАДГАЛАХ','save');error(e);await B.sync();}
      else{if(simpleMode&&step===1)drawSimple();else drawSchedule();error(e);}
    }finally{busy=false;if(window.__nayadCriticalOperation==='loan-contract-save')delete window.__nayadCriticalOperation;}
  }
  window.showLoanCreate=()=>open();window.showLoanEdit=id=>open(id);
  window.NayadContractEditor={close};
})();
