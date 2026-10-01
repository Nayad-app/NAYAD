/* Private profile/store photos. Drafts never write until the settings Save action. */
(function(){
  'use strict';
  const BUCKET='identity-photos',TTL=3600,MAX=2097152;
  const icons={
    profile:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>',
    store:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10h18l-1.5-6h-15ZM9 20v-5h6v5"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>',
    camera:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5 6 8H3v12h18V8h-3l-2-3Z"/><circle cx="12" cy="13" r="4"/></svg>'
  };
  const css=`<style>.identityPhotoEditor{position:relative;width:84px;height:84px;margin:16px auto 20px}.identityPhotoPick{display:grid;place-items:center;width:84px;height:84px;padding:0;border-radius:50%;border:1px solid var(--line);background:var(--surface-2);color:var(--muted);overflow:visible}.identityPhotoPick img{width:100%;height:100%;object-fit:cover;border-radius:50%}.identityPhotoPick>svg{width:38px;height:38px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.identityPhotoCamera{position:absolute;bottom:-1px;right:-1px;width:27px;height:27px;border:2px solid var(--surface,#fff);border-radius:50%;background:var(--yellow);color:#222;display:grid;place-items:center}.identityPhotoCamera svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8}.identityPhotoRemove{position:absolute;top:-3px;right:-3px;width:28px;height:28px;padding:0;border:2px solid var(--surface,#fff);border-radius:50%;background:var(--surface-2);color:var(--text);font-size:22px;line-height:1;display:grid;place-items:center}.identityPhotoDisplay{display:inline-grid;place-items:center;overflow:hidden;border-radius:50%;flex-shrink:0}.identityPhotoDisplay [hidden],.identityPhotoPick [hidden]{display:none!important}.identityPhotoPick>span:not(.identityPhotoCamera) svg{width:38px;height:38px;fill:none;stroke:currentColor;stroke-width:1.7}.identityPhotoDisplay img{width:100%;height:100%;object-fit:cover}.identityPhotoDisplay svg{width:65%;height:65%;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.profileMenuAvatar svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:1.7}.storePickerAvatar{border-radius:50%}.homeActiveStore .identityPhotoDisplay{width:20px;height:20px}.homeActiveStore .identityPhotoDisplay svg{width:14px;height:14px}</style>`;
  let drafts=null,owner='',cache=new Map(),pending=new Map();
  function client(){return window.nayadSupabase||window.sb;}
  function uid(){return window.__nayadUser?.id||'';}
  function esc(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function safe(url){return /^(https:\/\/|blob:|data:image\/)/i.test(url||'')?url:'';}
  function resetIdentity(){if(owner===uid())return;owner=uid();cache.clear();pending.clear();dispose();}
  function pathFor(kind,id,path){return typeof path==='string'&&path.startsWith(`${kind==='profile'?'profiles':'stores'}/${id}/`)&&!path.includes('..')?path:null;}
  function url(path){resetIdentity();const entry=cache.get(path);return entry&&entry.until>Date.now()?entry.url:'';}
  async function resolve(path){
    resetIdentity();if(!path||!uid())return '';const cached=url(path);if(cached)return cached;
    if(pending.has(path))return pending.get(path);
    const identity=uid();const request=(async()=>{
      try{const {data,error}=await client().storage.from(BUCKET).createSignedUrl(path,TTL);if(error)throw error;
        if(uid()!==identity)return '';const value=safe(data?.signedUrl);if(value)cache.set(path,{url:value,until:Date.now()+(TTL-60)*1000});return value;
      }catch(error){console.warn('Identity photo read:',error);return '';}
    })();pending.set(path,request);try{return await request;}finally{if(pending.get(path)===request)pending.delete(path);}
  }
  function profileUrl(user,legacy=''){
    resetIdentity();if(user?.id!==uid())return '';
    const metadata=user?.user_metadata||{};
    if(metadata.avatar_path)return url(pathFor('profile',user.id,metadata.avatar_path));
    return metadata.avatar_custom?safe(''):safe(legacy);
  }
  function display(kind,value,cls=''){
    const image=safe(value);return `<span class="identityPhotoDisplay ${esc(cls)}">${image?`<img src="${esc(image)}" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${icons[kind]}</span>`:icons[kind]}</span>`;
  }
  async function refresh(){
    resetIdentity();const user=window.__nayadUser,identity=uid();if(!identity)return;
    const path=pathFor('profile',identity,user?.user_metadata?.avatar_path);
    if(path&&!url(path)&&!pending.has(path)){const signed=await resolve(path);if(signed&&uid()===identity)window.updateProfileUI?.();}
  }
  function editor(kind){return `<div class="identityPhotoEditor" id="${kind}PhotoEditor"></div>`;}
  function draw(kind){
    const draft=drafts?.[kind],root=document.getElementById(kind+'PhotoEditor');if(!draft||!root)return;
    const image=safe(draft.preview);root.innerHTML=`<button type="button" class="identityPhotoPick" aria-label="${kind==='profile'?'Профайлын':'Дэлгүүрийн'} зураг сонгох" onclick="__nayadPhotos.pick('${kind}')">${image?`<img src="${esc(image)}" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${icons[kind]}</span>`:icons[kind]}${!image?`<span class="identityPhotoCamera">${icons.camera}</span>`:''}</button>${image?`<button type="button" class="identityPhotoRemove" aria-label="Зураг арилгах" onclick="__nayadPhotos.remove('${kind}')">×</button>`:''}<input id="${kind}PhotoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>`;
    document.getElementById(kind+'PhotoInput')?.addEventListener('change',event=>select(kind,event.target.files?.[0]));
  }
  function dispose(){if(drafts)Object.values(drafts).forEach(draft=>{if(draft.objectUrl)URL.revokeObjectURL(draft.objectUrl);});drafts=null;}
  async function mount(user,store){
    resetIdentity();dispose();const identity=uid();if(user?.id!==identity)return;
    const profilePath=pathFor('profile',identity,user.user_metadata?.avatar_path),storePath=store?.role==='owner'?pathFor('store',store.id,store.photo_path):null;
    const session=drafts={profile:{id:identity,path:profilePath,preview:profileUrl(user,window.getCurrentUserProfile?.().avatar||''),changed:false},...(store?.role==='owner'?{store:{id:store.id,path:storePath,preview:url(storePath),changed:false}}:{})};
    Object.keys(session).forEach(draw);
    await Promise.all(Object.entries(session).map(async([kind,draft])=>{if(!draft.path)return;const value=await resolve(draft.path);if(drafts===session&&uid()===identity&&!draft.changed){draft.preview=value;draw(kind);}}));
  }
  function valid(){resetIdentity();if(!drafts||drafts.profile.id!==uid()||drafts.store&&drafts.store.id!==window.__nayadActiveStore?.id)throw new Error('Бүртгэл өөрчлөгдсөн байна. Тохиргоогоо дахин нээнэ үү.');if(Object.values(drafts).some(draft=>draft.loading))throw new Error('Зураг бэлдэж байна. Түр хүлээнэ үү.');}
  function pick(kind){if(window.__nayadPhotoSaving)return;try{valid();document.getElementById(kind+'PhotoInput')?.click();}catch(error){window.toast?.(error.message);}}
  function remove(kind){if(window.__nayadPhotoSaving)return;try{valid();const draft=drafts[kind];if(!draft)return;draft.selection=(draft.selection||0)+1;if(draft.objectUrl)URL.revokeObjectURL(draft.objectUrl);Object.assign(draft,{objectUrl:null,file:null,preview:'',changed:true});draw(kind);}catch(error){window.toast?.(error.message);}}
  async function select(kind,file){
    if(!file||window.__nayadPhotoSaving)return;
    try{valid();const session=drafts,draft=session[kind];if(!draft)return;const selection=draft.selection=(draft.selection||0)+1;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG, PNG эсвэл WebP зураг сонгоно уу.');
      if(file.size>20*1024*1024)throw new Error('Зураг 20 MB-аас бага байх ёстой.');
      draft.loading=true;let image;try{image=await resize(file);}finally{draft.loading=false;}if(drafts!==session||uid()!==session.profile.id||draft.selection!==selection)return;
      if(draft.objectUrl)URL.revokeObjectURL(draft.objectUrl);const objectUrl=URL.createObjectURL(image);
      Object.assign(draft,{file:image,objectUrl,preview:objectUrl,changed:true});draw(kind);
    }catch(error){window.toast?.(error.message||'Зургийг уншиж чадсангүй.');}
  }
  async function resize(file){
    const source=URL.createObjectURL(file);try{
      const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.'));img.src=source;});
      const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.size>MAX)throw new Error('Зургийг жижигрүүлж чадсангүй. Өөр зураг сонгоно уу.');return blob;
    }finally{URL.revokeObjectURL(source);}
  }
  async function cleanup(path){if(!path)return;try{const {error}=await client().storage.from(BUCKET).remove([path]);if(error)console.warn('Identity photo cleanup:',error);}catch(error){console.warn('Identity photo cleanup:',error);}}
  async function prepare(kind){
    valid();const draft=drafts[kind];if(!draft?.changed)return {draft,path:draft?.path,newPath:null};
    if(!draft.file)return {draft,path:null,newPath:null};
    const path=`${kind==='profile'?'profiles':'stores'}/${draft.id}/${crypto.randomUUID()}.png`,bytes=await draft.file.arrayBuffer();valid();
    const {error}=await client().storage.from(BUCKET).upload(path,bytes,{contentType:'image/png',upsert:false});if(error)throw error;
    try{valid();}catch(error){await cleanup(path);throw error;}return {draft,path,newPath:path};
  }
  async function committed(prepared){
    const {draft,path}=prepared,old=draft.path;if(draft.changed){draft.path=path;draft.changed=false;draft.file=null;if(path){const signed=await resolve(path);if(signed)draft.preview=signed;}if(old&&old!==path)await cleanup(old);}
  }
  async function saveProfile(metadata){
    const prepared=await prepare('profile');let persisted=false;try{
      const data={...metadata,...(prepared.draft.changed?{avatar_path:prepared.path,avatar_custom:true}:{})};
      const {data:result,error}=await client().auth.updateUser({data});if(error)throw error;persisted=true;
      if(uid()!==prepared.draft.id)throw new Error('Нэвтрэх бүртгэл өөрчлөгдлөө.');
      if(result?.user)window.profileFromUser?.(result.user);await committed(prepared);return {data:result,error:null};
    }catch(error){if(!persisted&&prepared.newPath)await cleanup(prepared.newPath);throw error;}
  }
  async function saveStore(store,changes){
    valid();if(store?.role!=='owner'||store.id!==drafts.store?.id)throw new Error('Зөвхөн дэлгүүрийн эзэмшигч зураг солих боломжтой.');
    const prepared=await prepare('store');let persisted=false;try{
      const payload={...changes,...(prepared.draft.changed?{photo_path:prepared.path}:{})};
      const {data,error}=await client().from('stores').update(payload).eq('id',store.id).select('id,name,operation_role,business_type,entity_type,photo_path').single();if(error)throw error;persisted=true;
      await committed(prepared);valid();return {data,error:null};
    }catch(error){if(!persisted&&prepared.newPath)await cleanup(prepared.newPath);throw error;}
  }
  async function attachStores(rows){
    const identity=uid(),ids=rows.map(row=>row.id);if(!ids.length||!identity)return rows;
    try{const {data,error}=await client().from('stores').select('id,photo_path').in('id',ids);if(error)throw error;const paths=new Map((data||[]).map(row=>[row.id,row.photo_path]));
      const result=await Promise.all(rows.map(async row=>{const path=pathFor('store',row.id,paths.get(row.id));return {...row,photo_path:path,photo_url:await resolve(path)};}));return uid()===identity?result:[];
    }catch(error){console.warn('Store photos:',error);return uid()===identity?rows:[];}
  }
  window.__nayadPhotos={editor,mount,dispose,valid,pick,remove,select,saveProfile,saveStore,profileUrl,refresh,attachStores,display,icons};
  document.head.insertAdjacentHTML('beforeend',css);
  window.addEventListener('focus',()=>{refresh();if(!drafts&&!window.__nayadPhotoSaving)window.__nayadRefreshStores?.({sync:false,close:false});});
})();
