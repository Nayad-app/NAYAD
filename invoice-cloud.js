/* NAYAD cloud invoice layer — keeps the existing UI, but persists invoices and images in Supabase. */
(function(){
  const KEY = "NAYAD_DATA_V2";
  const USER_DATA_PREFIX = "NAYAD_DATA_V3:";
  let cloudCompanyId = null;
  let pending = [];
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
    const invoices=[...(company?.invoices||[])].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    for(const invoice of invoices){
      if(left<=0)break;
      const balance=Math.max((Number(invoice.amount)||0)-(Number(invoice.paid)||0),0);
      if(balance<=0)continue;
      const take=Math.min(balance,left);invoice.paid=(Number(invoice.paid)||0)+take;left-=take;
    }
  }
  function setCompanyRemainingBalance(company,remaining){
    if(!company||!Number.isFinite(Number(remaining)))return;
    const invoices=[...(company.invoices||[])].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    const total=invoices.reduce((sum,i)=>sum+(Number(i.amount)||0),0);
    let paidTotal=Math.max(total-Number(remaining),0);
    for(const invoice of invoices){
      const amount=Math.max(Number(invoice.amount)||0,0);
      const paid=Math.min(amount,paidTotal);invoice.paid=paid;paidTotal-=paid;
    }
    company.debt=Number(remaining);
  }
  function currentCompany(id){
    const same=x=>x&&String(x.id)===String(id);
    if(typeof selected!=='undefined'&&same(selected))return selected;
    if(typeof data!=='undefined'&&Array.isArray(data?.companies)){
      const live=data.companies.find(same); if(live)return live;
    }
    return (readLocal().companies||[]).find(same)||null;
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

  async function ensureSupplier(storeRow, company){
    const sb=client();
    if(company.supabase_supplier_id){
      const {data,error}=await sb.from('suppliers').select('id,name').eq('id',company.supabase_supplier_id).eq('store_id',storeRow.id).maybeSingle();
      if(!error && data) return data;
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
      .select('id,supplier_id,invoice_no,invoice_date,amount,paid,image_url')
      .eq('supplier_id',supplierId)
      .order('invoice_date',{ascending:true});
    if(error)throw error;
    const fresh=readLocal();
    fresh.companies=fresh.companies||[];
    const company=fresh.companies.find(c=>String(c.supabase_supplier_id)===String(supplierId));
    if(!company)throw new Error('Төлбөрийн нийлүүлэгч дэлгэцийн төлөвт олдсонгүй.');
    const existing=new Map((company.invoices||[]).map(invoice=>[String(invoice.id),invoice]));
    company.invoices=(rows||[]).map(row=>{
      const previous=existing.get(String(row.id))||{};
      return {
        ...previous,
        id:row.id,
        date:row.invoice_date,
        no:row.invoice_no||'',
        amount:Number(row.amount)||0,
        paid:Number(row.paid)||0,
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
    const amount=Number(val('pAmount'));
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
    try{
      await queueCloudSync(async()=>{
        const sb=client();if(!sb)throw new Error('Supabase холболт олдсонгүй.');
        const session=(await sb.auth.getSession()).data?.session;if(!session)throw new Error('Эхлээд NAYAD-д нэвтэрнэ үү.');
        const storeRow=await store(),supplier=await ensureSupplier(storeRow,company);
        const payment={id:crypto.randomUUID(),companyId:company.id,company:company.name,supabase_supplier_id:supplier.id,amount,date,method,supabase_synced:true};
        const cloudResult=await recordCloudPayment(sb,supplier.id,payment);
        const remaining=Number(cloudResult?.result?.remaining_balance);
        const local=readLocal();local.payments=local.payments||[];
        const localCompany=(local.companies||[]).find(c=>String(c.supabase_supplier_id)===String(supplier.id)||String(c.id)===String(company.id)||String(c.name||'').trim().toLowerCase()===String(company.name||'').trim().toLowerCase());
        if(!localCompany)throw new Error('Төлбөрийн нийлүүлэгч дотоод төлөвт олдсонгүй.');
        if(Number.isFinite(remaining))setCompanyRemainingBalance(localCompany,remaining);else applyPaymentToInvoices(localCompany,amount);
        if(!local.payments.some(p=>String(p.id)===String(payment.id)))local.payments.push(payment);
        close();
        applyLocalData(local,true);
        notify(Number.isFinite(remaining)?`Төлбөр бүртгэгдлээ. Үлдэгдэл: ${new Intl.NumberFormat('mn-MN').format(remaining)} ₮`:'Төлбөр cloud-д амжилттай бүртгэгдлээ.');
        await refreshPaidSupplier(sb,supplier.id,remaining);
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
  window.__removeCloudInvoiceImage=function(i){ const x=pending[i]; if(x?.preview)URL.revokeObjectURL(x.preview); pending.splice(i,1); renderPending(); };
  function addFiles(files){
    for(const file of files||[]){
      if(!file.type.startsWith('image/')){notify('Зөвхөн зураг сонгоно уу.');continue;}
      pending.push({file,preview:URL.createObjectURL(file),name:file.name||('page-'+(pending.length+1))});
    }
    renderPending();
  }

  window.invoice=function(id){
    cloudCompanyId=id;
    const company=currentCompany(id);
    if(!company){notify('Нийлүүлэгч олдсонгүй.');return;}
    clearPending();
    reorderBound=false;
    openSheet(`<h2>Падаан нэмэх</h2><div class="card"><b>${esc(company.name)}</b></div>
      <div class="field"><label>Огноо</label><input id="cloudIDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Падааны дугаар</label><input id="cloudINo" placeholder="INV-0001"></div>
      <div class="field"><label>Нийт дүн</label><input id="cloudIAmount" type="number" inputmode="decimal" min="0" step="1" placeholder="0"></div>
      <div class="field"><label>Падааны зураг — заавал биш, олон хуудас нэмэх боломжтой</label>
        <div class="imageTools"><button type="button" class="secondary" onclick="document.getElementById('cloudGalleryInput').click()">🖼️ Зураг сонгох</button><button type="button" class="secondary" onclick="document.getElementById('cloudCameraInput').click()">📷 Камераар авах</button></div>
        <input id="cloudGalleryInput" type="file" accept="image/*" multiple class="hide"><input id="cloudCameraInput" type="file" accept="image/*" capture="environment" class="hide">
        <div class="sub" style="margin-top:7px">Зүүн талын ☷ тэмдэг дээр дараад шууд дээш/доош чирж дарааллыг солино.</div><div id="cloudImageList" class="imageList"></div>
      </div>
      <div class="actions"><button class="secondary" onclick="window.__cancelCloudInvoice()">Болих</button><button id="cloudSaveInvoiceBtn" class="primary" onclick="window.__saveCloudInvoice()">Падаан нэмэх</button></div>`);
    document.getElementById('cloudGalleryInput').onchange=function(){addFiles([...this.files]);this.value=''};
    document.getElementById('cloudCameraInput').onchange=function(){addFiles([...this.files]);this.value=''};
    renderPending();
  };
  window.__cancelCloudInvoice=function(){clearPending();close();};

  window.__saveCloudInvoice=async function(){
    const amount=Number(val('cloudIAmount'));
    const date=val('cloudIDate')||new Date().toISOString().slice(0,10);
    const no=val('cloudINo')||('INV-'+Date.now().toString().slice(-6));
    if(!amount || amount<0){notify('Нийт дүн оруулна уу.');return;}
    const btn=document.getElementById('cloudSaveInvoiceBtn'); if(btn){btn.disabled=true;btn.textContent='Хадгалж байна...';}
    let invoiceId=null, supplierId=null, storeId=null, uploaded=[];
    try{
      const sb=client(); if(!sb)throw new Error('Supabase холболт олдсонгүй.');
      const session=(await sb.auth.getSession()).data?.session; if(!session)throw new Error('Эхлээд NAYAD-д нэвтэрнэ үү.');
      const storeRow=await store(); storeId=storeRow.id;
      const local=readLocal(); const company=currentCompany(cloudCompanyId);
      if(!company)throw new Error('Нийлүүлэгч олдсонгүй.');
      const supplier=await ensureSupplier(storeRow,company); supplierId=supplier.id;
      invoiceId=crypto.randomUUID();
      const {error:invoiceError}=await sb.from('invoices').insert({id:invoiceId,store_id:storeId,supplier_id:supplierId,invoice_no:no,invoice_date:date,amount,paid:0,image_url:null});
      if(invoiceError)throw new Error('Падаан хадгалахад алдаа: '+invoiceError.message);
      const imageUrls=[];
      for(let i=0;i<pending.length;i++){
        const file=await window.compressInvoiceImage(pending[i].file);
        const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
        const safe=['jpg','jpeg','png','webp','gif','heic','heif'].includes(ext)?ext:'jpg';
        const path=`${storeId}/${supplierId}/${invoiceId}/page-${i+1}-${Date.now()}-${crypto.randomUUID()}.${safe}`;
        const {error:uploadError}=await sb.storage.from('invoice-images').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
        if(uploadError)throw new Error(`${i+1}-р зураг хадгалахад алдаа: ${uploadError.message}`);
        uploaded.push(path);
        const {data:urlData}=sb.storage.from('invoice-images').getPublicUrl(path); const imageUrl=urlData?.publicUrl||''; imageUrls.push(imageUrl);
        const {error:rowError}=await sb.from('invoice_images').insert({id:crypto.randomUUID(),invoice_id:invoiceId,image_url:imageUrl,image_path:path,page_number:i+1});
        if(rowError)throw new Error(`${i+1}-р зургийн мэдээлэл хадгалахад алдаа: ${rowError.message}`);
      }
      if(imageUrls[0]){const {error:updateError}=await sb.from('invoices').update({image_url:imageUrls[0]}).eq('id',invoiceId);if(updateError)throw new Error('Падааны зураг холбоход алдаа: '+updateError.message);}
      company.supabase_supplier_id=supplierId;
      const cidx=(local.companies||[]).findIndex(c=>String(c.id)===String(company.id));
      const inv={id:invoiceId,date,no,amount,paid:0,image_url:imageUrls[0]||'',image_urls:imageUrls,image_paths:uploaded,image_count:imageUrls.length,supabase_synced:true};
      if(cidx>=0){local.companies[cidx].supabase_supplier_id=supplierId;local.companies[cidx].invoices=local.companies[cidx].invoices||[];local.companies[cidx].invoices.push(inv);}
      else{local.companies=local.companies||[];local.companies.push({...company,supabase_supplier_id:supplierId,invoices:[...(company.invoices||[]),inv]});}
      writeLocal(local);
      clearPending();close();notify(imageUrls.length?`Падаан болон ${imageUrls.length} зураг cloud-д хадгалагдлаа.`:'Падаан зураггүйгээр хадгалагдлаа.');setTimeout(()=>location.reload(),500);
    }catch(e){
      console.error('NAYAD cloud invoice:',e);
      if(uploaded.length){try{await client().storage.from('invoice-images').remove(uploaded)}catch(_){} }
      if(invoiceId){try{await client().from('invoice_images').delete().eq('invoice_id',invoiceId);await client().from('invoices').delete().eq('id',invoiceId)}catch(_){} }
      notify(e?.message||'Падаан хадгалахад алдаа гарлаа.');
      if(btn){btn.disabled=false;btn.textContent='Падаан нэмэх';}
    }
  };

  async function syncCloud(paymentGuard=null){
    const sb=client(); if(!sb)return;
    const session=(await sb.auth.getSession()).data?.session; if(!session)return;
    let storeRow; try{storeRow=await store()}catch(_){return;}
    const local=readLocal();local.companies=local.companies||[];local.payments=local.payments||[];
    await pushPendingPayments(storeRow,local);
    const {data:invoices,error}=await sb.from('invoices').select('id,supplier_id,invoice_no,invoice_date,amount,paid,image_url').eq('store_id',storeRow.id).order('invoice_date',{ascending:true});
    if(error||!invoices)return;
    const {data:cloudPayments,error:paymentsError}=await sb.from('payments').select('id,supplier_id,payment_date,amount,method,note,created_at').eq('store_id',storeRow.id).order('created_at',{ascending:true});
    if(paymentsError)return;
    const supplierIds=[...new Set([...invoices.map(x=>x.supplier_id),...(cloudPayments||[]).map(x=>x.supplier_id)].filter(Boolean))];
    let suppliers=[];
    if(supplierIds.length){const r=await sb.from('suppliers').select('id,name,reg_no,address,director,director_phone,sales_phone,is_active').in('id',supplierIds);if(!r.error)suppliers=r.data||[];}
    const {data:images}=invoices.length?await sb.from('invoice_images').select('invoice_id,image_url,image_path,page_number').in('invoice_id',invoices.map(x=>x.id)).order('page_number',{ascending:true}):{data:[]};
    let changed=false;
    for(const s of suppliers){
      let c=local.companies.find(x=>x.supabase_supplier_id===s.id||x.name===s.name);
      if(!c){c={id:Date.now()+Math.floor(Math.random()*100000),name:s.name,reg:s.reg_no||'',address:s.address||'',director:s.director||'',directorPhone:s.director_phone||'',salesPhone:s.sales_phone||'',status:s.is_active===false?'inactive':'active',color:'green',invoices:[]};local.companies.push(c);changed=true;}
      c.supabase_supplier_id=s.id;c.invoices=c.invoices||[];
      const remote=invoices.filter(i=>i.supplier_id===s.id);
      const nextInvoices=remote.map(ri=>{
        const imgs=(images||[]).filter(im=>String(im.invoice_id)===String(ri.id)).sort((a,b)=>(a.page_number||1)-(b.page_number||1));
        const urls=imgs.map(x=>x.image_url).filter(Boolean); const paths=imgs.map(x=>x.image_path).filter(Boolean);
        return {id:ri.id,date:ri.invoice_date,no:ri.invoice_no||'',amount:Number(ri.amount)||0,paid:Number(ri.paid)||0,image_url:ri.image_url||urls[0]||'',image_urls:urls,image_paths:paths,image_count:urls.length,supabase_synced:true};
      });
      if(JSON.stringify(c.invoices)!==JSON.stringify(nextInvoices))changed=true;
      // Supabase is authoritative. Do not keep invoices that only exist in one
      // browser's old localStorage; that is what made phone and computer differ.
      c.invoices=nextInvoices;
      if(paymentGuard&&String(paymentGuard.supplierId)===String(s.id)){
        setCompanyRemainingBalance(c,paymentGuard.remaining);
      }
    }
    const pendingLocal=local.payments.filter(p=>!p.supabase_synced);
    const syncedPayments=(cloudPayments||[]).map(p=>{
      const supplier=suppliers.find(s=>String(s.id)===String(p.supplier_id));
      const company=local.companies.find(c=>String(c.supabase_supplier_id)===String(p.supplier_id)||c.name===supplier?.name);
      return {id:p.id,companyId:company?.id,company:supplier?.name||company?.name||'Нийлүүлэгч',supabase_supplier_id:p.supplier_id,amount:Number(p.amount)||0,date:p.payment_date,method:p.method||'Бусад',note:p.note||'',supabase_synced:true};
    });
    const nextPayments=[...syncedPayments,...pendingLocal];
    if(JSON.stringify(local.payments)!==JSON.stringify(nextPayments)){local.payments=nextPayments;changed=true;}
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
