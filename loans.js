/* NAYAD loans — monthly schedule, manual payment tracking and private contracts. */
(function(){
  if(window.__nayadLoansV1)return;
  window.__nayadLoansV1=true;

  const BUCKET='loan-contracts';
  const MAX_FILES=20;
  const MAX_FILE_BYTES=10*1024*1024;
  const ALLOWED_TYPES=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']);
  const state={loans:[],loading:false,storeId:'',files:[],draft:null};
  let objectUrls=[];

  function sb(){return window.nayadSupabase||window.sb||null;}
  function esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function amount(value){return new Intl.NumberFormat('mn-MN',{maximumFractionDigits:2}).format(Number(value)||0)+' ₮';}
  function parseAmount(value){return window.__nayadParseMoneyInput?.(value)||Number(String(value||'').replace(/,/g,''))||0;}
  function activeStore(){return window.__nayadActiveStore||null;}
  function activeStoreId(){return window.__nayadActiveStoreId||activeStore()?.id||null;}
  function canManage(){return ['owner','manager'].includes(activeStore()?.role||'');}
  function notify(message){window.toast?.(message);}
  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ulaanbaatar'}).format(new Date());}
  function dateLabel(value){if(!value)return '—';const [y,m,d]=String(value).split('-');return `${y}.${m}.${d}`;}
  function round2(value){return Math.round((Number(value)||0)*100)/100;}
  function daysBetween(from,to){return Math.round((new Date(to+'T00:00:00Z')-new Date(from+'T00:00:00Z'))/86400000);}
  function dueText(value){const days=daysBetween(today(),value);if(days<0)return `${Math.abs(days)} хоног хэтэрсэн`;if(days===0)return 'Өнөөдөр';if(days===1)return 'Маргааш';return `${days} хоногийн дараа`;}
  function lenderTypeLabel(value){return value==='bank'?'Банк':value==='nbfi'?'ББСБ':'Хувь хүн';}
  function methodLabel(value){return value==='equal_principal'?'Үндсэн төлбөр тэнцүү':'Тэнцүү төлөлт';}
  function initials(value){return String(value||'З').trim().slice(0,1).toUpperCase();}
  function uuid(){return window.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;}

  function attachRelations(loans,installments,documents){
    return loans.map(loan=>({
      ...loan,
      installments:installments.filter(row=>String(row.loan_id)===String(loan.id)).sort((a,b)=>a.installment_number-b.installment_number),
      documents:documents.filter(row=>String(row.loan_id)===String(loan.id)).sort((a,b)=>a.page_number-b.page_number)
    }));
  }

  async function syncLoans(){
    const client=sb(),storeId=activeStoreId();
    if(!client||!storeId||!canManage()){state.loans=[];state.storeId=storeId||'';return false;}
    if(state.loading)return false;
    state.loading=true;
    try{
      const [loanResult,installmentResult,documentResult]=await Promise.all([
        client.from('loans').select('id,store_id,lender_type,lender_name,loan_name,principal,annual_interest_rate,start_date,term_months,payment_day,repayment_method,status,created_at').eq('store_id',storeId).order('created_at',{ascending:false}),
        client.from('loan_installments').select('id,loan_id,store_id,installment_number,due_date,principal_amount,interest_amount,total_amount,paid_amount,status,paid_at').eq('store_id',storeId).order('due_date',{ascending:true}),
        client.from('loan_documents').select('id,loan_id,store_id,storage_path,file_name,mime_type,page_number,size_bytes').eq('store_id',storeId).order('page_number',{ascending:true})
      ]);
      if(loanResult.error)throw loanResult.error;
      if(installmentResult.error)throw installmentResult.error;
      if(documentResult.error)throw documentResult.error;
      if(String(activeStoreId()||'')!==String(storeId))return false;
      state.loans=attachRelations(loanResult.data||[],installmentResult.data||[],documentResult.data||[]);
      state.storeId=storeId;
      if(typeof page!=='undefined'&&(page==='loans'||page==='payments'))window.render?.();
      return true;
    }catch(error){console.warn('NAYAD loans sync:',error);notify(error?.message||'Зээлийн мэдээлэл ачаалж чадсангүй.');return false;}
    finally{state.loading=false;}
  }

  function pendingRows(loan){return (loan.installments||[]).filter(row=>row.status!=='paid').sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)));}
  function outstandingPrincipal(loan){return round2(pendingRows(loan).reduce((sum,row)=>sum+Number(row.principal_amount||0),0));}
  function nextInstallment(loan){return pendingRows(loan)[0]||null;}
  function allPending(){return state.loans.filter(loan=>loan.status==='active').flatMap(loan=>pendingRows(loan).map(row=>({loan,row})));}

  function loanPage(){
    const storeId=activeStoreId();
    if(!canManage())return `<div class="hello">Санхүүгийн хяналт</div><div class="name">Зээлүүд</div><div class="card center" style="margin-top:22px;padding:34px 18px"><b>Зээлийн мэдээлэл хязгаарлагдсан</b><span class="sub">Зөвхөн дэлгүүрийн эзэн болон менежер харах боломжтой.</span></div>`;
    if(storeId&&String(state.storeId)!==String(storeId)&&!state.loading)setTimeout(syncLoans,0);
    const pending=allPending(),current=today(),month=current.slice(0,7);
    const outstanding=state.loans.filter(loan=>loan.status==='active').reduce((sum,loan)=>sum+outstandingPrincipal(loan),0);
    const thisMonth=pending.filter(item=>String(item.row.due_date).slice(0,7)===month).reduce((sum,item)=>sum+Number(item.row.total_amount||0),0);
    const overdue=pending.filter(item=>item.row.due_date<current).reduce((sum,item)=>sum+Number(item.row.total_amount||0),0);
    const cards=state.loans.filter(loan=>loan.status==='active').map(loan=>loanCard(loan)).join('');
    return `<div class="loanHead"><div><div class="hello">Санхүүгийн хяналт</div><div class="name">Зээлүүд</div></div><button class="primary loanAddMini" type="button" onclick="showLoanCreate()" aria-label="Зээл нэмэх">＋</button></div>
      <div class="loanSummaryGrid"><div class="loanSummary"><small>Нийт үлдэгдэл</small><b>${amount(outstanding)}</b></div><div class="loanSummary"><small>Энэ сард төлөх</small><b>${amount(thisMonth)}</b></div><div class="loanSummary overdue"><small>Хугацаа хэтэрсэн</small><b>${amount(overdue)}</b></div></div>
      <div class="paymentSectionTitle"><span>ТӨЛӨХ ХУВААРЬ</span><small>Ойрын төлөлтөөр</small></div>
      <div class="loanList">${state.loading&&!state.loans.length?'<div class="card center sub">Зээлийн мэдээлэл ачаалж байна...</div>':cards||'<div class="emptyPay"><b>Зээл бүртгэгдээгүй</b><span>Банк, ББСБ эсвэл хувь хүний зээлээ энд бүртгэнэ.</span></div>'}</div>
      <button class="primary full loanAddFull" type="button" onclick="showLoanCreate()">＋ Зээл нэмэх</button>`;
  }

  function loanCard(loan){
    const next=nextInstallment(loan),overdue=next&&next.due_date<today();
    return `<article class="loanCard ${overdue?'overdue':''}" role="button" tabindex="0" onclick="showLoanDetails('${esc(loan.id)}')"><div class="loanCardTop"><span class="loanAvatar ${esc(loan.lender_type)}">${esc(initials(loan.lender_name))}</span><span class="loanCardName"><b>${esc(loan.lender_name)}</b><small>${esc(loan.loan_name)}</small></span><span class="loanBalance"><small>Үлдэгдэл</small><b>${amount(outstandingPrincipal(loan))}</b></span></div>${next?`<div class="loanDue"><span><small>${dateLabel(next.due_date)} · ${esc(dueText(next.due_date))}</small><b class="${overdue?'redText':''}">${amount(next.total_amount)}</b></span><button class="primary" type="button" onclick="event.stopPropagation();markLoanInstallmentPaid('${esc(loan.id)}','${esc(next.id)}')">Төлөх</button></div>`:'<div class="loanDue"><b class="greenText">Бүрэн төлөгдсөн</b></div>'}</article>`;
  }

  function overlay(){return document.getElementById('loanFormOverlay');}
  function revokeUrls(){objectUrls.forEach(url=>URL.revokeObjectURL(url));objectUrls=[];}
  function closeLoanCreate(){revokeUrls();state.files=[];state.draft=null;overlay()?.remove();document.body.classList.remove('loanFormOpen');}
  function fieldValue(id){return document.getElementById(id)?.value||'';}
  function setLenderType(value){document.getElementById('loanLenderType').value=value;document.querySelectorAll('.loanSegment button').forEach(button=>button.classList.toggle('active',button.dataset.value===value));}

  function showLoanCreate(){
    if(!canManage())return notify('Зээлийг зөвхөн эзэн эсвэл менежер бүртгэнэ.');
    closeLoanCreate();
    const root=document.createElement('section');root.id='loanFormOverlay';root.className='loanFormOverlay';
    root.innerHTML=`<div class="loanFormHeader"><button type="button" onclick="closeLoanCreate()" aria-label="Буцах">←</button><span class="nayadWord"><span>N</span><span>A</span><span class="y">Y</span><span>A</span><span>D</span></span><i></i></div><div class="loanFormBody"><h1>Шинэ зээл бүртгэх</h1><p>Зээлийн үндсэн мэдээллээ оруулна уу</p><div class="loanFormLabel">Зээл олгогчийн төрөл</div><input id="loanLenderType" type="hidden" value="bank"><div class="loanSegment"><button class="active" data-value="bank" onclick="setLoanLenderType('bank')" type="button">Банк</button><button data-value="nbfi" onclick="setLoanLenderType('nbfi')" type="button">ББСБ</button><button data-value="person" onclick="setLoanLenderType('person')" type="button">Хувь хүн</button></div><div class="field"><label>Байгууллага / хүний нэр</label><input id="loanLenderName" maxlength="120" placeholder="Жишээ: ХААН банк"></div><div class="field"><label>Зээлийн нэр</label><input id="loanName" maxlength="120" placeholder="Жишээ: Бизнесийн зээл"></div><div class="loanFormGrid"><div class="field"><label>Авсан дүн</label><input id="loanPrincipal" data-money-input inputmode="decimal" placeholder="10,000,000"></div><div class="field"><label>Жилийн хүү</label><input id="loanInterest" type="number" inputmode="decimal" min="0" max="1000" step="0.01" placeholder="18"></div><div class="field"><label>Авсан огноо</label><input id="loanStartDate" type="date" value="${today()}"></div><div class="field"><label>Хугацаа</label><input id="loanTerm" type="number" inputmode="numeric" min="1" max="600" placeholder="24 сар"></div></div><div class="loanFormLabel">Зээлийн гэрээ</div><div class="loanAttachmentChoices"><button type="button" onclick="document.getElementById('loanCameraInput').click()"><span>⌾</span><b>Зураг авах</b></button><button type="button" onclick="document.getElementById('loanGalleryInput').click()"><span>▧</span><b>Зургаас сонгох</b></button><button type="button" onclick="document.getElementById('loanPdfInput').click()"><span>PDF</span><b>PDF оруулах</b></button></div><input id="loanCameraInput" class="hide" type="file" accept="image/*" capture="environment" onchange="selectLoanFiles(this.files)"><input id="loanGalleryInput" class="hide" type="file" accept="image/*" multiple onchange="selectLoanFiles(this.files)"><input id="loanPdfInput" class="hide" type="file" accept="application/pdf" multiple onchange="selectLoanFiles(this.files)"><div id="loanFilePreview" class="loanFilePreview"></div><small class="loanFileHelp">Олон зураг нэг дор сонгож болно</small></div><div class="loanFormFooter"><button id="loanContinueBtn" class="primary full" type="button" onclick="continueLoanCreate()">Үргэлжлүүлэх</button></div>`;
    document.getElementById('app')?.appendChild(root);document.body.classList.add('loanFormOpen');window.__nayadPrepareMoneyInputs?.(root);
  }

  function selectLoanFiles(fileList){
    const incoming=Array.from(fileList||[]);
    for(const file of incoming){
      const type=String(file.type||'').toLowerCase();
      if(!ALLOWED_TYPES.has(type)){notify(`${file.name}: дэмжихгүй файл байна.`);continue;}
      if(file.size>MAX_FILE_BYTES){notify(`${file.name}: 10MB-аас их байна.`);continue;}
      if(state.files.length>=MAX_FILES){notify(`Нэг гэрээнд ${MAX_FILES} хүртэл файл оруулна.`);break;}
      state.files.push(file);
    }
    for(const id of ['loanCameraInput','loanGalleryInput','loanPdfInput']){const input=document.getElementById(id);if(input)input.value='';}
    renderFilePreviews();
  }

  function renderFilePreviews(){
    revokeUrls();const target=document.getElementById('loanFilePreview');if(!target)return;
    target.innerHTML=state.files.map((file,index)=>{
      const isPdf=file.type==='application/pdf',url=isPdf?'':URL.createObjectURL(file);if(url)objectUrls.push(url);
      return `<div class="loanFileTile">${isPdf?'<span class="loanPdfTile">PDF</span>':`<img src="${esc(url)}" alt="">`}<button class="loanFileRemove" type="button" onclick="removeLoanFile(${index})" aria-label="Хасах">×</button><small>${index+1}-р хуудас</small><div class="loanFileOrder"><button type="button" ${index===0?'disabled':''} onclick="moveLoanFile(${index},-1)">←</button><button type="button" ${index===state.files.length-1?'disabled':''} onclick="moveLoanFile(${index},1)">→</button></div></div>`;
    }).join('')+`<button class="loanFileAdd" type="button" onclick="document.getElementById('loanGalleryInput').click()"><b>＋</b><span>Нэмэх</span></button>`;
  }

  function removeLoanFile(index){state.files.splice(index,1);renderFilePreviews();}
  function moveLoanFile(index,direction){const next=index+direction;if(next<0||next>=state.files.length)return;[state.files[index],state.files[next]]=[state.files[next],state.files[index]];renderFilePreviews();}

  function readLoanDraft(){
    const lenderType=fieldValue('loanLenderType'),lenderName=fieldValue('loanLenderName').trim(),loanName=fieldValue('loanName').trim(),principal=parseAmount(fieldValue('loanPrincipal')),interest=Number(fieldValue('loanInterest')),startDate=fieldValue('loanStartDate'),term=Number(fieldValue('loanTerm'));
    if(!lenderName||!loanName)return notify('Зээл олгогч болон зээлийн нэрийг оруулна уу.');
    if(!(principal>0))return notify('Авсан дүнг зөв оруулна уу.');
    if(!Number.isFinite(interest)||interest<0||interest>1000)return notify('Жилийн хүүг зөв оруулна уу.');
    if(!startDate)return notify('Авсан огноог сонгоно уу.');
    if(!Number.isInteger(term)||term<1||term>600)return notify('Зээлийн хугацааг сараар зөв оруулна уу.');
    return {lenderType,lenderName,loanName,principal,interest,startDate,term};
  }

  function continueLoanCreate(){const draft=readLoanDraft();if(!draft)return;state.draft=draft;showScheduleStep();}
  function showScheduleStep(){
    const root=overlay(),draft=state.draft;if(!root||!draft)return;
    const day=Math.min(Math.max(Number(draft.startDate.split('-')[2])||1,1),31);
    root.innerHTML=`<div class="loanFormHeader"><button type="button" onclick="showLoanCreateFromDraft()" aria-label="Буцах">←</button><span class="nayadWord"><span>N</span><span>A</span><span class="y">Y</span><span>A</span><span>D</span></span><i></i></div><div class="loanFormBody"><h1>Төлөлтийн хуваарь</h1><p>${esc(draft.lenderName)} · ${amount(draft.principal)}</p><div class="loanFormLabel">Төлөх арга</div><input id="loanRepaymentMethod" type="hidden" value="annuity"><div class="loanMethodCards"><button class="active" data-value="annuity" type="button" onclick="setLoanMethod('annuity')"><b>Тэнцүү төлөлт</b><small>Сар бүр ойролцоо ижил дүн</small></button><button data-value="equal_principal" type="button" onclick="setLoanMethod('equal_principal')"><b>Үндсэн төлбөр тэнцүү</b><small>Эхний сар их, дараа нь буурна</small></button></div><div class="field"><label>Сар бүр төлөх өдөр</label><input id="loanPaymentDay" type="number" inputmode="numeric" min="1" max="31" value="${day}" oninput="renderLoanSchedulePreview()"></div><div id="loanSchedulePreview"></div></div><div class="loanFormFooter"><button id="loanSaveBtn" class="primary full" type="button" onclick="saveLoan()">Зээл хадгалах</button></div>`;
    setTimeout(renderLoanSchedulePreview,0);
  }

  function showLoanCreateFromDraft(){
    const draft=state.draft,files=state.files.slice();showLoanCreate();state.files=files;
    if(!draft)return;
    setLenderType(draft.lenderType);document.getElementById('loanLenderName').value=draft.lenderName;document.getElementById('loanName').value=draft.loanName;document.getElementById('loanPrincipal').value=window.__nayadFormatMoneyInput?.(draft.principal)||draft.principal;document.getElementById('loanInterest').value=draft.interest;document.getElementById('loanStartDate').value=draft.startDate;document.getElementById('loanTerm').value=draft.term;renderFilePreviews();
  }

  function setLoanMethod(value){document.getElementById('loanRepaymentMethod').value=value;document.querySelectorAll('.loanMethodCards button').forEach(button=>button.classList.toggle('active',button.dataset.value===value));renderLoanSchedulePreview();}
  function dueDate(startDate,monthOffset,paymentDay){
    const [year,month]=startDate.split('-').map(Number),base=new Date(Date.UTC(year,month-1+monthOffset,1)),last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate(),day=Math.min(paymentDay,last);
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  function calculateSchedule(draft,method,paymentDay){
    const monthlyRate=draft.interest/1200,term=draft.term,principal=draft.principal;
    const annuity=monthlyRate===0?principal/term:principal*monthlyRate*Math.pow(1+monthlyRate,term)/(Math.pow(1+monthlyRate,term)-1);
    const equalPrincipal=principal/term;let remaining=principal;const rows=[];
    for(let index=1;index<=term;index++){
      const interest=round2(remaining*monthlyRate);let principalPart=method==='equal_principal'?round2(equalPrincipal):round2(annuity-interest);
      if(index===term||principalPart>remaining)principalPart=round2(remaining);
      const total=round2(principalPart+interest);remaining=round2(Math.max(remaining-principalPart,0));
      rows.push({installment_number:index,due_date:dueDate(draft.startDate,index,paymentDay),principal_amount:principalPart,interest_amount:interest,total_amount:total,paid_amount:0,status:'pending'});
    }
    return rows;
  }

  function scheduleInput(){const method=fieldValue('loanRepaymentMethod')||'annuity',day=Number(fieldValue('loanPaymentDay'));if(!Number.isInteger(day)||day<1||day>31)return null;return {method,day,rows:calculateSchedule(state.draft,method,day)};}
  function renderLoanSchedulePreview(){
    const target=document.getElementById('loanSchedulePreview'),input=scheduleInput();if(!target)return;if(!input){target.innerHTML='<div class="agreementWarning"><b>Төлөх өдрийг 1–31 хооронд оруулна уу.</b></div>';return;}
    const total=input.rows.reduce((sum,row)=>sum+row.total_amount,0),first=input.rows[0];
    target.innerHTML=`<div class="loanPreviewCard"><small>Эхний төлөлт</small><b>${amount(first.total_amount)}</b><span>${dateLabel(first.due_date)}</span></div><div class="loanPreviewCard"><small>Нийт төлөх</small><b>${amount(total)}</b><span>Хүү ${amount(total-state.draft.principal)}</span></div><div class="paymentSectionTitle"><span>ЭХНИЙ 3 САР</span><small>${methodLabel(input.method)}</small></div><div class="card">${input.rows.slice(0,3).map(row=>`<div class="invoice"><div><small>${row.installment_number}-р төлөлт · ${dateLabel(row.due_date)}</small><b>${amount(row.total_amount)}</b></div><div class="sub">Үндсэн ${amount(row.principal_amount)}<br>Хүү ${amount(row.interest_amount)}</div></div>`).join('')}</div>`;
  }

  function safeName(name){return String(name||'contract').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(-80)||'contract';}
  async function uploadContracts(loan,storeId,userId){
    const client=sb(),uploaded=[],metadata=[];
    try{
      for(let index=0;index<state.files.length;index++){
        let file=state.files[index];if(file.type.startsWith('image/')&&typeof window.compressInvoiceImage==='function')file=await window.compressInvoiceImage(file);
        if(file.size>MAX_FILE_BYTES)throw new Error(`${file.name}: 10MB-аас их байна.`);
        const mime=String(file.type||'').toLowerCase();if(!ALLOWED_TYPES.has(mime))throw new Error(`${file.name}: дэмжихгүй файл байна.`);
        const path=`${storeId}/${loan.id}/${String(index+1).padStart(3,'0')}-${uuid()}-${safeName(file.name)}`;
        const {error:uploadError}=await client.storage.from(BUCKET).upload(path,file,{contentType:mime,upsert:false,cacheControl:'3600'});if(uploadError)throw uploadError;uploaded.push(path);
        metadata.push({loan_id:loan.id,store_id:storeId,storage_path:path,file_name:file.name||`Гэрээ ${index+1}`,mime_type:mime,page_number:index+1,size_bytes:file.size,created_by:userId});
      }
      if(metadata.length){const {error}=await client.from('loan_documents').insert(metadata);if(error)throw error;}
      return uploaded;
    }catch(error){if(uploaded.length)await client.storage.from(BUCKET).remove(uploaded).catch(()=>{});throw error;}
  }

  async function saveLoan(){
    const input=scheduleInput(),draft=state.draft,storeId=activeStoreId(),client=sb(),button=document.getElementById('loanSaveBtn');
    if(!draft||!input)return notify('Төлөлтийн мэдээллээ шалгана уу.');if(!storeId||!client||!canManage())return notify('Дэлгүүрийн эрх олдсонгүй.');
    if(button){button.disabled=true;button.textContent='Хадгалж байна...';}window.__nayadCriticalOperation='loan-create';let loan=null,uploaded=[];
    try{
      const {data:{session},error:sessionError}=await client.auth.getSession();if(sessionError)throw sessionError;const userId=session?.user?.id;if(!userId)throw new Error('Нэвтрэх session олдсонгүй.');
      const payload={store_id:storeId,lender_type:draft.lenderType,lender_name:draft.lenderName,loan_name:draft.loanName,principal:draft.principal,annual_interest_rate:draft.interest,start_date:draft.startDate,term_months:draft.term,payment_day:input.day,repayment_method:input.method,status:'active',created_by:userId};
      const {data:created,error:createError}=await client.from('loans').insert(payload).select('id,store_id').single();if(createError)throw createError;loan=created;
      const rows=input.rows.map(row=>({...row,loan_id:loan.id,store_id:storeId}));const {error:installmentError}=await client.from('loan_installments').insert(rows);if(installmentError)throw installmentError;
      uploaded=await uploadContracts(loan,storeId,userId);closeLoanCreate();notify('Зээл болон төлөлтийн хуваарь хадгалагдлаа.');await syncLoans();if(typeof page!=='undefined')page='loans';window.render?.();
    }catch(error){
      console.error('NAYAD loan create:',error);if(uploaded.length)await client.storage.from(BUCKET).remove(uploaded).catch(()=>{});if(loan?.id)await client.from('loans').delete().eq('id',loan.id).catch(()=>{});notify(error?.message||'Зээл хадгалахад алдаа гарлаа.');if(button){button.disabled=false;button.textContent='Зээл хадгалах';}
    }finally{if(window.__nayadCriticalOperation==='loan-create')delete window.__nayadCriticalOperation;}
  }

  function showLoanDetails(loanId){
    const loan=state.loans.find(item=>String(item.id)===String(loanId));if(!loan)return notify('Зээл олдсонгүй.');const pending=pendingRows(loan),next=pending[0];
    window.sheet?.(`<div class="row"><div><div class="hello">${esc(lenderTypeLabel(loan.lender_type))}</div><h2 style="margin:4px 0">${esc(loan.lender_name)}</h2><span class="sub">${esc(loan.loan_name)}</span></div><button class="secondary" onclick="closeSheet()">✕</button></div><div class="loanDetailHero"><small>Үлдэгдэл</small><b>${amount(outstandingPrincipal(loan))}</b><span>${esc(methodLabel(loan.repayment_method))} · ${loan.term_months} сар · ${Number(loan.annual_interest_rate)}%</span></div>${loan.documents.length?`<button class="secondary full" onclick="showLoanDocuments('${esc(loan.id)}')">Гэрээ харах · ${loan.documents.length} файл</button>`:'<div class="card sub">Гэрээ хавсаргаагүй.</div>'}<div class="paymentSectionTitle"><span>ТӨЛӨЛТИЙН ХУВААРЬ</span><small>${pending.length} үлдсэн</small></div><div class="loanScheduleList">${loan.installments.map(row=>`<div class="loanScheduleRow ${row.status==='paid'?'paid':row.due_date<today()?'overdue':''}"><span><b>${row.installment_number}-р төлөлт</b><small>${dateLabel(row.due_date)} · Үндсэн ${amount(row.principal_amount)} · Хүү ${amount(row.interest_amount)}</small></span><span><b>${amount(row.total_amount)}</b>${row.status==='paid'?'<small class="greenText">Төлсөн</small>':`<button class="primary" onclick="markLoanInstallmentPaid('${esc(loan.id)}','${esc(row.id)}')">Төлөх</button>`}</span></div>`).join('')}</div>${next?`<button class="primary full" style="margin-top:12px" onclick="markLoanInstallmentPaid('${esc(loan.id)}','${esc(next.id)}')">${amount(next.total_amount)} төлсөн гэж тэмдэглэх</button>`:''}`);
  }

  async function showLoanDocuments(loanId){
    const loan=state.loans.find(item=>String(item.id)===String(loanId));if(!loan?.documents.length)return notify('Гэрээ хавсаргаагүй.');
    window.sheet?.('<h2>Зээлийн гэрээ</h2><div class="card center sub">Файлуудыг нээж байна...</div>');
    try{
      const signed=[];for(const doc of loan.documents){const {data,error}=await sb().storage.from(BUCKET).createSignedUrl(doc.storage_path,600);if(error)throw error;signed.push({...doc,url:data.signedUrl});}
      window.sheet?.(`<div class="row"><h2 style="margin:0">Зээлийн гэрээ</h2><button class="secondary" onclick="closeSheet()">✕</button></div><div class="loanDocumentList">${signed.map(doc=>doc.mime_type==='application/pdf'?`<a class="loanDocumentPdf" href="${esc(doc.url)}" target="_blank" rel="noopener"><b>PDF</b><span>${esc(doc.file_name)}</span><em>Нээх →</em></a>`:`<a class="loanDocumentImage" href="${esc(doc.url)}" target="_blank" rel="noopener"><img src="${esc(doc.url)}" alt="${doc.page_number}-р хуудас"><span>${doc.page_number}-р хуудас</span></a>`).join('')}</div><small class="sub">Хувийн гэрээний холбоос 10 минутын дараа хүчингүй болно.</small>`);
    }catch(error){console.warn('Loan documents:',error);notify(error?.message||'Гэрээ нээж чадсангүй.');}
  }

  async function markLoanInstallmentPaid(loanId,installmentId){
    const loan=state.loans.find(item=>String(item.id)===String(loanId)),row=loan?.installments.find(item=>String(item.id)===String(installmentId));if(!loan||!row||row.status==='paid')return;
    if(!confirm(`${dateLabel(row.due_date)}-ны ${amount(row.total_amount)} төлөлтийг төлсөн гэж тэмдэглэх үү?`))return;
    window.__nayadCriticalOperation='loan-payment';
    try{
      const {error}=await sb().from('loan_installments').update({status:'paid',paid_amount:row.total_amount,paid_at:new Date().toISOString()}).eq('id',row.id).eq('store_id',activeStoreId());if(error)throw error;
      const remaining=loan.installments.filter(item=>item.status!=='paid'&&String(item.id)!==String(row.id));if(!remaining.length){const {error:loanError}=await sb().from('loans').update({status:'closed',updated_at:new Date().toISOString()}).eq('id',loan.id).eq('store_id',activeStoreId());if(loanError)throw loanError;}
      window.closeSheet?.();notify('Зээлийн төлөлт тэмдэглэгдлээ.');await syncLoans();window.render?.();
    }catch(error){console.error('Loan payment:',error);notify(error?.message||'Төлөлт хадгалахад алдаа гарлаа.');}
    finally{if(window.__nayadCriticalOperation==='loan-payment')delete window.__nayadCriticalOperation;}
  }

  function paymentLoanSection(){
    if(!canManage())return '';const items=allPending().sort((a,b)=>String(a.row.due_date).localeCompare(String(b.row.due_date))).slice(0,6);if(!items.length)return '';
    return `<div class="paymentSectionTitle"><span>ЗЭЭЛИЙН ТӨЛӨЛТ</span><small>Падаанаас тусдаа</small></div><div class="loanPaymentRows">${items.map(item=>{const overdue=item.row.due_date<today();return `<article class="loanPaymentRow ${overdue?'overdue':''}" onclick="showLoanDetails('${esc(item.loan.id)}')"><span class="loanBadge">ЗЭЭЛ</span><span><b>${esc(item.loan.lender_name)}</b><small>${dateLabel(item.row.due_date)} · ${esc(dueText(item.row.due_date))}</small></span><span><b>${amount(item.row.total_amount)}</b><button class="primary" onclick="event.stopPropagation();markLoanInstallmentPaid('${esc(item.loan.id)}','${esc(item.row.id)}')">Төлөх</button></span></article>`;}).join('')}</div>`;
  }

  const style=document.createElement('style');style.id='nayad-loans-styles';style.textContent=`
    body.loanFormOpen{overflow:hidden}.loanHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.loanAddMini{width:42px;height:42px;padding:0;font-size:20px}.loanSummaryGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:20px 0}.loanSummary{min-width:0;min-height:104px;padding:13px 10px;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-sm)}.loanSummary small{display:block;min-height:28px;color:var(--muted);font-size:9px;font-weight:750}.loanSummary b{display:block;margin-top:9px;font-size:14px;line-height:1.15;letter-spacing:-.35px;overflow-wrap:anywhere}.loanSummary.overdue{background:var(--red-soft);border-color:#f3c6c6}.loanSummary.overdue b{color:var(--red)}.loanList{display:flex;flex-direction:column;gap:10px}.loanCard{padding:13px;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-sm);cursor:pointer}.loanCard.overdue{border-color:#efb9b9}.loanCardTop{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center}.loanAvatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#277bc0;color:#fff;font-weight:900}.loanAvatar.nbfi{background:#7451d8}.loanAvatar.person{background:#20a968}.loanCardName,.loanBalance{text-align:left;min-width:0}.loanCardName b,.loanCardName small,.loanBalance b,.loanBalance small{display:block}.loanCardName b{font-size:13px}.loanCardName small,.loanBalance small{margin-top:4px;color:var(--muted);font-size:9px}.loanBalance{text-align:right}.loanBalance b{margin-top:4px;font-size:12px}.loanDue{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:11px;border-top:1px solid var(--line)}.loanDue span small,.loanDue span b{display:block}.loanDue span small{color:var(--muted);font-size:9px}.loanDue span b{margin-top:4px;font-size:13px}.loanDue button{padding:8px 14px}.loanAddFull{margin-top:12px}.loanFormOverlay{position:fixed;inset:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;z-index:60;background:var(--bg);display:flex;flex-direction:column}.loanFormHeader{height:68px;flex:0 0 68px;padding:0 18px;display:grid;grid-template-columns:42px 1fr 42px;align-items:center;background:var(--surface);border-bottom:1px solid var(--line)}.loanFormHeader>button{padding:0;background:transparent;font-size:29px;text-align:left}.loanFormHeader .nayadWord{justify-self:center;font-size:21px;font-weight:900}.loanFormHeader i{display:block}.loanFormBody{flex:1;overflow:auto;padding:22px 18px 118px}.loanFormBody h1{margin:0;font-size:28px;letter-spacing:-.7px}.loanFormBody>p{margin:8px 0 24px;color:var(--muted);font-size:13px}.loanFormLabel{margin:17px 0 8px;font-size:12px;font-weight:850}.loanSegment{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff}.loanSegment button{border-radius:0;background:#fff;border-right:1px solid var(--line)}.loanSegment button:last-child{border-right:0}.loanSegment button.active{background:var(--yellow)}.loanFormGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.loanFormGrid .field{min-width:0}.loanAttachmentChoices{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.loanAttachmentChoices button{min-width:0;padding:12px 5px;background:#fff;border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;gap:7px}.loanAttachmentChoices span{height:23px;font-size:18px;font-weight:900}.loanAttachmentChoices b{font-size:9px;line-height:1.25}.loanFilePreview{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.loanFileTile,.loanFileAdd{position:relative;min-width:0;padding:5px;background:#fff;border:1px solid var(--line);border-radius:12px;text-align:center}.loanFileTile img,.loanPdfTile{width:100%;height:67px;border-radius:8px;object-fit:cover;background:#f1f1ed}.loanPdfTile{display:grid;place-items:center;color:#755800;font-weight:900}.loanFileTile>small{display:block;margin-top:5px;font-size:8px}.loanFileRemove{position:absolute;right:2px;top:2px;width:22px;height:22px;padding:0;border-radius:50%;background:#fff;border:1px solid var(--line);font-size:16px}.loanFileOrder{display:flex;justify-content:center;gap:3px;margin-top:4px}.loanFileOrder button{padding:2px 7px;border-radius:7px;background:var(--surface-2);font-size:10px}.loanFileAdd{border:1px dashed #d9a800;color:#b28700;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px}.loanFileAdd b{font-size:23px}.loanFileAdd span{font-size:9px}.loanFileHelp{display:block;margin-top:8px;color:var(--muted)}.loanFormFooter{position:absolute;left:0;right:0;bottom:0;padding:12px 18px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--bg) 20%)}.loanFormFooter button{min-height:54px;font-size:16px}.loanMethodCards{display:grid;grid-template-columns:1fr 1fr;gap:9px}.loanMethodCards button{padding:14px 11px;background:#fff;border:1px solid var(--line);text-align:left}.loanMethodCards button.active{background:var(--yellow-soft);border-color:#e5b400}.loanMethodCards b,.loanMethodCards small{display:block}.loanMethodCards small{margin-top:5px;color:var(--muted);font-size:9px;line-height:1.35}.loanPreviewCard{display:inline-flex;width:calc(50% - 5px);min-height:94px;margin-right:6px;padding:13px;vertical-align:top;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:16px}.loanPreviewCard:nth-child(2){margin-right:0}.loanPreviewCard small,.loanPreviewCard span{color:var(--muted);font-size:9px}.loanPreviewCard b{margin:8px 0 5px;font-size:16px}.loanDetailHero{margin:15px 0;padding:18px;background:var(--yellow-soft);border:1px solid #efd06b;border-radius:17px}.loanDetailHero small,.loanDetailHero b,.loanDetailHero span{display:block}.loanDetailHero b{margin:7px 0;font-size:27px}.loanDetailHero span{color:var(--muted);font-size:10px}.loanScheduleList{max-height:45vh;overflow:auto;border:1px solid var(--line);border-radius:15px}.loanScheduleRow{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:12px;border-bottom:1px solid var(--line)}.loanScheduleRow:last-child{border-bottom:0}.loanScheduleRow>span:first-child{min-width:0}.loanScheduleRow b,.loanScheduleRow small{display:block}.loanScheduleRow small{margin-top:4px;color:var(--muted);font-size:8px;line-height:1.35}.loanScheduleRow>span:last-child{text-align:right}.loanScheduleRow button{margin-top:5px;padding:5px 9px;font-size:9px}.loanScheduleRow.paid{opacity:.65}.loanScheduleRow.overdue{background:#fff6f6}.loanDocumentList{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:15px 0}.loanDocumentImage,.loanDocumentPdf{min-width:0;padding:7px;border:1px solid var(--line);border-radius:13px;background:#fff;color:var(--text);text-decoration:none}.loanDocumentImage img{width:100%;height:150px;object-fit:cover;border-radius:8px}.loanDocumentImage span{display:block;margin-top:6px;font-size:10px;font-weight:800}.loanDocumentPdf{grid-column:1/-1;display:flex;align-items:center;gap:10px}.loanDocumentPdf b{width:45px;height:45px;border-radius:10px;background:var(--yellow);display:grid;place-items:center}.loanDocumentPdf span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.loanDocumentPdf em{font-size:10px;font-style:normal}.loanPaymentRows{display:flex;flex-direction:column;gap:9px}.loanPaymentRow{display:grid;grid-template-columns:44px 1fr auto;gap:9px;align-items:center;padding:12px 10px;background:#fff;border:1px solid var(--line);border-radius:17px;cursor:pointer}.loanPaymentRow.overdue{border-color:#efb9b9}.loanBadge{padding:5px 4px;border-radius:7px;background:#f0c02e;font-size:8px;font-weight:900;text-align:center}.loanPaymentRow span b,.loanPaymentRow span small{display:block}.loanPaymentRow span small{margin-top:4px;color:var(--muted);font-size:8px}.loanPaymentRow>span:last-child{text-align:right}.loanPaymentRow button{margin-top:5px;padding:6px 10px;font-size:9px}
    html.nightMode .loanSummary,html.nightMode .loanCard,html.nightMode .loanSegment,html.nightMode .loanSegment button,html.nightMode .loanAttachmentChoices button,html.nightMode .loanFileTile,html.nightMode .loanFileAdd,html.nightMode .loanMethodCards button,html.nightMode .loanPreviewCard,html.nightMode .loanDocumentImage,html.nightMode .loanDocumentPdf,html.nightMode .loanPaymentRow{background:#1D1D1B;border-color:#3C3C38;color:var(--text)}html.nightMode .loanSummary.overdue,html.nightMode .loanCard.overdue,html.nightMode .loanPaymentRow.overdue{background:#3A2022;border-color:#743F43}html.nightMode .loanSegment button.active{background:#705800;color:#fff}html.nightMode .loanMethodCards button.active{background:#30280F;border-color:#715D18}html.nightMode .loanFormHeader{background:#191917}html.nightMode .loanFileRemove{background:#292927;color:#fff;border-color:#4A4A45}html.nightMode .loanScheduleList{border-color:#3C3C38}html.nightMode .loanScheduleRow{border-color:#3C3C38}html.nightMode .loanScheduleRow.overdue{background:#3A2022}html.nightMode .loanDetailHero{background:#30280F;border-color:#715D18}
    @media(max-width:370px){.loanSummary b{font-size:12px}.loanCardTop{grid-template-columns:38px 1fr auto}.loanAvatar{width:38px;height:38px}.loanFormBody{padding-left:14px;padding-right:14px}.loanAttachmentChoices b{font-size:8px}.loanFilePreview{grid-template-columns:repeat(3,1fr)}}
  `;document.head.appendChild(style);

  const basePayments=window.payments;
  if(typeof basePayments==='function')window.payments=function(){return basePayments()+paymentLoanSection();};

  window.loans=loanPage;
  window.__nayadSyncLoans=syncLoans;
  window.__nayadCalculateLoanSchedule=calculateSchedule;
  window.showLoanCreate=showLoanCreate;
  window.closeLoanCreate=closeLoanCreate;
  window.setLoanLenderType=setLenderType;
  window.selectLoanFiles=selectLoanFiles;
  window.removeLoanFile=removeLoanFile;
  window.moveLoanFile=moveLoanFile;
  window.continueLoanCreate=continueLoanCreate;
  window.showLoanCreateFromDraft=showLoanCreateFromDraft;
  window.setLoanMethod=setLoanMethod;
  window.renderLoanSchedulePreview=renderLoanSchedulePreview;
  window.saveLoan=saveLoan;
  window.showLoanDetails=showLoanDetails;
  window.showLoanDocuments=showLoanDocuments;
  window.markLoanInstallmentPaid=markLoanInstallmentPaid;

  window.addEventListener('load',()=>setTimeout(syncLoans,1700));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(syncLoans,500);});
})();
