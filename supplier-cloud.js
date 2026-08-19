/* NAYAD supplier cloud layer — syncs supplier CRUD and totals across store members. */
(function(){
  const KEY='NAYAD_DATA_V2';
  const USER_DATA_PREFIX='NAYAD_DATA_V3:';
  const SYNC_FLAG='NAYAD_SUPPLIER_SYNC_RELOAD';

  if(typeof window.__nayadQueueCloudSync!=='function'){
    window.__nayadCloudSyncQueue=Promise.resolve();
    window.__nayadQueueCloudSync=function(task){
      const run=(window.__nayadCloudSyncQueue||Promise.resolve()).catch(()=>{}).then(task);
      window.__nayadCloudSyncQueue=run.catch(()=>{});
      return run;
    };
  }
  function queueCloudSync(task){return window.__nayadQueueCloudSync(task);}

  function sb(){ return window.nayadSupabase || window.sb || null; }
  function dataKey(){ return typeof window.__nayadStoreDataKey==='function'?window.__nayadStoreDataKey():(window.__nayadUser?.id ? USER_DATA_PREFIX+window.__nayadUser.id : KEY); }
  function readLocal(){
    if(window.__nayadState)return window.__nayadState.read();
    try{return JSON.parse(localStorage.getItem(dataKey()))||{companies:[],payments:[]}}catch(_){return {companies:[],payments:[]}}
  }
  function writeLocal(x){
    if(window.__nayadState)return window.__nayadState.commit(x,{render:false});
    localStorage.setItem(dataKey(),JSON.stringify(x));return x;
  }
  function val(id){ return document.getElementById(id)?.value?.trim?.() || document.getElementById(id)?.value || ''; }
  function toastMsg(msg){ if(typeof window.toast==='function')window.toast(msg); }
  function norm(s){ return String(s||'').trim().toLowerCase(); }
  function duplicateLocalSupplier(name,excludeId=''){
    return (readLocal().companies||[]).find(company=>norm(company.name)===norm(name)&&String(company.id)!==String(excludeId));
  }
  function sameSupplier(a,b){
    if(a?.supabase_supplier_id && b?.id) return String(a.supabase_supplier_id)===String(b.id);
    const sameName=norm(a?.name)===norm(b?.name);
    const ar=norm(a?.reg), br=norm(b?.reg_no);
    return sameName && (!ar || !br || ar===br);
  }
  async function myStore(){
    const c=sb(); if(!c)throw new Error('Supabase холболт олдсонгүй.');
    if(typeof window.__nayadGetActiveStore==='function'){
      const activeStore=await window.__nayadGetActiveStore();
      if(activeStore?.id)return activeStore;
    }
    const {data,error}=await c.rpc('ensure_my_store'); if(error)throw error;
    const row=Array.isArray(data)?data[0]:data;
    if(row?.id)return row;
    throw new Error('Таны дэлгүүр үүссэнгүй.');
  }
  function payload(storeId,x){
    return {
      store_id:storeId,
      name:String(x.name||'').trim(),
      reg_no:String(x.reg||'').trim()||null,
      address:String(x.address||'').trim()||null,
      director:String(x.director||'').trim()||null,
      director_phone:String(x.directorPhone||'').trim()||null,
      sales_rep:String(x.sales||'').trim()||null,
      sales_phone:String(x.salesPhone||'').trim()||null,
      org_phone:String(x.orgPhone||'').trim()||null,
      bank_name:String(x.bank||'').trim()||null,
      bank_account:String(x.bankAccount||'').trim()||null,
      is_active:x.status!=='inactive'
    };
  }
  async function findExisting(storeId,x){
    const c=sb();
    if(x.supabase_supplier_id){
      const q=await c.from('suppliers').select('*').eq('store_id',storeId).eq('id',x.supabase_supplier_id).maybeSingle();
      if(!q.error&&q.data)return q.data;
    }
    const wantedName=String(x.name||'').trim();
    const r=await c.from('suppliers').select('*').eq('store_id',storeId).ilike('name',wantedName).limit(20);
    if(!r.error){
      const exact=(r.data||[]).find(row=>norm(row.name)===norm(wantedName));
      if(exact)return exact;
    }
    return null;
  }
  async function ensureCloudSupplier(x){
    const c=sb(), store=await myStore(), body=payload(store.id,x);
    let row=await findExisting(store.id,x);
    if(row){
      const u=await c.from('suppliers').update(body).eq('id',row.id).eq('store_id',store.id).select('*').single();
      if(u.error)throw u.error; return u.data;
    }
    const ins=await c.from('suppliers').insert(body).select('*').single();
    if(!ins.error)return ins.data;
    if(ins.error?.code==='23505'){
      row=await findExisting(store.id,x); if(row)return row;
    }
    throw ins.error;
  }
  async function createCloudSupplier(x){
    const c=sb(),store=await myStore();
    const ins=await c.from('suppliers').insert(payload(store.id,x)).select('*').single();
    if(ins.error)throw ins.error;
    return ins.data;
  }
  function attachCloudId(localId,cloudId){
    const d=readLocal(), c=(d.companies||[]).find(x=>String(x.id)===String(localId));
    if(c){c.supabase_supplier_id=cloudId;writeLocal(d);}
  }

  const originalSaveCompany=window.saveCompany;
  if(typeof originalSaveCompany==='function'){
    window.saveCompany=async function(){
      const name=val('newName'); if(!name){toastMsg('Компанийн нэр оруулна уу.');return;}
      if(duplicateLocalSupplier(name)){toastMsg('Ийм нэртэй компани бүртгэлтэй байна.');return;}
      const bank=val('newBank'),bankAccount=val('newBankAccount').toUpperCase();
      if((bank&&!bankAccount)||(!bank&&bankAccount)){toastMsg('Банк болон дансны дугаарыг хоёуланг нь оруулна уу.');return;}
      const draft={name,reg:val('newReg'),address:val('newAddress'),director:val('newDirector'),directorPhone:val('newDirectorPhone'),sales:val('newSales'),salesPhone:val('newSalesPhone'),orgPhone:val('newOrgPhone'),bank,bankAccount,status:'active'};
      try{
        const store=await myStore();
        const existing=await findExisting(store.id,draft);
        if(existing){toastMsg('Ийм нэртэй компани бүртгэлтэй байна.');return;}
        const cloud=await createCloudSupplier(draft);
        originalSaveCompany();
        const d=readLocal();
        const matches=(d.companies||[]).filter(c=>norm(c.name)===norm(name)&&(!draft.reg||!c.reg||norm(c.reg)===norm(draft.reg)));
        const local=matches[matches.length-1]; if(local){local.supabase_supplier_id=cloud.id;writeLocal(d);}
        toastMsg('Нийлүүлэгч cloud-д хадгалагдлаа.');
      }catch(e){
        console.error('supplier create:',e);
        toastMsg(e?.code==='23505'?'Ийм нэртэй компани бүртгэлтэй байна.':'Нийлүүлэгч хадгалахад алдаа: '+(e?.message||''));
      }
    };
  }

  const originalSaveEdit=window.saveEdit;
  if(typeof originalSaveEdit==='function'){
    window.saveEdit=async function(){
      try{
        const target=(typeof selected!=='undefined'&&selected)?selected:null;
        if(!target){originalSaveEdit();return;}
        const draft={...target,name:val('eName')||target.name,reg:val('eReg'),address:val('eAddress'),director:val('eDirector'),directorPhone:val('eDirectorPhone'),sales:val('eSales'),salesPhone:val('eSalesPhone'),orgPhone:val('eOrgPhone'),bank:val('eBank'),bankAccount:val('eBankAccount').toUpperCase(),status:val('eStatus')||'active'};
        if(duplicateLocalSupplier(draft.name,target.id)){toastMsg('Ийм нэртэй компани бүртгэлтэй байна.');return;}
        if((draft.bank&&!draft.bankAccount)||(!draft.bank&&draft.bankAccount)){toastMsg('Банк болон дансны дугаарыг хоёуланг нь оруулна уу.');return;}
        const cloud=await ensureCloudSupplier(draft);
        target.supabase_supplier_id=cloud.id;
        originalSaveEdit();
        attachCloudId(target.id,cloud.id);
        toastMsg('Нийлүүлэгчийн мэдээлэл cloud-д шинэчлэгдлээ.');
      }catch(e){console.error('supplier update:',e);toastMsg('Нийлүүлэгч засахад алдаа: '+(e?.message||''));}
    };
  }

  const originalDeleteCompany=window.deleteCompany;
  if(typeof originalDeleteCompany==='function'){
    window.deleteCompany=async function(id){
      const d=readLocal(), local=(d.companies||[]).find(x=>String(x.id)===String(id));
      if(!local){return originalDeleteCompany(id);}
      try{
        if(local.supabase_supplier_id){
          const c=sb();
          const count=await c.from('invoices').select('id',{count:'exact',head:true}).eq('supplier_id',local.supabase_supplier_id);
          if(count.error)throw count.error;
          if((count.count||0)>0){
            const u=await c.from('suppliers').update({is_active:false}).eq('id',local.supabase_supplier_id);
            if(u.error)throw u.error;
            toastMsg('Падааны түүхтэй тул устгахгүй, идэвхгүй хэвээр үлдээлээ.');
            return;
          }
          const del=await c.from('suppliers').delete().eq('id',local.supabase_supplier_id); if(del.error)throw del.error;
        }
        originalDeleteCompany(id);
      }catch(e){console.error('supplier delete:',e);toastMsg('Нийлүүлэгч устгахад алдаа: '+(e?.message||''));}
    };
  }

  function enhanceSupplierSummary(){
    try{
      if(typeof selected==='undefined'||!selected)return;
      const content=document.getElementById('content'); if(!content||content.querySelector('[data-supplier-summary="1"]'))return;
      const invoices=Array.isArray(selected.invoices)?selected.invoices:[];
      const total=invoices.reduce((s,i)=>s+(Number(i.amount)||0),0);
      const paid=invoices.reduce((s,i)=>s+(Number(i.paid)||0),0);
      const balance=total-paid;
      const titles=[...content.querySelectorAll('.sectionTitle')]; const anchor=titles[0]; if(!anchor)return;
      const el=document.createElement('div'); el.dataset.supplierSummary='1'; el.className='card';
      const fmt=n=>typeof window.money==='function'?window.money(n):new Intl.NumberFormat('mn-MN').format(Math.round(n||0))+' ₮';
      el.innerHTML=`<div class="row"><div><small class="sub">Нийт падаан</small><b>${invoices.length}</b></div><div style="text-align:right"><small class="sub">Нийт дүн</small><b>${fmt(total)}</b></div></div><div class="row" style="margin-top:12px"><div><small class="sub">Төлсөн</small><b class="greenText">${fmt(paid)}</b></div><div style="text-align:right"><small class="sub">Үлдэгдэл</small><b class="redText">${fmt(balance)}</b></div></div>`;
      anchor.parentNode.insertBefore(el,anchor);
    }catch(e){console.warn('supplier summary:',e);}
  }
  const originalCompany=window.company;
  if(typeof originalCompany==='function'){
    window.company=function(id){ const r=originalCompany(id); setTimeout(enhanceSupplierSummary,0); return r; };
  }

  async function syncSuppliers(){
    const c=sb(); if(!c)return;
    const session=(await c.auth.getSession()).data?.session; if(!session)return;
    const store=await myStore();

    const r=await c.from('suppliers').select('id,name,reg_no,address,director,director_phone,sales_rep,sales_phone,org_phone,bank_name,bank_account,is_active').eq('store_id',store.id).order('created_at',{ascending:true});
    if(r.error)throw r.error;
    const d=readLocal(); d.companies=d.companies||[]; let changed=false;
    const companiesAtSyncStart=new Set(d.companies.map(company=>String(company.id)));
    const remote=r.data||[];

    for(const s of remote){
      let local=d.companies.find(x=>sameSupplier(x,s));
      if(!local){
        local={id:Date.now()+Math.floor(Math.random()*1000000),name:s.name,color:'green',status:s.is_active===false?'inactive':'active',invoices:[]};
        d.companies.push(local); changed=true;
      }
      const next={supabase_supplier_id:s.id,name:s.name,reg:s.reg_no||'',address:s.address||'',director:s.director||'',directorPhone:s.director_phone||'',sales:s.sales_rep||'',salesPhone:s.sales_phone||'',orgPhone:s.org_phone||'',bank:s.bank_name||'',bankAccount:s.bank_account||'',status:s.is_active===false?'inactive':'active'};
      for(const [k,v] of Object.entries(next)){if(local[k]!==v){local[k]=v;changed=true;}}
      local.invoices=local.invoices||[];
    }

    /* Supabase is authoritative after sign-in. Old per-device rows must never
       be uploaded as new suppliers, otherwise desktop and mobile diverge. */
    const remoteIds=new Set(remote.map(s=>String(s.id)));
    const authoritativeBySupplier=new Map();
    for(const company of d.companies){
      const supplierId=String(company.supabase_supplier_id||'');
      if(!remoteIds.has(supplierId)){changed=true;continue;}
      const existing=authoritativeBySupplier.get(supplierId);
      if(!existing){authoritativeBySupplier.set(supplierId,company);continue;}
      const invoiceIds=new Set((existing.invoices||[]).map(invoice=>String(invoice.id)));
      for(const invoice of company.invoices||[]){if(!invoiceIds.has(String(invoice.id))){existing.invoices.push(invoice);invoiceIds.add(String(invoice.id));}}
      for(const payment of d.payments||[]){if(String(payment.companyId)===String(company.id)){payment.companyId=existing.id;payment.company=existing.name;}}
      changed=true;
    }
    const authoritative=[...authoritativeBySupplier.values()];
    if(authoritative.length!==d.companies.length)changed=true;
    d.companies=authoritative;
    const authoritativeLocalIds=new Set(d.companies.map(company=>String(company.id)));

    if(changed){
      /* Supplier metadata may finish syncing after a payment. Merge it into the
         newest local snapshot so a stale supplier request can never overwrite
         updated invoice paid amounts or newly recorded payments. */
      const fresh=readLocal();fresh.companies=fresh.companies||[];
      for(const synced of d.companies){
        let target=fresh.companies.find(x=>(x.supabase_supplier_id&&synced.supabase_supplier_id&&String(x.supabase_supplier_id)===String(synced.supabase_supplier_id))||String(x.id)===String(synced.id)||norm(x.name)===norm(synced.name));
        if(!target){fresh.companies.push(synced);continue;}
        const newestInvoices=target.invoices||[];
        Object.assign(target,synced);
        target.invoices=newestInvoices;
      }
      /* Preserve a supplier created while this request was in flight, but
         remove every stale row that existed before the cloud snapshot. */
      fresh.companies=fresh.companies.filter(company=>authoritativeLocalIds.has(String(company.id))||!companiesAtSyncStart.has(String(company.id)));
      if(window.__nayadState)window.__nayadState.commit(fresh,{render:true});
      else writeLocal(fresh);
      sessionStorage.removeItem(SYNC_FLAG);
    }else sessionStorage.removeItem(SYNC_FLAG);
  }

  function requestSupplierSync(){return queueCloudSync(()=>syncSuppliers()).catch(e=>console.warn('supplier cloud sync:',e));}
  window.__nayadSyncSuppliers=requestSupplierSync;
  window.addEventListener('load',()=>setTimeout(requestSupplierSync,1400));
  const authClient=sb();
  if(typeof authClient?.auth?.onAuthStateChange==='function'){
    authClient.auth.onAuthStateChange((_event,session)=>{if(session)setTimeout(requestSupplierSync,0);});
  }
})();
