/* NAYAD store sharing: owner invites family/team members by email. */
(function(){
  const STYLE = `<style>
  .storeShareBtn{width:100%;margin:0 0 10px;display:flex;align-items:center;justify-content:center;gap:7px}
  .shareMember{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line)}
  .shareMember:last-child{border-bottom:0}
  .shareAvatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#F1F1ED;font-weight:850;overflow:hidden;flex:0 0 auto}
  .shareAvatar img{width:100%;height:100%;object-fit:cover}
  .shareMeta{min-width:0;flex:1}.shareMeta b{display:block;font-size:13px}.shareMeta span{display:block;color:var(--muted);font-size:10px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .shareRole{font-size:10px;font-weight:800;background:#FFF4CC;padding:5px 8px;border-radius:8px}
  .shareLinkBox{padding:10px;background:#F7F7F4;border:1px solid var(--line);border-radius:12px;font-size:10px;word-break:break-all;color:#555;margin-top:8px}
  </style>`;
  let currentStore=null;

  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function initials(s){return String(s||'N').trim().slice(0,1).toUpperCase()}
  function sb(){return window.nayadSupabase}

  async function getStore(){
    const client=sb(); if(!client)return null;
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
    const rows=members.map(m=>`<div class="shareMember"><div class="shareAvatar">${esc(initials(m.full_name||m.email))}</div><div class="shareMeta"><b>${esc(m.full_name||'Нэр тодорхойгүй')}</b><span>${esc(m.email||'')}</span></div><span class="shareRole">${m.role==='owner'?'Эзэмшигч':'Гишүүн'}</span></div>`).join('');
    sheetSafe(`<h2>Дэлгүүр хуваалцах</h2><div class="card"><b>${esc(store.name)}</b><div class="sub">Гэр бүл эсвэл ажилтнуудаа нэмээд нэг дэлгүүрийн падаан, төлбөрийг хамт удирдана.</div></div><div class="sectionTitle">Гишүүд · ${members.length}</div><div class="card">${rows||'<div class="sub">Гишүүн алга.</div>'}</div><div class="sectionTitle">Хүн нэмэх</div><div class="field"><label>И-мэйл</label><input id="shareInviteEmail" type="email" placeholder="name@gmail.com"></div><button class="primary full" onclick="createStoreInvite()">＋ Гишүүн урих</button><button class="secondary full" style="margin-top:9px" onclick="closeSheet()">Хаах</button>`);
  }

  async function createStoreInvite(){
    const email=(document.getElementById('shareInviteEmail')?.value||'').trim().toLowerCase();
    if(!email)return toastSafe('И-мэйл хаяг оруулна уу.');
    const store=currentStore||await getStore(); if(!store)return toastSafe('Дэлгүүр олдсонгүй.');
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
    const token=new URLSearchParams(location.search).get('invite'); if(!token)return;
    const client=sb(); if(!client)return;
    const {data:{session}}=await client.auth.getSession();
    if(!session){sessionStorage.setItem('NAYAD_PENDING_INVITE',token);return}
    try{
      const {error}=await client.rpc('accept_store_invite',{p_token:token});
      if(error)throw error;
      const u=new URL(location.href);u.searchParams.delete('invite');history.replaceState({},document.title,u.pathname+(u.search?u.search:'')+u.hash);
      toastSafe('Дэлгүүрт амжилттай нэгдлээ.');
    }catch(e){console.error('Accept invite:',e);toastSafe(e?.message||'Урилгыг хүлээж авахад алдаа гарлаа.');}
  }

  function toastSafe(t){if(typeof toast==='function')toast(t);else alert(t)}
  function sheetSafe(s){if(typeof sheet==='function')sheet(s);else console.warn('NAYAD sheet not ready')}

  function addShareButton(){
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
