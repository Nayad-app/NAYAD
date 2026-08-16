/* NAYAD cloud invoice layer — keeps the existing UI, but persists invoices and images in Supabase. */
(function(){
  const KEY = "NAYAD_DATA_V2";
  let cloudCompanyId = null;
  let pending = [];
  let reorderBound = false;
  let dragState = null;

  function client(){ return window.nayadSupabase || window.sb || null; }
  function readLocal(){ try{return JSON.parse(localStorage.getItem(KEY))||{companies:[],payments:[]}}catch(_){return {companies:[],payments:[]}} }
  function writeLocal(data){ localStorage.setItem(KEY, JSON.stringify(data)); }
  function val(id){ return document.getElementById(id)?.value || ""; }
  function esc(s){ return String(s??"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function notify(msg){ if(typeof window.toast==='function') window.toast(msg); else { const el=document.getElementById('toast'); if(el){el.textContent=msg;el.classList.remove('hide');setTimeout(()=>el.classList.add('hide'),2200)} } }
  function close(){ if(typeof window.closeSheet==='function') window.closeSheet(); else document.getElementById('modal')?.classList.add('hide'); }
  function openSheet(html){ if(typeof window.sheet==='function') window.sheet(html); else { const s=document.getElementById('sheet'); if(s){s.innerHTML=html;document.getElementById('modal')?.classList.remove('hide')} } }

  async function store(){
    const sb=client(); if(!sb) throw new Error('Supabase холболт олдсонгүй.');
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
    const data=readLocal();
    const company=(data.companies||[]).find(c=>String(c.id)===String(id));
    if(!company){notify('Нийлүүлэгч олдсонгүй.');return;}
    clearPending();
    reorderBound=false;
    openSheet(`<h2>Падаан нэмэх</h2><div class="card"><b>${esc(company.name)}</b></div>
      <div class="field"><label>Огноо</label><input id="cloudIDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Падааны дугаар</label><input id="cloudINo" placeholder="INV-0001"></div>
      <div class="field"><label>Нийт дүн</label><input id="cloudIAmount" type="number" inputmode="decimal" min="0" step="1" placeholder="0"></div>
      <div class="field"><label>Падааны зураг — олон хуудас нэмэх боломжтой</label>
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
    if(!pending.length){notify('Падааны зураг оруулна уу.');return;}
    const btn=document.getElementById('cloudSaveInvoiceBtn'); if(btn){btn.disabled=true;btn.textContent='Хадгалж байна...';}
    let invoiceId=null, supplierId=null, storeId=null, uploaded=[];
    try{
      const sb=client(); if(!sb)throw new Error('Supabase холболт олдсонгүй.');
      const session=(await sb.auth.getSession()).data?.session; if(!session)throw new Error('Эхлээд NAYAD-д нэвтэрнэ үү.');
      const storeRow=await store(); storeId=storeRow.id;
      const local=readLocal(); const company=(local.companies||[]).find(c=>String(c.id)===String(cloudCompanyId));
      if(!company)throw new Error('Нийлүүлэгч олдсонгүй.');
      const supplier=await ensureSupplier(storeRow,company); supplierId=supplier.id;
      invoiceId=crypto.randomUUID();
      const {error:invoiceError}=await sb.from('invoices').insert({id:invoiceId,store_id:storeId,supplier_id:supplierId,invoice_no:no,invoice_date:date,amount,paid:0,image_url:null});
      if(invoiceError)throw new Error('Падаан хадгалахад алдаа: '+invoiceError.message);
      const imageUrls=[];
      for(let i=0;i<pending.length;i++){
        const file=pending[i].file;
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
      writeLocal(local);
      clearPending();close();notify(`Падаан болон ${imageUrls.length} зураг cloud-д хадгалагдлаа.`);setTimeout(()=>location.reload(),500);
    }catch(e){
      console.error('NAYAD cloud invoice:',e);
      if(uploaded.length){try{await client().storage.from('invoice-images').remove(uploaded)}catch(_){} }
      if(invoiceId){try{await client().from('invoice_images').delete().eq('invoice_id',invoiceId);await client().from('invoices').delete().eq('id',invoiceId)}catch(_){} }
      notify(e?.message||'Падаан хадгалахад алдаа гарлаа.');
      if(btn){btn.disabled=false;btn.textContent='Падаан нэмэх';}
    }
  };

  async function syncCloud(){
    const sb=client(); if(!sb)return;
    const session=(await sb.auth.getSession()).data?.session; if(!session)return;
    let storeRow; try{storeRow=await store()}catch(_){return;}
    const {data:invoices,error}=await sb.from('invoices').select('id,supplier_id,invoice_no,invoice_date,amount,paid,image_url').eq('store_id',storeRow.id).order('invoice_date',{ascending:true});
    if(error||!invoices)return;
    const supplierIds=[...new Set(invoices.map(x=>x.supplier_id).filter(Boolean))];
    let suppliers=[];
    if(supplierIds.length){const r=await sb.from('suppliers').select('id,name,reg_no,address,director,director_phone,sales_phone,is_active').in('id',supplierIds);if(!r.error)suppliers=r.data||[];}
    const {data:images}=supplierIds.length?await sb.from('invoice_images').select('invoice_id,image_url,image_path,page_number').in('invoice_id',invoices.map(x=>x.id)).order('page_number',{ascending:true}):{data:[]};
    const local=readLocal(); local.companies=local.companies||[]; local.payments=local.payments||[];
    let changed=false;
    for(const s of suppliers){
      let c=local.companies.find(x=>x.supabase_supplier_id===s.id||x.name===s.name);
      if(!c){c={id:Date.now()+Math.floor(Math.random()*100000),name:s.name,reg:s.reg_no||'',address:s.address||'',director:s.director||'',directorPhone:s.director_phone||'',salesPhone:s.sales_phone||'',status:s.is_active===false?'inactive':'active',color:'green',invoices:[]};local.companies.push(c);changed=true;}
      c.supabase_supplier_id=s.id;c.invoices=c.invoices||[];
      const remote=invoices.filter(i=>i.supplier_id===s.id);
      for(const ri of remote){
        const imgs=(images||[]).filter(im=>String(im.invoice_id)===String(ri.id)).sort((a,b)=>(a.page_number||1)-(b.page_number||1));
        const urls=imgs.map(x=>x.image_url).filter(Boolean); const paths=imgs.map(x=>x.image_path).filter(Boolean);
        const next={id:ri.id,date:ri.invoice_date,no:ri.invoice_no||'',amount:Number(ri.amount)||0,paid:Number(ri.paid)||0,image_url:ri.image_url||urls[0]||'',image_urls:urls,image_paths:paths,image_count:urls.length,supabase_synced:true};
        const idx=c.invoices.findIndex(i=>String(i.id)===String(ri.id));
        if(idx<0){c.invoices.push(next);changed=true;}else{
          const old=c.invoices[idx]; const same=JSON.stringify([old.date,old.no,old.amount,old.paid,old.image_url,old.image_count])===JSON.stringify([next.date,next.no,next.amount,next.paid,next.image_url,next.image_count]);
          if(!same){c.invoices[idx]={...old,...next};changed=true;}
        }
      }
    }
    if(changed){writeLocal(local);if(sessionStorage.getItem('NAYAD_CLOUD_SYNC_RELOAD')!=='1'){sessionStorage.setItem('NAYAD_CLOUD_SYNC_RELOAD','1');location.reload();}}else sessionStorage.removeItem('NAYAD_CLOUD_SYNC_RELOAD');
  }

  window.addEventListener('load',()=>setTimeout(()=>syncCloud().catch(e=>console.warn('cloud invoice sync:',e)),1000));
})();
