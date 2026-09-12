/* NAYAD system administrator dashboard — read-only, server-authorized views. */
(function(){
  if(window.__nayadAdminDashboardV1)return;
  window.__nayadAdminDashboardV1=true;

  const STYLE=`<style id="nayad-admin-dashboard-styles">
  body.nayadAdminOpen{overflow:hidden}
  .nayadAdminRoot{position:fixed;inset:0;z-index:85;display:none;justify-content:center;background:rgba(17,17,17,.22)}
  .nayadAdminRoot.open{display:flex}
  .nayadAdminShell{width:min(100%,430px);height:100%;height:100dvh;overflow:auto;overscroll-behavior:contain;background:#FBFBF9;color:#171717;box-shadow:0 0 44px rgba(0,0,0,.16)}
  .nayadAdminTop{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:8px;padding:calc(12px + env(safe-area-inset-top)) 18px 11px;background:rgba(251,251,249,.96);border-bottom:1px solid #E7E7E1;backdrop-filter:blur(12px)}
  .nayadAdminBack{width:40px;height:40px;padding:0;border-radius:12px;background:#F0F0EC;color:#171717;display:grid;place-items:center}.nayadAdminBack svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
  .nayadAdminBrand{justify-self:center;font-size:25px;font-weight:950;letter-spacing:-1px;white-space:nowrap}.nayadAdminBrand .y{color:#F4B900}
  .nayadAdminSecure{display:flex;align-items:center;gap:5px;color:#555;font-size:10px;white-space:nowrap}.nayadAdminSecure svg{width:19px;height:19px;fill:none;stroke:#F4B900;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .nayadAdminBody{padding:22px 18px calc(34px + env(safe-area-inset-bottom))}
  .nayadAdminEyebrow{color:#E2A900;font-size:11px;font-weight:900;letter-spacing:.3px;margin-bottom:7px}.nayadAdminTitle{margin:0;font-size:30px;line-height:1.08;letter-spacing:-1px;font-weight:950}.nayadAdminLead{margin:9px 0 18px;color:#777872;font-size:12px;line-height:1.5}
  .nayadAdminStats{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:17px 0}.nayadAdminStat{min-height:92px;padding:14px;border:1px solid #E3E3DD;border-radius:17px;background:#fff;display:flex;align-items:center;gap:11px;box-shadow:0 4px 13px rgba(20,20,20,.035)}.nayadAdminStatIcon{width:39px;height:39px;flex:0 0 39px;border-radius:13px;background:#F4F4F1;color:#8B8D89;display:grid;place-items:center}.nayadAdminStatIcon.yellow{background:#FFF8DD;color:#EAAF00}.nayadAdminStatIcon.green{background:#EAF8EF;color:#32A65A}.nayadAdminStatIcon.orange{background:#FFF0E5;color:#E36C0A}.nayadAdminStatIcon svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.nayadAdminStat small{display:block;color:#5F625F;font-size:11px;line-height:1.2}.nayadAdminStat b{display:block;font-size:25px;line-height:1;margin-top:6px;font-weight:950}
  .nayadAdminSection{margin:22px 2px 9px;color:#E2A900;font-size:11px;font-weight:950;letter-spacing:.35px}.nayadAdminNav,.nayadAdminCard{width:100%;border:1px solid #E3E3DD;border-radius:17px;background:#fff;color:#171717;box-shadow:0 4px 13px rgba(20,20,20,.035)}.nayadAdminNav{min-height:88px;padding:14px;display:flex;align-items:center;gap:13px;text-align:left;margin-bottom:10px}.nayadAdminNavIcon,.nayadAdminAvatar{width:43px;height:43px;flex:0 0 43px;border-radius:14px;background:#F3F3F0;color:#888A86;display:grid;place-items:center;font-size:16px;font-weight:950}.nayadAdminNavIcon.yellow{background:#FFF7D7;color:#EAAF00}.nayadAdminNavIcon svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.nayadAdminNavText{min-width:0;flex:1}.nayadAdminNavText b{display:block;font-size:15px;font-weight:900}.nayadAdminNavText span{display:block;margin-top:4px;color:#777872;font-size:10px;line-height:1.35}.nayadAdminChevron{width:18px;height:18px;flex:0 0 18px;fill:none;stroke:#8E908C;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .nayadAdminSearch{position:relative;margin:16px 0 10px}.nayadAdminSearch svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:20px;height:20px;fill:none;stroke:#858A99;stroke-width:2}.nayadAdminSearch input{width:100%;height:48px;padding:0 14px 0 43px;border:1px solid #DDDED9;border-radius:15px;background:#fff;color:#171717;font-size:12px;outline:none}.nayadAdminSearch input:focus{border-color:#D8AD1E;box-shadow:0 0 0 3px rgba(255,196,0,.12)}
  .nayadAdminChips{display:flex;gap:7px;overflow:auto;padding:0 0 3px;scrollbar-width:none}.nayadAdminChips::-webkit-scrollbar{display:none}.nayadAdminChip{min-height:38px;padding:0 16px;border:1px solid #DDDED9;border-radius:999px;background:#fff;color:#555B68;font-size:11px;font-weight:750;white-space:nowrap}.nayadAdminChip.active{border-color:#F1B900;background:#FFC400;color:#181300}
  .nayadAdminList{display:flex;flex-direction:column;gap:9px}.nayadAdminCard{padding:14px}.nayadAdminCardHead{width:100%;padding:0;background:transparent;color:inherit;display:flex;align-items:center;gap:12px;text-align:left}.nayadAdminAvatar{border-radius:50%;background:#FFF7D7;color:#171717}.nayadAdminCardMeta{min-width:0;flex:1}.nayadAdminCardMeta b{display:block;font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nayadAdminCardMeta span{display:block;color:#777D8C;font-size:10px;margin-top:3px;line-height:1.35}.nayadAdminCount{color:#707583;font-size:10px;white-space:nowrap}.nayadAdminCardHead.expanded .nayadAdminChevron{transform:rotate(-90deg)}
  .nayadAdminRegistration{position:relative;margin-top:12px;padding:13px;background:#F7F7F4;border-radius:14px}.nayadAdminRegistration+.nayadAdminRegistration{margin-top:7px}.nayadAdminRegistrationLabel{color:#888D98;font-size:9px;font-weight:850;letter-spacing:.25px;margin-bottom:6px}.nayadAdminRegistration b{display:block;padding-right:72px;font-size:13px;font-weight:900}.nayadAdminRegistration span{display:block;color:#737986;font-size:10px;line-height:1.4;margin-top:3px}.nayadAdminPill{display:inline-flex!important;align-items:center;justify-content:center;width:max-content;padding:5px 9px;border-radius:999px;background:#ECEDEA;color:#676B72!important;font-size:9px!important;font-weight:850;line-height:1!important;margin:0!important}.nayadAdminPill.green{background:#E3F7E8;color:#228943!important}.nayadAdminPill.orange{background:#FFF0D8;color:#D97800!important}.nayadAdminPill.yellow{background:#FFF5CB;color:#B47F00!important}.nayadAdminRegistration>.nayadAdminPill{position:absolute;right:12px;top:31px}
  .nayadAdminPackage{display:grid;grid-template-columns:45px minmax(0,1fr) auto;gap:11px;align-items:center}.nayadAdminStoreIcon{width:45px;height:45px;border-radius:14px;background:#F2F3F1;color:#777A78;display:grid;place-items:center}.nayadAdminStoreIcon.plus{background:#FFF7D7;color:#EAAF00}.nayadAdminStoreIcon svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.nayadAdminPackageMain{min-width:0}.nayadAdminPackageMain b{display:block;font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nayadAdminPackageMain span{display:block;color:#747A89;font-size:10px;line-height:1.4;margin-top:3px}.nayadAdminPackageSide{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px}.nayadAdminAmount{font-size:14px;font-weight:950;white-space:nowrap}
  .nayadAdminRevenue{min-height:92px;padding:15px;border:1px solid #E3E3DD;border-radius:17px;background:#fff;display:flex;align-items:center;gap:13px}.nayadAdminRevenue .nayadAdminStatIcon{width:48px;height:48px}.nayadAdminRevenue small{display:block;color:#656A75;font-size:11px}.nayadAdminRevenue b{display:block;font-size:28px;font-weight:950;margin-top:5px}.nayadAdminPayment{display:grid;grid-template-columns:45px minmax(0,1fr) auto;gap:11px;align-items:center}.nayadAdminPaymentSide{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:7px}.nayadAdminDateFilter{position:relative;width:40px;height:38px;flex:0 0 40px;border:1px solid #DDDED9;border-radius:999px;background:#fff;display:grid;place-items:center;overflow:hidden}.nayadAdminDateFilter svg{width:18px;height:18px;fill:none;stroke:#616775;stroke-width:2}.nayadAdminDateFilter input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
  .nayadAdminEmpty,.nayadAdminLoading{padding:34px 18px;border:1px solid #E3E3DD;border-radius:17px;background:#fff;color:#777;text-align:center;font-size:12px;line-height:1.5}.nayadAdminRetry{margin-top:12px;padding:10px 16px;background:#FFC400;color:#171300}
  html.nightMode .nayadAdminShell,html.nightMode .nayadAdminTop{background:#151716;color:#F4F4EF}html.nightMode .nayadAdminTop{border-bottom-color:#313431}html.nightMode .nayadAdminStat,html.nightMode .nayadAdminNav,html.nightMode .nayadAdminCard,html.nightMode .nayadAdminSearch input,html.nightMode .nayadAdminRevenue,html.nightMode .nayadAdminDateFilter{background:#1D201E;color:#F4F4EF;border-color:#343735}html.nightMode .nayadAdminRegistration{background:#242725}html.nightMode .nayadAdminBack,html.nightMode .nayadAdminNavIcon,html.nightMode .nayadAdminStoreIcon{background:#292C2A;color:#D5D7D3}html.nightMode .nayadAdminChip{background:#1D201E;border-color:#343735;color:#D8DAD6}html.nightMode .nayadAdminChip.active{background:#D8A400;color:#151300;border-color:#D8A400}
  @media(max-width:370px){.nayadAdminBody{padding-left:14px;padding-right:14px}.nayadAdminTop{padding-left:14px;padding-right:14px}.nayadAdminTitle{font-size:27px}.nayadAdminSecure span{display:none}.nayadAdminStat{padding:11px}.nayadAdminStatIcon{width:34px;height:34px;flex-basis:34px}.nayadAdminStat b{font-size:22px}}
  </style>`;

  const ICON={
    back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    shield:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.7 2.7 8.1 7 10 4.3-1.9 7-5.3 7-10V6Z"/><path d="m9.5 12 1.7 1.7 3.5-4"/></svg>',
    users:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3 20v-1.3A5.7 5.7 0 0 1 8.7 13h.6a5.7 5.7 0 0 1 5.7 5.7V20M15 14a4.5 4.5 0 0 1 6 4.3V20"/></svg>',
    file:'<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></svg>',
    crown:'<svg viewBox="0 0 24 24"><path d="m4 8 4 4 4-7 4 7 4-4-2 10H6Z"/><path d="M6 21h12"/></svg>',
    clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>',
    check:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16.5 9"/></svg>',
    coins:'<svg viewBox="0 0 24 24"><ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7M4 11v4c0 1.4 2.2 2.5 5 2.5 1.1 0 2.1-.2 3-.5"/><path d="M14 11.5c.7-.3 1.7-.5 2.8-.5 2.3 0 4.2.9 4.2 2s-1.9 2-4.2 2-4.2-.9-4.2-2c0-.6.5-1.1 1.4-1.5Z"/><path d="M12.6 13v4c0 1.1 1.9 2 4.2 2s4.2-.9 4.2-2v-4"/></svg>',
    card:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18"/></svg>',
    store:'<svg viewBox="0 0 24 24"><path d="M4 10v10h16V10M3 10h18l-1.5-6h-15Z"/><path d="M8 10v2a2 2 0 0 0 4 0v-2M12 10v2a2 2 0 0 0 4 0v-2M9 20v-5h6v5"/></svg>',
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>',
    calendar:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    chevron:'<svg class="nayadAdminChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
  };

  const state={data:null,userId:'',view:'home',query:'',filter:'all',paymentDate:'',expanded:new Set(),loading:false,error:''};
  let accessCache={userId:'',allowed:false,checkedAt:0};

  function esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function client(){return window.nayadSupabase||window.sb||null;}
  function currentUserId(){return String(window.__nayadUser?.id||'');}
  function initials(value){return String(value||'N').trim().replace(/[^A-Za-zА-Яа-яӨөҮү]/g,'').slice(0,1).toUpperCase()||'N';}
  function money(value){return new Intl.NumberFormat('mn-MN').format(Math.round(Number(value)||0))+'₮';}
  function dateOnly(value){const raw=String(value||'');return raw?raw.slice(0,10).replaceAll('-','.'):'—';}
  function roleLabel(value){return value==='supplier'?'Нийлүүлэгч':value==='buyer'?'Худалдан авагч':'Чиглэл сонгоогүй';}
  function memberLabel(value){return value==='owner'?'Эзэмшигч':value==='manager'?'Менежер':value==='staff'?'Ажилтан':'Гишүүн';}
  function planLabel(item){return Number(item?.duration_months)===12||item?.plan_code==='year'?'1 жилийн Plus':'1 сарын Plus';}
  function paymentStatus(value){return value==='paid'?['Амжилттай','green']:value==='pending'?['Хүлээгдэж буй','orange']:value==='failed'?['Амжилтгүй','orange']:value==='expired'?['Хугацаа дууссан','']:value==='cancelled'?['Цуцлагдсан','']:['Үүсгэж байна','yellow'];}
  function chevron(){return ICON.chevron;}

  async function request(action){
    const c=client();
    if(!c?.auth?.getSession)throw new Error('Нэвтрэх үйлчилгээ бэлэн биш байна.');
    const {data:{session},error}=await c.auth.getSession();
    if(error||!session?.access_token)throw new Error('Нэвтрэх шаардлагатай.');
    const url=(typeof SUPABASE_URL!=='undefined'?SUPABASE_URL:'')+'/functions/v1/admin-dashboard';
    const key=typeof SUPABASE_PUBLISHABLE_KEY!=='undefined'?SUPABASE_PUBLISHABLE_KEY:'';
    const response=await fetch(url,{
      method:'POST',
      headers:{Authorization:`Bearer ${session.access_token}`,apikey:key,'Content-Type':'application/json'},
      body:JSON.stringify({action})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Админы мэдээлэл ачаалж чадсангүй.');
    return result;
  }

  async function canAccess(force=false){
    const userId=currentUserId();
    if(!userId)return false;
    if(!force&&accessCache.userId===userId&&Date.now()-accessCache.checkedAt<300000)return accessCache.allowed;
    try{
      const result=await request('access');
      const allowed=result?.is_admin===true;
      accessCache={userId,allowed,checkedAt:Date.now()};
      return allowed;
    }catch(error){
      accessCache={userId,allowed:false,checkedAt:Date.now()};
      if(!/Админы эрх/.test(String(error?.message||'')))console.warn('Admin access:',error);
      return false;
    }
  }

  function ensureRoot(){
    if(!document.getElementById('nayad-admin-dashboard-styles'))document.head.insertAdjacentHTML('beforeend',STYLE);
    let root=document.getElementById('nayadAdminRoot');
    if(root)return root;
    root=document.createElement('div');
    root.id='nayadAdminRoot';
    root.className='nayadAdminRoot';
    root.setAttribute('aria-hidden','true');
    root.innerHTML='<main class="nayadAdminShell" role="dialog" aria-modal="true" aria-labelledby="nayadAdminTitle"><div id="nayadAdminContent"></div></main>';
    document.body.appendChild(root);
    return root;
  }

  function header(){
    return `<div class="nayadAdminTop"><button class="nayadAdminBack" type="button" onclick="nayadAdminBack()" aria-label="Буцах">${ICON.back}</button><div class="nayadAdminBrand">NA<span class="y">Y</span>AD</div><div class="nayadAdminSecure">${ICON.shield}<span>Зөвхөн админ</span></div></div>`;
  }
  function heading(title,lead=''){
    return `<div class="nayadAdminEyebrow">АДМИНЫ УДИРДЛАГА</div><h1 class="nayadAdminTitle" id="nayadAdminTitle">${esc(title)}</h1>${lead?`<p class="nayadAdminLead">${esc(lead)}</p>`:''}`;
  }
  function stat(icon,title,value,color=''){
    return `<div class="nayadAdminStat"><span class="nayadAdminStatIcon ${color}">${icon}</span><div><small>${esc(title)}</small><b>${esc(value)}</b></div></div>`;
  }
  function search(placeholder){
    return `<div class="nayadAdminSearch">${ICON.search}<input type="search" value="${esc(state.query)}" placeholder="${esc(placeholder)}" oninput="nayadAdminSearch(this.value)"></div>`;
  }
  function chips(items,withDate=false){
    return `<div class="nayadAdminChips">${items.map(([value,label])=>`<button class="nayadAdminChip ${state.filter===value?'active':''}" type="button" onclick="nayadAdminFilter('${esc(value)}')">${esc(label)}</button>`).join('')}${withDate?`<label class="nayadAdminDateFilter" aria-label="Огноогоор шүүх">${ICON.calendar}<input type="date" value="${esc(state.paymentDate)}" onchange="nayadAdminDate(this.value)"></label>`:''}</div>`;
  }
  function empty(message){return `<div class="nayadAdminEmpty">${esc(message)}</div>`;}

  function navCard(icon,title,detail,view,color=''){
    return `<button class="nayadAdminNav" type="button" onclick="nayadAdminView('${view}')"><span class="nayadAdminNavIcon ${color}">${icon}</span><span class="nayadAdminNavText"><b>${esc(title)}</b><span>${esc(detail)}</span></span>${chevron()}</button>`;
  }
  function renderHome(data){
    const o=data.overview||{};
    return `${heading('Админы удирдлага','NAYAD системийн хэрэглэгч, багц, төлбөрийг эндээс хянана.')}
      <div class="nayadAdminStats">${stat(ICON.users,'Нийт бүртгэл',o.registration_count||0)}${stat(ICON.crown,'Идэвхтэй Plus',o.active_plus_count||0,'yellow')}${stat(ICON.file,'Үнэгүй багц',o.free_count||0)}${stat(ICON.clock,'Хүлээгдэж буй',o.pending_count||0,'orange')}</div>
      <div class="nayadAdminSection">УДИРДЛАГА</div>
      ${navCard(ICON.users,'Хэрэглэгч ба бүртгэл','Бүх бүртгэл, чиглэл, төлөвийг харах','users')}
      ${navCard(ICON.coins,'Багцын удирдлага','Plus, үнэгүй багц, дуусах хугацааг хянах','packages','yellow')}
      ${navCard(ICON.card,'Төлбөрийн түүх','Амжилттай болон хүлээгдэж буй төлбөр','payments')}`;
  }

  function userMatches(user){
    const query=state.query.trim().toLocaleLowerCase('mn');
    const registrations=Array.isArray(user.registrations)?user.registrations:[];
    const searchable=[user.name,user.phone,user.email,...registrations.flatMap(item=>[item.name,item.business_type,item.entity_type])].join(' ').toLocaleLowerCase('mn');
    if(query&&!searchable.includes(query))return false;
    if(state.filter==='supplier'||state.filter==='buyer')return registrations.some(item=>item.operation_role===state.filter);
    if(state.filter==='complete')return registrations.some(item=>item.is_complete);
    if(state.filter==='incomplete')return registrations.length===0||registrations.some(item=>!item.is_complete);
    return true;
  }
  function registrationCard(item){
    const detail=[roleLabel(item.operation_role),item.business_type||item.entity_type].filter(Boolean).join(' · ');
    return `<div class="nayadAdminRegistration"><div class="nayadAdminRegistrationLabel">ҮЙЛ АЖИЛЛАГААНЫ БҮРТГЭЛ</div><b>${esc(item.name||'Нэргүй бүртгэл')}</b><span>${esc(detail)}</span><span>${esc(memberLabel(item.membership_role))}</span><span class="nayadAdminPill ${item.is_complete?'green':'orange'}">${item.is_complete?'Бүрэн':'Бүртгэл дутуу'}</span></div>`;
  }
  function userCard(user){
    const registrations=Array.isArray(user.registrations)?user.registrations:[];
    const expanded=state.expanded.has(String(user.id));
    const count=registrations.length===1?'1 бүртгэл':`${registrations.length} бүртгэл`;
    const incomplete=registrations.length===0||registrations.some(item=>!item.is_complete);
    return `<article class="nayadAdminCard"><button class="nayadAdminCardHead ${expanded?'expanded':''}" type="button" onclick="nayadAdminToggleUser('${esc(user.id)}')"><span class="nayadAdminAvatar">${esc(initials(user.name))}</span><span class="nayadAdminCardMeta"><b>${esc(user.name)}</b><span>${esc(user.phone||user.email||'Холбоо барих мэдээлэлгүй')}</span>${incomplete&&!expanded?'<span class="nayadAdminPill orange" style="margin-top:6px!important">Бүртгэл дутуу</span>':''}</span><span class="nayadAdminCount">${esc(count)}</span>${chevron()}</button>${expanded?(registrations.map(registrationCard).join('')||empty('Үйл ажиллагааны бүртгэл байхгүй.')):''}</article>`;
  }
  function renderUsers(data){
    const o=data.overview||{};
    const users=(Array.isArray(data.users)?data.users:[]).filter(userMatches);
    return `${heading('Хэрэглэгч ба бүртгэл')}<div class="nayadAdminStats">${stat(ICON.users,'Нийт хэрэглэгч',o.user_count||0)}${stat(ICON.file,'Нийт бүртгэл',o.registration_count||0)}</div>${search('Нэр, утасны дугаараар хайх')}${chips([['all','Бүгд'],['supplier','Нийлүүлэгч'],['buyer','Худалдан авагч'],['complete','Бүрэн'],['incomplete','Бүртгэл дутуу']])}<div class="nayadAdminSection">ХЭРЭГЛЭГЧИД</div><div class="nayadAdminList">${users.map(userCard).join('')||empty('Хайлтад тохирох хэрэглэгч олдсонгүй.')}</div>`;
  }

  function packageMatches(item){
    const query=state.query.trim().toLocaleLowerCase('mn');
    const searchable=[item.registration_name,item.owner_name,item.owner_phone].join(' ').toLocaleLowerCase('mn');
    if(query&&!searchable.includes(query))return false;
    if(state.filter==='plus')return item.plan==='plus';
    if(state.filter==='free')return item.plan==='free';
    if(state.filter==='pending')return Number(item.pending_count)>0;
    return true;
  }
  function packageCard(item){
    const plus=item.plan==='plus';
    const meta=plus?`${item.plan_code==='year'?'1 жилийн':'1 сарын'} Plus`:'Үнэгүй багц';
    const dates=plus?`${dateOnly(item.current_period_start)} – ${dateOnly(item.current_period_end)}`:'';
    return `<article class="nayadAdminCard nayadAdminPackage"><span class="nayadAdminStoreIcon ${plus?'plus':''}">${plus?ICON.crown:ICON.store}</span><div class="nayadAdminPackageMain"><b>${esc(item.registration_name)}</b><span>${esc([item.owner_name,item.owner_phone].filter(Boolean).join(' · '))}</span><span>${esc(meta)}</span>${dates?`<span>${esc(dates)}</span>`:''}${!item.registration_complete?'<span class="nayadAdminPill orange" style="margin-top:5px!important">Бүртгэл дутуу</span>':''}</div><div class="nayadAdminPackageSide"><span class="nayadAdminPill ${plus?'green':''}">${plus?'Идэвхтэй':'Үнэгүй багц'}</span>${Number(item.pending_count)>0?`<span class="nayadAdminPill orange">Хүлээгдэж буй ${esc(item.pending_count)}</span>`:''}${plus?`<span class="nayadAdminAmount">${esc(money(item.paid_amount))}</span>`:''}</div></article>`;
  }
  function renderPackages(data){
    const o=data.overview||{};
    const packages=(Array.isArray(data.packages)?data.packages:[]).filter(packageMatches);
    return `${heading('Багцын удирдлага')}<div class="nayadAdminStats">${stat(ICON.users,'Нийт бүртгэл',o.registration_count||0)}${stat(ICON.crown,'Идэвхтэй Plus',o.active_plus_count||0,'yellow')}${stat(ICON.file,'Үнэгүй багц',o.free_count||0)}${stat(ICON.clock,'Хүлээгдэж буй',o.pending_count||0,'orange')}</div>${search('Бүртгэлийн нэр, утсаар хайх')}${chips([['all','Бүгд'],['plus','Plus'],['free','Үнэгүй'],['pending','Хүлээгдэж буй']])}<div class="nayadAdminSection">БҮРТГЭЛҮҮД</div><div class="nayadAdminList">${packages.map(packageCard).join('')||empty('Хайлтад тохирох бүртгэл олдсонгүй.')}</div>`;
  }

  function paymentMatches(item){
    const query=state.query.trim().toLocaleLowerCase('mn');
    const searchable=[item.registration_name,item.payer_name,item.payer_phone].join(' ').toLocaleLowerCase('mn');
    if(query&&!searchable.includes(query))return false;
    if(state.filter==='paid'&&item.status!=='paid')return false;
    if(state.filter==='pending'&&item.status!=='pending')return false;
    if(state.paymentDate&&dateOnly(item.paid_at||item.created_at)!==state.paymentDate.replaceAll('-','.'))return false;
    return true;
  }
  function paymentCard(item){
    const [status,color]=paymentStatus(item.status);
    return `<article class="nayadAdminCard nayadAdminPayment"><span class="nayadAdminStoreIcon">${ICON.store}</span><div class="nayadAdminPackageMain"><b>${esc(item.registration_name)}</b><span>${esc([item.payer_name,item.payer_phone].filter(Boolean).join(' · '))}</span><span>${esc(planLabel(item))} · ${esc(item.method||'QPay')}</span><span>${esc(dateOnly(item.paid_at||item.created_at))}</span></div><div class="nayadAdminPaymentSide"><span class="nayadAdminPill ${color}">${esc(status)}</span><span class="nayadAdminAmount">${esc(money(item.amount))}</span></div></article>`;
  }
  function renderPayments(data){
    const o=data.overview||{};
    const payments=(Array.isArray(data.payments)?data.payments:[]).filter(paymentMatches);
    return `${heading('Төлбөрийн түүх')}<div class="nayadAdminRevenue"><span class="nayadAdminStatIcon yellow">${ICON.coins}</span><div><small>Нийт орлого</small><b>${esc(money(o.total_revenue||0))}</b></div></div><div class="nayadAdminStats">${stat(ICON.check,'Амжилттай',o.paid_count||0,'green')}${stat(ICON.clock,'Хүлээгдэж буй',o.pending_count||0,'orange')}</div>${search('Бүртгэлийн нэр, утсаар хайх')}${chips([['all','Бүгд'],['paid','Амжилттай'],['pending','Хүлээгдэж буй']],true)}<div class="nayadAdminSection">ГҮЙЛГЭЭНҮҮД</div><div class="nayadAdminList">${payments.map(paymentCard).join('')||empty('Хайлтад тохирох гүйлгээ олдсонгүй.')}</div>`;
  }

  function render(){
    const root=ensureRoot(),target=root.querySelector('#nayadAdminContent');
    if(!target)return;
    if(state.loading){target.innerHTML=header()+`<div class="nayadAdminBody">${heading('Админы удирдлага')}<div class="nayadAdminLoading">Мэдээлэл ачаалж байна...</div></div>`;return;}
    if(state.error){target.innerHTML=header()+`<div class="nayadAdminBody">${heading('Админы удирдлага')}<div class="nayadAdminEmpty">${esc(state.error)}<br><button class="nayadAdminRetry" type="button" onclick="showNayadAdmin('${esc(state.view)}')">Дахин оролдох</button></div></div>`;return;}
    if(!state.data)return;
    const content=state.view==='users'?renderUsers(state.data):state.view==='packages'?renderPackages(state.data):state.view==='payments'?renderPayments(state.data):renderHome(state.data);
    target.innerHTML=header()+`<div class="nayadAdminBody">${content}</div>`;
  }

  async function show(view='home'){
    const userId=currentUserId();
    if(!userId)return;
    const root=ensureRoot();
    root.classList.add('open');root.setAttribute('aria-hidden','false');document.body.classList.add('nayadAdminOpen');
    state.view=['home','users','packages','payments'].includes(view)?view:'home';state.query='';state.filter='all';state.paymentDate='';state.error='';state.loading=true;render();
    try{
      const data=await request('dashboard');
      if(currentUserId()!==userId){close(false);return;}
      state.data=data;state.userId=userId;state.expanded=new Set([userId]);accessCache={userId,allowed:true,checkedAt:Date.now()};
    }catch(error){
      state.data=null;state.error=error?.message||'Админы мэдээлэл ачаалж чадсангүй.';
    }finally{state.loading=false;render();}
  }
  function close(returnToProfile=false){
    const root=document.getElementById('nayadAdminRoot');
    root?.classList.remove('open');root?.setAttribute('aria-hidden','true');document.body.classList.remove('nayadAdminOpen');
    if(returnToProfile&&typeof window.showProfileDetails==='function')setTimeout(()=>window.showProfileDetails(),0);
  }
  function back(){if(state.view!=='home'){state.view='home';state.query='';state.filter='all';state.paymentDate='';render();return;}close(true);}
  function setView(view){state.view=view;state.query='';state.filter='all';state.paymentDate='';render();document.querySelector('.nayadAdminShell')?.scrollTo?.({top:0,behavior:'smooth'});}

  const originalProfile=window.showProfileDetails;
  if(typeof originalProfile==='function'){
    window.showProfileDetails=async function(){
      const userId=currentUserId();
      await originalProfile.apply(this,arguments);
      if(!userId||userId!==currentUserId()||!await canAccess())return;
      if(userId!==currentUserId()||document.getElementById('modal')?.classList.contains('hide'))return;
      const target=document.getElementById('sheet');
      if(!target||target.querySelector('.nayadAdminProfileEntry'))return;
      const button=document.createElement('button');
      button.type='button';button.className='secondary full nayadAdminProfileEntry';
      button.style.marginTop='13px';
      button.innerHTML=`${ICON.shield}<span><b>Админы удирдлага</b><small>Зөвхөн системийн админ</small></span>${chevron()}`;
      button.addEventListener('click',()=>{window.closeSheet?.();show('home');});
      const destructive=[...target.querySelectorAll('button')].find(item=>String(item.getAttribute('onclick')||'').includes('showDeleteRegistrationConfirm'));
      if(destructive)target.insertBefore(button,destructive);else target.appendChild(button);
    };
  }

  document.head.insertAdjacentHTML('beforeend',`<style>.nayadAdminProfileEntry{display:flex;align-items:center;gap:11px;text-align:left;padding:12px 14px!important}.nayadAdminProfileEntry>svg:first-child{width:24px;height:24px;fill:none;stroke:#D49E00;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.nayadAdminProfileEntry>span{flex:1}.nayadAdminProfileEntry b{display:block;font-size:13px}.nayadAdminProfileEntry small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.nayadAdminProfileEntry .nayadAdminChevron{width:17px;height:17px}</style>`);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('nayadAdminRoot')?.classList.contains('open')){event.preventDefault();back();}});

  window.__nayadCanAccessAdmin=canAccess;
  window.showNayadAdmin=show;
  window.closeNayadAdmin=close;
  window.nayadAdminBack=back;
  window.nayadAdminView=setView;
  window.nayadAdminSearch=value=>{
    state.query=String(value||'');render();
    requestAnimationFrame(()=>{
      const input=document.querySelector('.nayadAdminSearch input');
      if(!input)return;
      input.focus();
      const end=input.value.length;
      input.setSelectionRange?.(end,end);
    });
  };
  window.nayadAdminFilter=value=>{state.filter=String(value||'all');render();};
  window.nayadAdminDate=value=>{state.paymentDate=String(value||'');render();};
  window.nayadAdminToggleUser=userId=>{const key=String(userId||'');if(state.expanded.has(key))state.expanded.delete(key);else state.expanded.add(key);render();};
})();
