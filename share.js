/* NAYAD store sharing: owner invites family/team members by email. */
(function(){
  const STYLE = `<style id="nayad-share-styles">
  .storeShareBtn{width:100%;margin:0 0 10px;display:flex;align-items:center;justify-content:center;gap:7px}
  .shareSheet{padding-bottom:2px}
  .shareHeader{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
  .shareHeader h2{margin:0;font-size:24px;letter-spacing:-.65px}
  .shareCloseIcon{width:40px;height:40px;flex:0 0 40px;border:0;border-radius:50%;padding:0;background:#F5F5F1;color:#222;display:grid;place-items:center}
  .shareCloseIcon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round}
  .shareStoreCard{display:flex;align-items:center;gap:13px;padding:14px;background:#fff;border:1px solid var(--line);border-radius:17px;box-shadow:var(--shadow-sm)}
  .shareStoreIcon{width:50px;height:50px;flex:0 0 50px;border-radius:15px;background:var(--yellow-soft);display:grid;place-items:center;color:#161616}
  .shareStoreIcon svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .shareStoreMeta{min-width:0}.shareStoreMeta b{display:block;font-size:15px;font-weight:900;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .shareStoreMeta span{display:block;color:var(--muted);font-size:11px;line-height:1.42;margin-top:5px}
  .shareSectionTitle{font-size:12px;font-weight:900;letter-spacing:.15px;text-transform:uppercase;margin:20px 2px 9px}
  .shareMembers{overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:17px;box-shadow:var(--shadow-sm)}
  .shareMember{display:flex;align-items:center;gap:11px;padding:13px;border-bottom:1px solid var(--line)}
  .shareMember:last-child{border-bottom:0}
  .shareAvatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--yellow-soft);font-size:16px;font-weight:900;overflow:hidden;flex:0 0 auto}
  .shareAvatar img{width:100%;height:100%;object-fit:cover}
  .shareMeta{min-width:0;flex:1}.shareMeta b{display:block;font-size:13px;font-weight:900;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.shareMeta span{display:block;color:var(--muted);font-size:11px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .shareRole{flex:0 0 auto;font-size:10px;font-weight:850;color:#A76D00;background:#FFF5D6;border:1px solid #F6D881;padding:6px 9px;border-radius:999px}
  .shareMemberActions{display:flex;gap:6px;flex:0 0 auto}.shareMemberActions button{padding:7px 8px;border-radius:9px;font-size:9px}.shareMemberEdit{background:#FFF5D6;color:#755800}.shareMemberRemove{background:#FFF0F0;color:#B83232}
  .shareEmpty{padding:22px 14px;text-align:center;color:var(--muted);font-size:12px}
  .shareInviteField{position:relative;margin-bottom:10px}.shareInviteField svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:20px;height:20px;fill:none;stroke:#777873;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
  .shareInviteField input{width:100%;height:50px;padding:0 14px 0 45px;border:1px solid var(--line);border-radius:14px;background:#fff;font-size:13px;outline:none}.shareInviteField input:focus{border-color:#D4D4CC;box-shadow:0 0 0 3px rgba(255,193,7,.14)}
  .shareInviteButton{min-height:48px;display:flex;align-items:center;justify-content:center;gap:8px}.shareInviteButton svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .shareDismiss{margin-top:9px;min-height:45px}
  .shareLinkBox{padding:10px;background:#F7F7F4;border:1px solid var(--line);border-radius:12px;font-size:10px;word-break:break-all;color:#555;margin-top:8px}
  .sharePermissionBox{border:1px solid var(--line);border-radius:17px;overflow:hidden;background:#fff;margin:10px 0}.sharePermissionRow{display:grid;grid-template-columns:minmax(92px,1fr) minmax(128px,1.25fr);gap:10px;align-items:center;padding:11px 12px;border-bottom:1px solid var(--line)}.sharePermissionRow:last-child{border-bottom:0}.sharePermissionRow b{font-size:12px}.sharePermissionRow select{width:100%;padding:10px 9px;border:1px solid var(--line);border-radius:11px;background:#fff;font-size:11px}.sharePermissionHint{font-size:10px;color:var(--muted);line-height:1.45;margin:8px 2px 12px}.shareDanger{background:#FFF0F0!important;color:#B83232!important;border:1px solid #F4CCCC!important}
  @media(max-width:370px){.shareHeader h2{font-size:21px}.shareStoreCard{padding:12px}.shareMember{padding:12px 11px}.shareRole{padding:5px 7px}}
  </style>`;
  if(!document.getElementById('nayad-share-styles'))document.head.insertAdjacentHTML('beforeend',STYLE);
  let currentStore=null;
  let currentMembers=[];
  let inviteBusy=false;

  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function initials(s){return String(s||'N').trim().slice(0,1).toUpperCase()}
  function sb(){return window.nayadSupabase}
  const MODULES=[
    {key:'customers',label:'Харилцагч'},
    {key:'invoices',label:'Падаан'},
    {key:'payments',label:'Төлөлт'},
    {key:'loans',label:'Зээл'}
  ];
  const DEFAULT_PERMISSIONS={customers:'view',invoices:'view',payments:'view',loans:'none'};
  function normalizePermissions(value){
    if(typeof window.__nayadNormalizePermissions==='function')return window.__nayadNormalizePermissions(value);
    const source=value&&typeof value==='object'?value:{};const result={};
    MODULES.forEach(({key})=>{result[key]=['none','view','edit'].includes(source[key])?source[key]:'none';});
    if(result.payments==='edit'&&result.invoices==='none')result.invoices='view';
    if(result.customers==='none'&&(result.invoices!=='none'||result.payments!=='none'))result.customers='view';
    return result;
  }
  function levelOptions(selected){return [['none','Харахгүй'],['view','Зөвхөн харах'],['edit','Нэмэх, засах']].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');}
  function permissionControls(prefix,permissions){const value=normalizePermissions(permissions);return `<div class="sharePermissionBox">${MODULES.map(({key,label})=>`<label class="sharePermissionRow"><b>${label}</b><select id="${prefix}${key}" onchange="syncStorePermissionControls('${prefix}')">${levelOptions(value[key])}</select></label>`).join('')}</div><div class="sharePermissionHint">Падаан эсвэл төлөлт харах эрх өгвөл харилцагчийн нэр мөн харагдана. Төлөлт засахад падааны харах эрх автоматаар нэмэгдэнэ. Мэдээлэл бүр мөсөн устгах эрх зөвхөн дэлгүүрийн эзэнд байна.</div>`;}
  function readPermissions(prefix){const value={};MODULES.forEach(({key})=>{value[key]=document.getElementById(prefix+key)?.value||'none';});return normalizePermissions(value);}
  function syncPermissionControls(prefix){const value=readPermissions(prefix);MODULES.forEach(({key})=>{const select=document.getElementById(prefix+key);if(select)select.value=value[key];});}
  function permissionSummary(value){const permissions=normalizePermissions(value);return MODULES.filter(({key})=>permissions[key]!=='none').map(({key,label})=>`${label}: ${permissions[key]==='edit'?'засах':'харах'}`).join(' · ')||'Эрх өгөөгүй';}

  async function getStore(){
    const client=sb(); if(!client)return null;
    if(typeof window.__nayadGetActiveStore==='function'){
      const activeStore=await window.__nayadGetActiveStore();
      if(activeStore?.id){currentStore=activeStore;return activeStore;}
    }
    const {data,error}=await client.rpc('get_my_store');
    if(error){console.warn('NAYAD store:',error.message);return null}
    currentStore=data?.[0]||null; return currentStore;
  }

  async function getMembers(storeId){
    let {data,error}=await sb().rpc('get_store_members_with_permissions',{p_store_id:storeId});
    if(error&&(/PGRST202|42883|Could not find the function/i.test(String(error.code||'')+' '+String(error.message||'')))){
      ({data,error}=await sb().rpc('get_store_members',{p_store_id:storeId}));
      data=(data||[]).map(member=>({...member,permissions:member.role==='owner'||member.role==='manager'?{customers:'edit',invoices:'edit',payments:'edit',loans:'edit'}:{customers:'edit',invoices:'edit',payments:'edit',loans:'none'}}));
    }
    if(error)throw error; return data||[];
  }

  async function showShare(){
    const client=sb();
    if(!client)return toastSafe('Supabase холболт алга.');
    const {data:{session}}=await client.auth.getSession();
    if(!session)return toastSafe('Эхлээд нэвтэрнэ үү.');
    const store=await getStore();
    if(!store)return toastSafe('Таны дэлгүүр олдсонгүй.');
    let members=[];
    try{members=await getMembers(store.id)}catch(e){console.warn(e)}
    currentMembers=members;
    const owner=members.find(m=>m.user_id===session.user.id);
    if(!owner||owner.role!=='owner'){
      sheetSafe(`<h2>Дэлгүүр</h2><div class="card"><b>${esc(store.name)}</b><div class="sub">Та энэ дэлгүүрийн гишүүнээр нэвтэрсэн байна.</div></div><button class="secondary full" onclick="closeSheet()">Хаах</button>`);return;
    }
    const rows=members.map(m=>`<div class="shareMember"><div class="shareAvatar">${m.avatar_url?`<img src="${esc(m.avatar_url)}" alt="">`:esc(initials(m.full_name||m.email))}</div><div class="shareMeta"><b>${esc(m.full_name||'Нэр тодорхойгүй')}</b><span>${esc(m.email||'')}</span>${m.role==='owner'?'':`<span>${esc(permissionSummary(m.permissions))}</span>`}</div>${m.role==='owner'?'<span class="shareRole">Эзэмшигч</span>':`<div class="shareMemberActions"><button class="shareMemberEdit" type="button" onclick="showStoreMemberPermissions('${esc(m.user_id)}')">Эрх засах</button><button class="shareMemberRemove" type="button" onclick="confirmRemoveStoreMember('${esc(m.user_id)}')">Хасах</button></div>`}</div>`).join('');
    sheetSafe(`<div class="shareSheet"><div class="shareHeader"><h2>Дэлгүүр хуваалцах</h2><button class="shareCloseIcon" type="button" onclick="closeSheet()" aria-label="Хаах"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="shareStoreCard"><div class="shareStoreIcon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10h18l-1.5-6h-15Z"/><path d="M8 10v2a2 2 0 0 0 4 0v-2M12 10v2a2 2 0 0 0 4 0v-2M9 20v-5h6v5"/></svg></div><div class="shareStoreMeta"><b>${esc(store.name)}</b><span>Гишүүн бүрийн харах, засах хэсгийг тусад нь сонгоно.</span></div></div><div class="shareSectionTitle">Гишүүд · ${members.length}</div><div class="shareMembers">${rows||'<div class="shareEmpty">Гишүүн алга.</div>'}</div><div class="shareSectionTitle">Шинэ гишүүн урих</div><div class="shareInviteField"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg><input id="shareInviteEmail" type="email" inputmode="email" autocomplete="email" placeholder="И-мэйл хаяг"></div>${permissionControls('shareInvitePerm',DEFAULT_PERMISSIONS)}<button id="shareInviteButton" class="primary full shareInviteButton" type="button" onclick="createStoreInvite()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19M18 8v6M15 11h6"/></svg><span>Урилга илгээх</span></button><button class="secondary full shareDismiss" type="button" onclick="closeSheet()">Хаах</button></div>`);
  }

  async function createStoreInvite(){
    const email=(document.getElementById('shareInviteEmail')?.value||'').trim().toLowerCase();
    if(!email)return toastSafe('И-мэйл хаяг оруулна уу.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return toastSafe('И-мэйл хаягаа шалгана уу.');
    const permissions=readPermissions('shareInvitePerm');
    if(!Object.values(permissions).some(level=>level==='view'||level==='edit'))return toastSafe('Дор хаяж нэг хэсгийн эрх сонгоно уу.');
    if(inviteBusy)return;
    const store=await getStore(); if(!store)return toastSafe('Дэлгүүр олдсонгүй.');
    const button=document.getElementById('shareInviteButton');
    inviteBusy=true;
    if(button){button.disabled=true;button.querySelector('span')?.replaceChildren('Илгээж байна...');}
    try{
      if(typeof sb()?.functions?.invoke!=='function')throw new Error('Урилгын и-мэйл үйлчилгээ холбогдоогүй байна.');
      const {data,error}=await sb().functions.invoke('send-store-invite',{body:{store_id:store.id,email,permissions}});
      if(error)throw error;
      const link=String(data?.link||'');
      if(!link)throw new Error('Урих холбоос үүссэнгүй.');
      const encoded=encodeURIComponent(link);
      if(data?.sent===true){
        sheetSafe(`<h2>Урилга илгээгдлээ</h2><div class="authSuccess">${esc(email)} хаяг руу урилгын и-мэйл амжилттай илгээлээ.</div><div class="shareLinkBox">${esc(link)}</div><div class="actions"><button class="secondary" onclick="copyStoreInvite('${encoded}')">Холбоос хуулах</button><button class="primary" onclick="closeSheet()">Дуусгах</button></div><div class="sub" style="margin-top:10px">Уригдсан хүн и-мэйл дэх холбоосоор орж, ижил и-мэйлээр NAYAD-д нэвтрээд зөвшөөрнө.</div>`);
      }else{
        sheetSafe(`<h2>И-мэйл илгээгдсэнгүй</h2><div class="authError">Урилга үүссэн боловч ${esc(email)} хаяг руу и-мэйл хүргэж чадсангүй. Доорх холбоосыг хуулж илгээнэ үү.</div><div class="shareLinkBox">${esc(link)}</div><div class="actions"><button class="primary" onclick="copyStoreInvite('${encoded}')">Холбоос хуулах</button><button class="secondary" onclick="closeSheet()">Хаах</button></div>`);
      }
    }catch(e){console.error('Store invite:',e);toastSafe(e?.message||'Урилга илгээхэд алдаа гарлаа.');}
    finally{
      inviteBusy=false;
      if(button&&button.isConnected){button.disabled=false;button.querySelector('span')?.replaceChildren('Урилга илгээх');}
    }
  }

  function showMemberPermissions(userId){
    const member=currentMembers.find(item=>String(item.user_id)===String(userId));
    if(!member||member.role==='owner')return toastSafe('Гишүүн олдсонгүй.');
    sheetSafe(`<div class="shareHeader"><h2>Гишүүний эрх</h2><button class="shareCloseIcon" type="button" onclick="showStoreShare()" aria-label="Буцах"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="card"><b>${esc(member.full_name||member.email||'Гишүүн')}</b><div class="sub">${esc(member.email||'')}</div></div>${permissionControls('shareMemberPerm',member.permissions)}<div class="actions"><button class="secondary" type="button" onclick="showStoreShare()">Болих</button><button id="saveMemberPermissionButton" class="primary" type="button" onclick="saveStoreMemberPermissions('${esc(member.user_id)}')">Хадгалах</button></div>`);
  }

  async function saveMemberPermissions(userId){
    if(!currentStore?.id)return toastSafe('Дэлгүүр олдсонгүй.');
    const permissions=readPermissions('shareMemberPerm');
    if(!Object.values(permissions).some(level=>level==='view'||level==='edit'))return toastSafe('Дор хаяж нэг хэсгийн эрх сонгоно уу.');
    const button=document.getElementById('saveMemberPermissionButton');if(button){button.disabled=true;button.textContent='Хадгалж байна...';}
    try{
      const {error}=await sb().rpc('update_store_member_permissions',{p_store_id:currentStore.id,p_user_id:userId,p_permissions:permissions});
      if(error)throw error;toastSafe('Гишүүний эрх шинэчлэгдлээ.');await showShare();
    }catch(e){console.error('Member permission update:',e);toastSafe(e?.message||'Эрх хадгалахад алдаа гарлаа.');if(button){button.disabled=false;button.textContent='Хадгалах';}}
  }

  function confirmRemoveMember(userId){
    const member=currentMembers.find(item=>String(item.user_id)===String(userId));
    if(!member||member.role==='owner')return toastSafe('Гишүүн олдсонгүй.');
    sheetSafe(`<h2>Гишүүн хасах</h2><div class="authError"><b>${esc(member.full_name||member.email||'Энэ гишүүн')}</b>-ийг ${esc(currentStore?.name||'дэлгүүр')}-ээс хасах уу? Хасагдсаны дараа дэлгүүрийн мэдээлэлд дахин нэвтрэх боломжгүй.</div><div class="actions"><button class="secondary" type="button" onclick="showStoreShare()">Болих</button><button id="removeStoreMemberButton" class="shareDanger" type="button" onclick="removeStoreMember('${esc(member.user_id)}')">Хасах</button></div>`);
  }

  async function removeMember(userId){
    if(!currentStore?.id)return toastSafe('Дэлгүүр олдсонгүй.');
    const button=document.getElementById('removeStoreMemberButton');if(button){button.disabled=true;button.textContent='Хасаж байна...';}
    try{
      const {error}=await sb().rpc('remove_store_member',{p_store_id:currentStore.id,p_user_id:userId});
      if(error)throw error;toastSafe('Гишүүнийг дэлгүүрээс хаслаа.');await showShare();
    }catch(e){console.error('Member removal:',e);toastSafe(e?.message||'Гишүүн хасахад алдаа гарлаа.');if(button){button.disabled=false;button.textContent='Хасах';}}
  }

  async function copyStoreInvite(encoded){
    const link=decodeURIComponent(encoded);try{await navigator.clipboard.writeText(link);toastSafe('Урилгын холбоос хууллаа.')}catch(_){toastSafe(link)}
  }

  async function acceptInviteFromUrl(){
    const token=new URLSearchParams(location.search).get('invite')||sessionStorage.getItem('NAYAD_PENDING_INVITE'); if(!token)return;
    const client=sb(); if(!client)return;
    const {data:{session}}=await client.auth.getSession();
    if(!session){sessionStorage.setItem('NAYAD_PENDING_INVITE',token);return}
    try{
      const {data,error}=await client.rpc('accept_store_invite',{p_token:token});
      if(error)throw error;
      sessionStorage.removeItem('NAYAD_PENDING_INVITE');
      const u=new URL(location.href);u.searchParams.delete('invite');history.replaceState({},document.title,u.pathname+(u.search?u.search:'')+u.hash);
      const membership=Array.isArray(data)?data[0]:data;
      if(typeof window.__nayadRefreshStores==='function')await window.__nayadRefreshStores({selectStoreId:membership?.store_id,sync:true,close:false});
      toastSafe('Дэлгүүрт амжилттай нэгдлээ. Дэлгүүр сонгох хэсгээс хооронд нь шилжинэ.');
    }catch(e){console.error('Accept invite:',e);toastSafe(e?.message||'Урилгыг хүлээж авахад алдаа гарлаа.');}
  }

  function toastSafe(t){if(typeof toast==='function')toast(t);else alert(t)}
  function sheetSafe(s){if(typeof sheet==='function')sheet(s);else console.warn('NAYAD sheet not ready')}

  window.showStoreShare=showShare;
  window.createStoreInvite=createStoreInvite;
  window.copyStoreInvite=copyStoreInvite;
  window.showStoreMemberPermissions=showMemberPermissions;
  window.saveStoreMemberPermissions=saveMemberPermissions;
  window.confirmRemoveStoreMember=confirmRemoveMember;
  window.removeStoreMember=removeMember;
  window.syncStorePermissionControls=syncPermissionControls;

  window.addEventListener('load',()=>{
    setTimeout(acceptInviteFromUrl,1200);
  });
  if(window.nayadSupabase){window.nayadSupabase.auth.onAuthStateChange(()=>setTimeout(acceptInviteFromUrl,500))}
})();
