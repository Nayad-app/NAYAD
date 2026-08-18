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
  .shareEmpty{padding:22px 14px;text-align:center;color:var(--muted);font-size:12px}
  .shareInviteField{position:relative;margin-bottom:10px}.shareInviteField svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:20px;height:20px;fill:none;stroke:#777873;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
  .shareInviteField input{width:100%;height:50px;padding:0 14px 0 45px;border:1px solid var(--line);border-radius:14px;background:#fff;font-size:13px;outline:none}.shareInviteField input:focus{border-color:#D4D4CC;box-shadow:0 0 0 3px rgba(255,193,7,.14)}
  .shareInviteButton{min-height:48px;display:flex;align-items:center;justify-content:center;gap:8px}.shareInviteButton svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .shareDismiss{margin-top:9px;min-height:45px}
  .shareLinkBox{padding:10px;background:#F7F7F4;border:1px solid var(--line);border-radius:12px;font-size:10px;word-break:break-all;color:#555;margin-top:8px}
  @media(max-width:370px){.shareHeader h2{font-size:21px}.shareStoreCard{padding:12px}.shareMember{padding:12px 11px}.shareRole{padding:5px 7px}}
  </style>`;
  if(!document.getElementById('nayad-share-styles'))document.head.insertAdjacentHTML('beforeend',STYLE);
  let currentStore=null;

  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function initials(s){return String(s||'N').trim().slice(0,1).toUpperCase()}
  function sb(){return window.nayadSupabase}

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
    const {data,error}=await sb().rpc('get_store_members',{p_store_id:storeId});
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
    const owner=members.find(m=>m.user_id===session.user.id);
    if(!owner||owner.role!=='owner'){
      sheetSafe(`<h2>Дэлгүүр</h2><div class="card"><b>${esc(store.name)}</b><div class="sub">Та энэ дэлгүүрийн гишүүнээр нэвтэрсэн байна.</div></div><button class="secondary full" onclick="closeSheet()">Хаах</button>`);return;
    }
    const rows=members.map(m=>`<div class="shareMember"><div class="shareAvatar">${m.avatar_url?`<img src="${esc(m.avatar_url)}" alt="">`:esc(initials(m.full_name||m.email))}</div><div class="shareMeta"><b>${esc(m.full_name||'Нэр тодорхойгүй')}</b><span>${esc(m.email||'')}</span></div><span class="shareRole">${m.role==='owner'?'Эзэмшигч':'Гишүүн'}</span></div>`).join('');
    sheetSafe(`<div class="shareSheet"><div class="shareHeader"><h2>Дэлгүүр хуваалцах</h2><button class="shareCloseIcon" type="button" onclick="closeSheet()" aria-label="Хаах"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="shareStoreCard"><div class="shareStoreIcon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10h18l-1.5-6h-15Z"/><path d="M8 10v2a2 2 0 0 0 4 0v-2M12 10v2a2 2 0 0 0 4 0v-2M9 20v-5h6v5"/></svg></div><div class="shareStoreMeta"><b>${esc(store.name)}</b><span>Гэр бүл, ажилтнуудтайгаа нэг дэлгүүрийн мэдээллийг хамт удирдана.</span></div></div><div class="shareSectionTitle">Гишүүд · ${members.length}</div><div class="shareMembers">${rows||'<div class="shareEmpty">Гишүүн алга.</div>'}</div><div class="shareSectionTitle">Шинэ гишүүн урих</div><div class="shareInviteField"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg><input id="shareInviteEmail" type="email" inputmode="email" autocomplete="email" placeholder="И-мэйл хаяг"></div><button class="primary full shareInviteButton" type="button" onclick="createStoreInvite()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19M18 8v6M15 11h6"/></svg>Урилга илгээх</button><button class="secondary full shareDismiss" type="button" onclick="closeSheet()">Хаах</button></div>`);
  }

  async function createStoreInvite(){
    const email=(document.getElementById('shareInviteEmail')?.value||'').trim().toLowerCase();
    if(!email)return toastSafe('И-мэйл хаяг оруулна уу.');
    const store=await getStore(); if(!store)return toastSafe('Дэлгүүр олдсонгүй.');
    try{
      const {data,error}=await sb().rpc('create_store_invite',{p_store_id:store.id,p_email:email});
      if(error)throw error;
      const token=data?.token;
      if(!token)throw new Error('Урих холбоос үүссэнгүй.');
      const link=location.origin+location.pathname+'?invite='+encodeURIComponent(token);
      if(navigator.share){try{await navigator.share({title:'NAYAD дэлгүүрийн урилга',text:`${store.name} дэлгүүрт нэгдээрэй.`,url:link})}catch(_){}}
      sheetSafe(`<h2>Урилга бэлэн боллоо</h2><div class="authSuccess">${esc(email)} хаягт зориулсан урилга үүслээ.</div><div class="shareLinkBox">${esc(link)}</div><div class="actions"><button class="secondary" onclick="copyStoreInvite('${encodeURIComponent(link)}')">Холбоос хуулах</button><button class="primary" onclick="closeSheet()">Дуусгах</button></div><div class="sub" style="margin-top:10px">Уригдсан хүн энэ холбоосоор орж, ижил и-мэйлээр NAYAD-д нэвтрээд зөвшөөрнө.</div>`);
    }catch(e){console.error('Store invite:',e);toastSafe(e?.message||'Урилга үүсгэхэд алдаа гарлаа.');}
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

  function addShareButton(){
    if(typeof page!=='undefined'&&page==='home')return;
    if(document.querySelector('.storeShareBtn'))return;
    const content=document.getElementById('content'); if(!content||document.getElementById('app')?.classList.contains('hide'))return;
    const b=document.createElement('button');b.className='secondary storeShareBtn';b.innerHTML='👥 Дэлгүүрээ хуваалцах';b.onclick=showShare;
    content.insertBefore(b,content.firstChild);
  }

  window.showStoreShare=showShare;
  window.createStoreInvite=createStoreInvite;
  window.copyStoreInvite=copyStoreInvite;

  const observer=new MutationObserver(()=>addShareButton());
  window.addEventListener('load',()=>{
    observer.observe(document.body,{childList:true,subtree:true});
    setTimeout(addShareButton,900);
    setTimeout(acceptInviteFromUrl,1200);
  });
  if(window.nayadSupabase){window.nayadSupabase.auth.onAuthStateChange(()=>setTimeout(acceptInviteFromUrl,500))}
})();
