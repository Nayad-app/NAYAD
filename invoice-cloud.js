/* NAYAD cloud invoice layer — keeps the existing UI, but persists invoices and images in Supabase. */
(function(){
  const KEY = "NAYAD_DATA_V2";
  const USER_DATA_PREFIX = "NAYAD_DATA_V3:";
  let cloudCompanyId = null;
  let cloudCompanyTarget = null;
  let pending = [];
  let invoiceSaving = false;
  let reorderBound = false;
  let dragState = null;

  if(typeof window.__nayadQueueCloudSync!=='function'){
    window.__nayadCloudSyncQueue=Promise.resolve();
    window.__nayadQueueCloudSync=function(task){
      const run=(window.__nayadCloudSyncQueue||Promise.resolve()).catch(()=>{}).then(task);
      window.__nayadCloudSyncQueue=run.catch(()=>{});
      return run;
    };
  }
  function queueCloudSync(task){return window.__nayadQueueCloudSync(task);}

  function client(){ return window.nayadSupabase || window.sb || null; }
  function moneyInputValue(value){
    if(typeof window.__nayadParseMoneyInput==='function')return window.__nayadParseMoneyInput(value);
    const parsed=Number(String(value??'').replace(/,/g,''));return Number.isFinite(parsed)?parsed:0;
  }
  function moneyInputText(value){
    if(typeof window.__nayadFormatMoneyInput==='function')return window.__nayadFormatMoneyInput(value);
    return String(value??'');
  }
  function operationClient(session,fallback){
    const library=window.supabase;
    const url=(typeof SUPABASE_URL!=='undefined'&&SUPABASE_URL)||fallback?.supabaseUrl||'';
    const key=(typeof SUPABASE_PUBLISHABLE_KEY!=='undefined'&&SUPABASE_PUBLISHABLE_KEY)||fallback?.supabaseKey||'';
    if(!session?.access_token||!url||!key||typeof library?.createClient!=='function')return fallback;
    /* Keep every write and any compensation request on the session that
       started the save. The shared client may switch users from another tab. */
    return library.createClient(url,key,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:`Bearer ${session.access_token}`}}
    });
  }
  function dataKey(){ return typeof window.__nayadStoreDataKey==='function'?window.__nayadStoreDataKey():(window.__nayadUser?.id ? USER_DATA_PREFIX+window.__nayadUser.id : KEY); }
  function readLocal(){
    if(window.__nayadState)return window.__nayadState.read();
    try{return JSON.parse(localStorage.getItem(dataKey()))||{companies:[],payments:[]}}catch(_){return {companies:[],payments:[]}}
  }
  function writeLocal(next){
    if(window.__nayadState)return window.__nayadState.persist(next);
    localStorage.setItem(dataKey(),JSON.stringify(next));return next;
  }
  function applyLocalData(next,renderNow=true){
    if(window.__nayadState)return window.__nayadState.commit(next,{render:renderNow});
    writeLocal(next);
    try{
      const selectedId=typeof selected!=='undefined'&&selected?selected.id:null;
      if(typeof data!=='undefined')data=next;
      if(selectedId&&typeof selected!=='undefined')selected=(next.companies||[]).find(c=>String(c.id)===String(selectedId))||null;
      if(renderNow&&typeof render==='function')render();
    }catch(e){console.warn('Apply cloud data:',e);}
  }
  function applyPaymentToInvoices(company,amount){
    let left=Number(amount)||0;
    const invoices=[...(company?.invoices||[])].filter(i=>(i.status||'confirmed')==='confirmed').sort((a,b)=>String(a.effective_due_date||a.due_date||a.date||'').localeCompare(String(b.effective_due_date||b.due_date||b.date||'')));
    for(const invoice of invoices){
      if(left<=0)break;
      const balance=Math.max((Number(invoice.amount)||0)-(Number(invoice.paid)||0),0);
      if(balance<=0)continue;
      const take=Math.min(balance,left);invoice.paid=(Number(invoice.paid)||0)+take;left-=take;
    }
  }
  function setCompanyRemainingBalance(company,remaining){
    if(!company||!Number.isFinite(Number(remaining)))return;
    const invoices=[...(company.invoices||[])].filter(i=>(i.status||'confirmed')==='confirmed').sort((a,b)=>String(a.effective_due_date||a.due_date||a.date||'').localeCompare(String(b.effective_due_date||b.due_date||b.date||'')));
    const total=invoices.reduce((sum,i)=>sum+(Number(i.amount)||0),0);
    let paidTotal=Math.max(total-Number(remaining),0);
    for(const invoice of invoices){
      const amount=Math.max(Number(invoice.amount)||0,0);
      const paid=Math.min(amount,paidTotal);invoice.paid=paid;paidTotal-=paid;
    }
    company.debt=Number(remaining);
  }
  function currentCompany(reference){
    const ref=reference&&typeof reference==='object'
      ?{localId:reference.localId??reference.id,supplierId:reference.supplierId??reference.supabase_supplier_id,name:reference.name}
      :{localId:reference,supplierId:null,name:''};
    const candidates=[];
    const add=company=>{
      if(!company)return;
      if(!candidates.some(item=>item===company))candidates.push(company);
    };
    if(typeof data!=='undefined'&&Array.isArray(data?.companies))data.companies.forEach(add);
    (readLocal().companies||[]).forEach(add);
    if(typeof selected!=='undefined')add(selected);

    if(ref.supplierId){
      const bySupplier=candidates.find(company=>String(company.supabase_supplier_id||'')===String(ref.supplierId));
      if(bySupplier)return bySupplier;
      /* Once a cloud UUID has been captured it is the only safe identity.
         A reused local ID or matching name may belong to another supplier. */
      return null;
    }
    if(ref.localId!=null){
      const byLocalId=candidates.find(company=>
        String(company.id)===String(ref.localId)
        &&(!ref.supplierId||!company.supabase_supplier_id||String(company.supabase_supplier_id)===String(ref.supplierId))
      );
      if(byLocalId)return byLocalId;
    }
    const wantedName=String(ref.name||'').trim().toLowerCase();
    return wantedName?candidates.find(company=>
      String(company.name||'').trim().toLowerCase()===wantedName
      &&(!ref.supplierId||!company.supabase_supplier_id||String(company.supabase_supplier_id)===String(ref.supplierId))
    )||null:null;
  }
  function val(id){ return document.getElementById(id)?.value || ""; }
  function esc(s){ return String(s??"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function notify(msg){ if(typeof window.toast==='function') window.toast(msg); else { const el=document.getElementById('toast'); if(el){el.textContent=msg;el.classList.remove('hide');setTimeout(()=>el.classList.add('hide'),2200)} } }
  function close(){ if(typeof window.closeSheet==='function') window.closeSheet(); else document.getElementById('modal')?.classList.add('hide'); }
  function openSheet(html){ if(typeof window.sheet==='function') window.sheet(html); else { const s=document.getElementById('sheet'); if(s){s.innerHTML=html;document.getElementById('modal')?.classList.remove('hide')} } }

  async function store(){
    const sb=client(); if(!sb) throw new Error('Supabase холболт олдсонгүй.');
    if(typeof window.__nayadGetActiveStore==='function'){
      const activeStore=await window.__nayadGetActiveStore();
      if(activeStore?.id)return activeStore;
    }
    const {data,error}=await sb.rpc('get_my_store');
    if(error) throw error;
    const row=Array.isArray(data)?data[0]:data;
    if(!row?.id) throw new Error('Таны дэлгүүр олдсонгүй.');
    return row;
  }

  async function ensureSupplier(storeRow, company, options={}){
    const sb=options.client||client();
    if(company.supabase_supplier_id){
      const {data,error}=await sb.from('suppliers').select('id,name').eq('id',company.supabase_supplier_id).eq('store_id',storeRow.id).maybeSingle();
      if(!error && data) return data;
      if(options.requireExistingId){
        if(error)throw new Error('Нийлүүлэгчийг шалгахад алдаа: '+error.message);
        throw new Error('Нийлүүлэгч устсан эсвэл энэ дэлгүүрт байхгүй байна. Жагсаалтаа шинэчлээд дахин оролдоно уу.');
      }
    }
    const {data:found,error:findError}=await sb.from('suppliers').select('id,name').eq('store_id',storeRow.id).eq('name',company.name).limit(1).maybeSingle();
    if(!findError && found){ company.supabase_supplier_id=found.id; return found; }
    const {data:created,error:createError}=await sb.from('suppliers').insert({
      store_id:storeRow.id,
      name:company.name,
      reg_no:company.reg||null,
      address:company.address||null,
      director:company.director||null,
      director_phone:company.directorPhone||null,
      sales_phone:company.salesPhone||null,
      is_active:company.status!=='inactive'
    }).select('id,name').single();
    if(createError) throw new Error('Нийлүүлэгчийг cloud-д хадгалахад алдаа: '+createError.message);
    company.supabase_supplier_id=created.id;
    return created;
  }

  async function recordCloudPayment(sb,supplierId,payment){
    const paymentId=payment.id||crypto.randomUUID();
    const {data,error}=await sb.rpc('record_supplier_payment',{
      p_payment_id:paymentId,
      p_supplier_id:supplierId,
      p_amount:Number(payment.amount),
      p_payment_date:payment.date||new Date().toISOString().slice(0,10),
      p_method:payment.method||'Бусад',
      p_note:payment.note||null
    });
    if(error)throw error;
    return {id:paymentId,result:Array.isArray(data)?data[0]:data};
  }

  async function refreshPaidSupplier(sb,supplierId,remaining){
    /* Payment settlement must not depend on the global store-sync coordinator.
       Read the affected supplier directly after the transactional RPC, then
       replace the visible invoice balances with that authoritative snapshot. */
    const {data:rows,error}=await sb.from('invoices')
      .select('id,supplier_id,invoice_no,invoice_date,due_date,amount,paid,image_url,status,discount_percent,discount_deadline,note,confirmed_at,created_at')
      .eq('supplier_id',supplierId)
      .order('invoice_date',{ascending:true});
    if(error)throw error;
    const {data:allocations,error:allocationsError}=rows?.length
      ?await sb.from('payment_allocations').select('invoice_id,discount_amount,payments!inner(status)').in('invoice_id',rows.map(row=>row.id))
      :{data:[],error:null};
    if(allocationsError)throw allocationsError;
    const fresh=readLocal();
    fresh.companies=fresh.companies||[];
    const company=fresh.companies.find(c=>String(c.supabase_supplier_id)===String(supplierId));
    if(!company)throw new Error('Төлбөрийн нийлүүлэгч дэлгэцийн төлөвт олдсонгүй.');
    const existing=new Map((company.invoices||[]).map(invoice=>[String(invoice.id),invoice]));
    company.invoices=(rows||[]).map(row=>{
      const previous=existing.get(String(row.id))||{};
      const discountTaken=(allocations||[]).filter(item=>String(item.invoice_id)===String(row.id)&&item.payments?.status==='posted').reduce((sum,item)=>sum+(Number(item.discount_amount)||0),0);
      return {
        ...previous,
        id:row.id,
        date:row.invoice_date,
        no:row.invoice_no||'',
        amount:Number(row.amount)||0,
        paid:Number(row.paid)||0,
        due_date:row.due_date||null,
        status:row.status||'confirmed',
        discount_percent:Number(row.discount_percent)||0,
        discount_deadline:row.discount_deadline||null,
        note:row.note||'',
        discount_taken:discountTaken,
        confirmed_at:row.confirmed_at||null,
        created_at:row.created_at||null,
        image_url:row.image_url||previous.image_url||'',
        supabase_synced:true
      };
    });
    /* If a replica/CDN returns the pre-payment row for a moment, the RPC's
       transaction result still wins so the UI can never jump backwards. */
    if(Number.isFinite(Number(remaining)))setCompanyRemainingBalance(company,Number(remaining));
    applyLocalData(fresh,true);
    return true;
  }

  function refreshPaymentView(){
    /* A payment is a financial write: once the RPC has committed, prefer one
       clean render from persisted state over leaving a stale dashboard in the
       current tab. The small delay lets the success toast and local commit
       paint first; the guard also avoids a service-worker reload mid-write. */
    if(typeof window.__nayadRefreshPaymentView==='function'){
      window.__nayadRefreshPaymentView();
      return;
    }
    setTimeout(()=>{
      if(window.__nayadCriticalOperation==='payment'){
        refreshPaymentView();
        return;
      }
      /* A query nonce prevents a browser or an older service worker from
         restoring the previous document from its navigation cache. */
      const target=new URL(window.location.href);
      target.searchParams.set('payment_refresh',String(Date.now()));
      window.location.replace(target.href);
    },300);
  }

  async function pushPendingPayments(storeRow,local){
    const sb=client(); if(!sb)return false;
    let changed=false;
    for(const payment of (local.payments||[]).filter(p=>!p.supabase_synced)){
      const company=(local.companies||[]).find(c=>String(c.id)===String(payment.companyId)||String(c.name||'').trim().toLowerCase()===String(payment.company||'').trim().toLowerCase());
      if(!company)continue;
      try{
        if(!payment.id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(payment.id)))payment.id=crypto.randomUUID();
        writeLocal(local);
        const supplier=await ensureSupplier(storeRow,company);
        await recordCloudPayment(sb,supplier.id,payment);
        payment.companyId=company.id;payment.company=company.name;payment.supabase_supplier_id=supplier.id;payment.supabase_synced=true;changed=true;
        writeLocal(local);
      }catch(e){console.warn('pending payment sync:',payment,e);}
    }
    return changed;
  }

  window.savePayment=async function(){
    const company=currentCompany(val('pCompany'));
    const amount=moneyInputValue(val('pAmount'));
    const date=val('pDate')||new Date().toISOString().slice(0,10);
    const method=val('pMethod')||'Бусад';
    if(!company){notify('Нийлүүлэгч олдсонгүй.');return;}
    if(!amount||amount<=0){notify('Төлөх дүн оруулна уу.');return;}
    if(typeof sync==='function')sync();
    if(amount>Number(company.debt||0)){notify('Үлдэгдлээс их байна.');return;}
    const btn=document.querySelector('#sheet .actions .primary');if(btn){btn.disabled=true;btn.textContent='Хадгалж байна...';}
    // A newly installed service worker must not reload the page between the
    // successful payment RPC and the local/cloud balance refresh.
    window.__nayadCriticalOperation='payment';
    let paymentCommitted=false;
    try{
      await queueCloudSync(async()=>{
        const sb=client();if(!sb)throw new Error('Supabase холболт олдсонгүй.');
        const session=(await sb.auth.getSession()).data?.session;if(!session)throw new Error('Эхлээд NAYAD-д нэвтэрнэ үү.');
        const storeRow=await store(),supplier=await ensureSupplier(storeRow,company);
        const payment={id:crypto.randomUUID(),companyId:company.id,company:company.name,supabase_supplier_id:supplier.id,amount,date,method,supabase_synced:true};
        const cloudResult=await recordCloudPayment(sb,supplier.id,payment);
        /* The database transaction is now committed. Any following local
           render or verification read may fail, but must never suppress the
           authoritative cache-busting refresh. */
        paymentCommitted=true;
        const remaining=Number(cloudResult?.result?.remaining_balance);
        const local=readLocal();local.payments=local.payments||[];
        const localCompany=(local.companies||[]).find(c=>String(c.supabase_supplier_id)===String(supplier.id)||String(c.id)===String(company.id)||String(c.name||'').trim().toLowerCase()===String(company.name||'').trim().toLowerCase());
        if(!localCompany)throw new Error('Төлбөрийн нийлүүлэгч дотоод төлөвт олдсонгүй.');
        localCompany.supabase_supplier_id=supplier.id;
        if(Number.isFinite(remaining))setCompanyRemainingBalance(localCompany,remaining);else applyPaymentToInvoices(localCompany,amount);
        if(!local.payments.some(p=>String(p.id)===String(payment.id)))local.payments.push(payment);
        close();
        applyLocalData(local,true);
        notify(Number.isFinite(remaining)?`Төлбөр бүртгэгдлээ. Үлдэгдэл: ${new Intl.NumberFormat('mn-MN').format(remaining)} ₮`:'Төлбөр cloud-д амжилттай бүртгэгдлээ.');
        try{
          await refreshPaidSupplier(sb,supplier.id,remaining);
        }catch(refreshError){
          /* The payment RPC already committed. Keep the optimistic RPC
             balance and let the unconditional page refresh retry the read. */
          console.warn('post-payment supplier refresh:',refreshError);
        }
        /* The direct supplier refresh above settles this screen immediately.
           Queue the broader cross-device snapshot only after this payment task
           releases the shared write lock. */
        setTimeout(()=>{
          if(typeof window.__nayadStartCloudSync==='function'){
            window.__nayadStartCloudSync({reason:'payment-settled',force:true}).catch(()=>{});
          }
        },0);
      });
    }catch(e){
      console.error('cloud payment:',e);
      const msg=String(e?.message||'');
      notify(msg.includes('exceeds outstanding')?'Үлдэгдлээс их байна.':'Төлбөр хадгалахад алдаа: '+msg);
      if(btn){btn.disabled=false;btn.textContent='Төлөх';}
    }finally{
      if(window.__nayadCriticalOperation==='payment')delete window.__nayadCriticalOperation;
      if(paymentCommitted)refreshPaymentView();
    }
  };

  function clearPending(){
    pending.forEach(x=>{try{if(x.preview)URL.revokeObjectURL(x.preview)}catch(_){} });
    pending=[];
    cleanupDrag();
  }

  function cleanupDrag(){
    if(dragState?.item) dragState.item.classList.remove('dragging');
    document.body.style.overflow='';
    document.documentElement.style.overflow='';
    dragState=null;
  }

  function reorderByPointer(e){
    if(!dragState || e.pointerId!==dragState.pointerId)return;
    if(!dragState.active)return;
    e.preventDefault();
    const box=dragState.box;
    const point=document.elementFromPoint(e.clientX,e.clientY);
    const target=point?.closest?.('.imageItem');
    if(!target || !box.contains(target) || target===dragState.item)return;
    const items=[...box.querySelectorAll('.imageItem')];
    const from=items.indexOf(dragState.item);
    const to=items.indexOf(target);
    if(from<0 || to<0 || from===to)return;
    const rect=target.getBoundingClientRect();
    const after=e.clientY>rect.top+rect.height/2;
    let insertAt=to+(after?1:0);
    if(from<insertAt)insertAt--;
    insertAt=Math.max(0,Math.min(items.length-1,insertAt));
    if(insertAt===from)return;

    const moved=pending.splice(from,1)[0];
    pending.splice(insertAt,0,moved);

    if(insertAt>from){
      const next=target.nextSibling;
      box.insertBefore(dragState.item,next);
    }else{
      box.insertBefore(dragState.item,target);
    }
    [...box.querySelectorAll('.imageItem')].forEach((el,i)=>el.dataset.index=String(i));
  }

  function bindReorder(){
    const box=document.getElementById('cloudImageList'); if(!box || reorderBound)return;
    reorderBound=true;
    box.style.webkitUserSelect='none';

    box.addEventListener('pointerdown',function(e){
      if(e.pointerType==='mouse' && e.button!==0)return;
      const handle=e.target.closest('.drag');
      if(!handle)return;
      const item=handle.closest('.imageItem');
      if(!item || !box.contains(item))return;
      const index=Number(item.dataset.index);
      if(!Number.isInteger(index))return;
      dragState={box,item,pointerId:e.pointerId,active:true};
      item.classList.add('dragging');
      document.body.style.overflow='hidden';
      document.documentElement.style.overflow='hidden';
      try{handle.setPointerCapture(e.pointerId)}catch(_){ }
      if(navigator.vibrate)try{navigator.vibrate(15)}catch(_){ }
      e.preventDefault();
    },{passive:false});

    box.addEventListener('pointermove',reorderByPointer,{passive:false});

    box.addEventListener('pointerup',function(e){
      if(!dragState || e.pointerId!==dragState.pointerId)return;
      e.preventDefault();
      renderPending();
      cleanupDrag();
    },{passive:false});

    box.addEventListener('pointercancel',function(e){
      if(!dragState || e.pointerId!==dragState.pointerId)return;
      cleanupDrag();
      renderPending();
    });
  }

  function renderPending(){
    const box=document.getElementById('cloudImageList'); if(!box)return;
    box.innerHTML=pending.map((x,i)=>`<div class="imageItem" data-index="${i}"><div class="drag" style="touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none">☷</div><img src="${x.preview}" alt="page ${i+1}"><div class="meta"><b>${i+1}-р хуудас</b><span>${esc(x.name)}</span><span class="pageBadge">Хуудас ${i+1}</span></div><button type="button" onclick="window.__removeCloudInvoiceImage(${i})">✕</button></div>`).join('');
    bindReorder();
  }
  window.__removeCloudInvoiceImage=function(i){ if(invoiceSaving){notify('Падаан хадгалагдаж байна.');return;} const x=pending[i]; if(x?.preview)URL.revokeObjectURL(x.preview); pending.splice(i,1); renderPending(); };
  function addFiles(files){
    for(const file of files||[]){
      if(!file.type.startsWith('image/')){notify('Зөвхөн зураг сонгоно уу.');continue;}
      pending.push({file,preview:URL.createObjectURL(file),name:file.name||('page-'+(pending.length+1))});
    }
    renderPending();
  }

  window.invoice=function(id,draftId){
    if(invoiceSaving){notify('Өмнөх падаан хадгалагдаж байна.');return;}
    cloudCompanyId=id;
    const company=currentCompany(id);
    if(!company){notify('Нийлүүлэгч олдсонгүй.');return;}
    const draft=(company.invoices||[]).find(item=>String(item.id)===String(draftId||'')&&item.status==='draft')||null;
    cloudCompanyTarget={
      localId:company.id,
      supplierId:company.supabase_supplier_id||null,
      name:company.name||'',
      storeId:window.__nayadActiveStoreId||window.__nayadActiveStore?.id||null,
      userId:window.__nayadUser?.id||null,
      invoiceId:draft?.id||null,
      draft:draft?{...draft}:null
    };
    clearPending();
    reorderBound=false;
    const today=new Date().toISOString().slice(0,10);
    openSheet(`<h2>${draft?'Падаан засах':'Падаан нэмэх'}</h2><div class="card"><b>${esc(company.name)}</b></div>
      <div class="field"><label>Падааны огноо</label><input id="cloudIDate" type="date" value="${esc(draft?.date||today)}"></div>
      <div class="field"><label>Төлөх хугацаа</label><input id="cloudIDueDate" type="date" value="${esc(draft?.due_date||'')}"></div>
      <div class="field"><label>Падааны дугаар</label><input id="cloudINo" value="${esc(draft?.no||'')}" placeholder="INV-0001"></div>
      <div class="field"><label>Нийт дүн</label><input id="cloudIAmount" data-money-input type="text" inputmode="decimal" autocomplete="off" value="${moneyInputText(Number(draft?.amount)||'')}" placeholder="0"></div>
      <div class="field"><label>Хугацаандаа төлөх хөнгөлөлт (%) — заавал биш</label><input id="cloudIDiscount" type="number" inputmode="decimal" min="0" max="99.99" step="0.01" value="${Number(draft?.discount_percent)||''}" placeholder="Жишээ: 4"></div>
      <div class="field"><label>Хөнгөлөлтийн эцсийн өдөр — заавал биш</label><input id="cloudIDiscountDeadline" type="date" value="${esc(draft?.discount_deadline||'')}"></div>
      <div class="field"><label>Нэмэлт тэмдэглэл — заавал биш</label><textarea id="cloudINote" maxlength="500" placeholder="Шаардлагатай зүйлээ тэмдэглэнэ үү">${esc(draft?.note||'')}</textarea></div>
      <div class="field"><label>Падааны зураг — заавал биш, олон хуудас нэмэх боломжтой</label>
        <div class="imageTools"><button type="button" class="secondary" onclick="document.getElementById('cloudGalleryInput').click()">🖼️ Зураг сонгох</button><button type="button" class="secondary" onclick="document.getElementById('cloudCameraInput').click()">📷 Камераар авах</button></div>
        <input id="cloudGalleryInput" type="file" accept="image/*" multiple class="hide"><input id="cloudCameraInput" type="file" accept="image/*" capture="environment" class="hide">
        <div class="sub" style="margin-top:7px">Зүүн талын ☷ тэмдэг дээр дараад шууд дээш/доош чирж дарааллыг солино.</div><div id="cloudImageList" class="imageList"></div>
      </div>
      <div class="actions"><button class="secondary" onclick="window.__cancelCloudInvoice()">Болих</button><button id="cloudConfirmInvoiceBtn" class="primary" onclick="window.__saveCloudInvoice()">ПАДААН БҮРТГЭХ</button></div>`);
    document.getElementById('cloudGalleryInput').onchange=function(){addFiles([...this.files]);this.value=''};
    document.getElementById('cloudCameraInput').onchange=function(){addFiles([...this.files]);this.value=''};
    renderPending();
  };
  window.__cancelCloudInvoice=function(){if(invoiceSaving){notify('Падаан хадгалагдаж байна.');return;}cloudCompanyTarget=null;clearPending();close();};

  window.__saveCloudInvoice=async function(){
    if(invoiceSaving){notify('Падаан хадгалагдаж байна.');return;}
    const amount=moneyInputValue(val('cloudIAmount'));
    const date=val('cloudIDate')||new Date().toISOString().slice(0,10);
    const dueDate=val('cloudIDueDate')||null;
    const no=val('cloudINo')||('INV-'+Date.now().toString().slice(-6));
    const discountPercent=Number(val('cloudIDiscount'))||0;
    const discountDeadline=val('cloudIDiscountDeadline')||null;
    const note=val('cloudINote').slice(0,500)||null;
    if(!amount||amount<0){notify('Нийт дүн оруулна уу.');return;}
    if(!dueDate){notify('Төлөх хугацаа оруулна уу.');return;}
    if(dueDate<date){notify('Төлөх хугацаа падааны өдрөөс өмнө байж болохгүй.');return;}
    if(discountPercent>0&&!discountDeadline){notify('Хөнгөлөлтийн эцсийн өдрийг оруулна уу.');return;}
    if(window.__nayadCriticalOperation){notify('Өмнөх хадгалалт дууссаны дараа дахин оролдоно уу.');return;}
    const target=cloudCompanyTarget?{...cloudCompanyTarget}:{localId:cloudCompanyId,supplierId:null,name:'',storeId:window.__nayadActiveStoreId||null,userId:window.__nayadUser?.id||null};
    const pendingFiles=pending.map(item=>({file:item.file,name:item.name||''}));
    let operationUserId=target.userId||window.__nayadUser?.id||null;
    const operationToken='invoice:'+crypto.randomUUID();
    const btn=document.getElementById('cloudConfirmInvoiceBtn'); if(btn){btn.disabled=true;btn.textContent='Хадгалж байна...';}
    let invoiceId=target.invoiceId||null, supplierId=null, storeId=null, uploaded=[], remoteComplete=false;
    const createdDraft=!target.invoiceId;
    invoiceSaving=true;
    window.__nayadCriticalOperation=operationToken;
    try{
      await queueCloudSync(async()=>{
        const sb=client(); if(!sb)throw new Error('Supabase холболт олдсонгүй.');
        let writeClient=sb;
        try{
          const session=(await sb.auth.getSession()).data?.session;
          if(!session)throw new Error('Эхлээд NAYAD-д нэвтэрнэ үү.');
          if(operationUserId&&String(session.user?.id||'')!==String(operationUserId))throw new Error('Нэвтэрсэн хэрэглэгч солигдсон байна. Падаанаа дахин нээнэ үү.');
          operationUserId=session.user?.id||operationUserId;
          if(!operationUserId)throw new Error('Нэвтэрсэн хэрэглэгчийг таньж чадсангүй. Дахин нэвтэрнэ үү.');
          writeClient=operationClient(session,sb);
          const storeRow=await store(); storeId=storeRow.id;
          if(target.storeId&&String(target.storeId)!==String(storeId))throw new Error('Дэлгүүр солигдсон байна. Падаанаа дахин нээнэ үү.');
          const local=readLocal();
          /* A foreground/photo-picker sync may rebuild the local list while this
             sheet is open. The Supabase UUID captured at open time remains the
             authoritative identity even if the disposable local ID changed. */
          const company=currentCompany(target)||(
            target.supplierId&&target.name
              ?{id:target.localId,name:target.name,supabase_supplier_id:target.supplierId,invoices:[]}
              :null
          );
          if(!company)throw new Error('Нийлүүлэгч олдсонгүй.');
          const supplier=await ensureSupplier(storeRow,company,{requireExistingId:Boolean(target.supplierId),client:writeClient}); supplierId=supplier.id;
          invoiceId=invoiceId||crypto.randomUUID();
          const draftArgs={
            p_invoice_id:invoiceId,p_supplier_id:supplierId,p_invoice_no:no,p_invoice_date:date,
            p_due_date:dueDate,p_amount:amount,p_discount_percent:discountPercent,
            p_discount_deadline:discountDeadline,p_image_url:null
          };
          const {error:invoiceError}=await writeClient.rpc('save_invoice_draft',draftArgs);
          if(invoiceError)throw new Error('Падаан хадгалахад алдаа: '+invoiceError.message);
          const imageUrls=[];
          for(let i=0;i<pendingFiles.length;i++){
            const file=await window.compressInvoiceImage(pendingFiles[i].file);
            const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
            const safe=['jpg','jpeg','png','webp','gif','heic','heif'].includes(ext)?ext:'jpg';
            const path=`${storeId}/${supplierId}/${invoiceId}/page-${i+1}-${Date.now()}-${crypto.randomUUID()}.${safe}`;
            /* Track an attempted path before awaiting the response. A network
               error can arrive after Storage already committed the object. */
            uploaded.push(path);
            const {error:uploadError}=await writeClient.storage.from('invoice-images').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
            if(uploadError)throw new Error(`${i+1}-р зураг хадгалахад алдаа: ${uploadError.message}`);
            const {data:urlData}=writeClient.storage.from('invoice-images').getPublicUrl(path); const imageUrl=urlData?.publicUrl||''; imageUrls.push(imageUrl);
            const {error:rowError}=await writeClient.from('invoice_images').insert({id:crypto.randomUUID(),invoice_id:invoiceId,image_url:imageUrl,image_path:path,page_number:i+1});
            if(rowError)throw new Error(`${i+1}-р зургийн мэдээлэл хадгалахад алдаа: ${rowError.message}`);
          }
          if(imageUrls[0]){
            const {error:updateError}=await writeClient.rpc('save_invoice_draft',{...draftArgs,p_image_url:imageUrls[0]});
            if(updateError)throw new Error('Падааны зураг холбоход алдаа: '+updateError.message);
          }
          const {error:confirmError}=await writeClient.rpc('confirm_invoice_with_note',{p_invoice_id:invoiceId,p_note:note});
          if(confirmError)throw new Error('Падаан бүртгэхэд алдаа: '+confirmError.message);

          const verifiedSession=(await sb.auth.getSession()).data?.session;
          if(!verifiedSession||String(verifiedSession.user?.id||'')!==String(operationUserId))throw new Error('Нэвтэрсэн хэрэглэгч солигдсон байна. Падааныг хадгалсангүй.');
          if(target.storeId&&String(window.__nayadActiveStoreId||storeId)!==String(target.storeId))throw new Error('Дэлгүүр солигдсон байна. Падааныг хадгалсангүй.');
          remoteComplete=true;

          company.supabase_supplier_id=supplierId;
          local.companies=local.companies||[];
          const companyName=String(company.name||'').trim().toLowerCase();
          let cidx=local.companies.findIndex(c=>String(c.supabase_supplier_id||'')===String(supplierId));
          if(cidx<0)cidx=local.companies.findIndex(c=>
            String(c.id)===String(company.id)
            &&String(c.name||'').trim().toLowerCase()===companyName
            &&(!c.supabase_supplier_id||String(c.supabase_supplier_id)===String(supplierId))
          );
          if(cidx<0)cidx=local.companies.findIndex(c=>String(c.name||'').trim().toLowerCase()===companyName&&(!c.supabase_supplier_id||String(c.supabase_supplier_id)===String(supplierId)));
          const previousDraft=target.draft||{};
          const inv={id:invoiceId,date,due_date:dueDate,no,amount,paid:Number(previousDraft.paid)||0,status:'confirmed',discount_percent:discountPercent,discount_deadline:discountDeadline,note:note||'',image_url:imageUrls[0]||previousDraft.image_url||'',image_urls:imageUrls.length?imageUrls:(previousDraft.image_urls||[]),image_paths:uploaded.length?uploaded:(previousDraft.image_paths||[]),image_count:imageUrls.length||(previousDraft.image_count||0),supabase_synced:true};
          if(cidx>=0){
            local.companies[cidx].supabase_supplier_id=supplierId;local.companies[cidx].invoices=local.companies[cidx].invoices||[];
            const existingIndex=local.companies[cidx].invoices.findIndex(item=>String(item.id)===String(invoiceId));
            if(existingIndex>=0)local.companies[cidx].invoices[existingIndex]=inv;else local.companies[cidx].invoices.push(inv);
          }
          else{local.companies.push({...company,supabase_supplier_id:supplierId,invoices:[...(company.invoices||[]),inv]});}
          try{writeLocal(local);}catch(cacheError){console.warn('Invoice local cache:',cacheError);}
          cloudCompanyTarget=null;clearPending();close();applyLocalData(local,true);
          notify('Падаан бүртгэгдлээ.');
          setTimeout(()=>window.__nayadStartCloudSync?.({reason:'invoice-saved',force:true}).catch(()=>{}),0);
        }catch(error){
          /* Keep compensation under the same cloud lock. A following sync must
             never observe a half-created invoice or partially uploaded pages. */
          if(!remoteComplete&&uploaded.length){
            try{const result=await writeClient.storage.from('invoice-images').remove(uploaded);if(result?.error)throw result.error;}
            catch(cleanupError){console.warn('Invoice storage cleanup:',cleanupError);}
          }
          if(!remoteComplete&&invoiceId){
            try{const result=uploaded.length?await writeClient.from('invoice_images').delete().in('image_path',uploaded):null;if(result?.error)throw result.error;}
            catch(cleanupError){console.warn('Invoice image rows cleanup:',cleanupError);}
            if(createdDraft){
              try{const result=await writeClient.rpc('delete_invoice_draft',{p_invoice_id:invoiceId});if(result?.error)throw result.error;}
              catch(cleanupError){console.warn('Invoice draft cleanup:',cleanupError);}
            }
          }
          throw error;
        }
      });
    }catch(e){
      console.error('NAYAD cloud invoice:',e);
      notify(e?.message||'Падаан хадгалахад алдаа гарлаа.');
      if(btn){btn.disabled=false;btn.textContent='ПАДААН БҮРТГЭХ';}
    }finally{
      invoiceSaving=false;
      if(window.__nayadCriticalOperation===operationToken)delete window.__nayadCriticalOperation;
    }
  };

  async function syncCloud(paymentGuard=null){
    const sb=client(); if(!sb)return;
    const session=(await sb.auth.getSession()).data?.session; if(!session)return;
    let storeRow; try{storeRow=await store()}catch(_){return;}
    const local=readLocal();local.companies=local.companies||[];local.payments=local.payments||[];
    await pushPendingPayments(storeRow,local);
    const {data:invoices,error}=await sb.from('invoices').select('id,supplier_id,invoice_no,invoice_date,due_date,amount,paid,image_url,status,discount_percent,discount_deadline,note,confirmed_at,created_at').eq('store_id',storeRow.id).order('invoice_date',{ascending:true});
    if(error||!invoices)return;
    const {data:cloudPayments,error:paymentsError}=await sb.from('payments').select('id,supplier_id,payment_date,amount,method,note,reference,status,created_at').eq('store_id',storeRow.id).order('created_at',{ascending:true});
    if(paymentsError)return;
    const {data:allocations,error:allocationsError}=invoices.length
      ?await sb.from('payment_allocations').select('invoice_id,cash_amount,discount_amount,payments!inner(status)').in('invoice_id',invoices.map(x=>x.id))
      :{data:[],error:null};
    if(allocationsError)return;
    const {data:agreements,error:agreementsError}=await sb.from('invoice_agreements').select('id,invoice_id,installment_no,installment_count,agreed_due_date,agreed_amount,note,contact_name,contact_phone,status,created_at').eq('store_id',storeRow.id).eq('status','active').order('installment_no',{ascending:true});
    if(agreementsError)return;
    /* Companies without invoices or payments are still part of the active
       store. Loading only supplier IDs referenced by financial rows removed a
       newly-created company from local state while its first invoice sheet was
       open, leaving the sheet with an obsolete local ID. */
    const {data:suppliers,error:suppliersError}=await sb.from('suppliers')
      .select('id,name,reg_no,address,director,director_phone,sales_rep,sales_phone,org_phone,bank_name,bank_account,is_active')
      .eq('store_id',storeRow.id)
      .order('created_at',{ascending:true});
    if(suppliersError||!suppliers)return;
    const {data:images}=invoices.length?await sb.from('invoice_images').select('invoice_id,image_url,image_path,page_number').in('invoice_id',invoices.map(x=>x.id)).order('page_number',{ascending:true}):{data:[]};
    /* A store snapshot is authoritative. Do not merge it into the previous
       browser list by name: an old/duplicated local supplier can otherwise
       survive on one device and make its balance differ from the other. */
    const previousCompanies=local.companies||[];
    const syncedCompanies=[];
    for(const s of suppliers){
      let c=previousCompanies.find(x=>String(x.supabase_supplier_id)===String(s.id))||previousCompanies.find(x=>String(x.name||'').trim().toLowerCase()===String(s.name||'').trim().toLowerCase());
      if(!c)c={id:Date.now()+Math.floor(Math.random()*100000),color:'green',invoices:[]};
      c.name=s.name;c.reg=s.reg_no||'';c.address=s.address||'';c.director=s.director||'';c.directorPhone=s.director_phone||'';c.sales=s.sales_rep||'';c.salesPhone=s.sales_phone||'';c.orgPhone=s.org_phone||'';c.bank=s.bank_name||'';c.bankAccount=s.bank_account||'';c.status=s.is_active===false?'inactive':'active';
      c.supabase_supplier_id=s.id;c.invoices=c.invoices||[];
      const remote=invoices.filter(i=>String(i.supplier_id)===String(s.id));
      const nextInvoices=remote.map(ri=>{
        const imgs=(images||[]).filter(im=>String(im.invoice_id)===String(ri.id)).sort((a,b)=>(a.page_number||1)-(b.page_number||1));
        const urls=imgs.map(x=>x.image_url).filter(Boolean); const paths=imgs.map(x=>x.image_path).filter(Boolean);
        const invoiceAgreements=(agreements||[]).filter(item=>String(item.invoice_id)===String(ri.id));
        const effectiveDue=invoiceAgreements.length?invoiceAgreements.map(item=>item.agreed_due_date).sort()[0]:(ri.due_date||null);
        const postedAllocations=(allocations||[]).filter(item=>String(item.invoice_id)===String(ri.id)&&item.payments?.status==='posted');
        const discountTaken=postedAllocations.reduce((sum,item)=>sum+(Number(item.discount_amount)||0),0);
        return {id:ri.id,date:ri.invoice_date,due_date:ri.due_date||null,effective_due_date:effectiveDue,no:ri.invoice_no||'',amount:Number(ri.amount)||0,paid:Number(ri.paid)||0,status:ri.status||'confirmed',discount_percent:Number(ri.discount_percent)||0,discount_deadline:ri.discount_deadline||null,discount_taken:discountTaken,note:ri.note||'',confirmed_at:ri.confirmed_at||null,created_at:ri.created_at||null,agreements:invoiceAgreements,image_url:ri.image_url||urls[0]||'',image_urls:urls,image_paths:paths,image_count:urls.length,supabase_synced:true};
      });
      c.invoices=nextInvoices;
      if(paymentGuard&&String(paymentGuard.supplierId)===String(s.id)){
        setCompanyRemainingBalance(c,paymentGuard.remaining);
      }
      syncedCompanies.push(c);
    }
    local.companies=syncedCompanies;
    const pendingLocal=local.payments.filter(p=>!p.supabase_synced);
    const syncedPayments=(cloudPayments||[]).map(p=>{
      const supplier=suppliers.find(s=>String(s.id)===String(p.supplier_id));
      const company=local.companies.find(c=>String(c.supabase_supplier_id)===String(p.supplier_id)||c.name===supplier?.name);
      return {id:p.id,companyId:company?.id,company:supplier?.name||company?.name||'Нийлүүлэгч',supabase_supplier_id:p.supplier_id,amount:Number(p.amount)||0,date:p.payment_date,method:p.method||'Бусад',note:p.note||'',reference:p.reference||'',status:p.status||'posted',created_at:p.created_at||null,supabase_synced:true};
    });
    const nextPayments=[...syncedPayments,...pendingLocal];
    local.payments=nextPayments;
    // Always commit after a successful cloud read. localStorage can already be
    // correct while the currently rendered in-memory state is stale.
    applyLocalData(local,true);
    sessionStorage.removeItem('NAYAD_CLOUD_SYNC_RELOAD');
  }

  let lastForegroundSync=0;
  function syncOnForeground(force=false){
    if(document.visibilityState==='hidden')return;
    const now=Date.now();if(!force&&now-lastForegroundSync<2000)return;lastForegroundSync=now;
    return queueCloudSync(()=>syncCloud()).catch(e=>console.warn('foreground invoice sync:',e));
  }
  window.addEventListener('load',()=>setTimeout(syncOnForeground,1000));
  window.addEventListener('pageshow',event=>{if(event.persisted)setTimeout(syncOnForeground,250);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(syncOnForeground,250);});
  window.__nayadSyncInvoices=()=>syncOnForeground(true);
  const authClient=client();
  if(typeof authClient?.auth?.onAuthStateChange==='function'){
    authClient.auth.onAuthStateChange((_event,session)=>{if(session)setTimeout(syncOnForeground,0);});
  }
})();
