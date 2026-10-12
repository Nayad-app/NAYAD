/* Opt-in scheduled reminders. Preferences belong to the signed-in user and store. */
(function(){
 const sb=()=>window.nayadSupabase||window.sb;
 const store=()=>window.__nayadActiveStoreId||window.__nayadActiveStore?.id;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let draft,context,publicKey,busy=false,generation=0;
 const pad=n=>String(n).padStart(2,'0');
 const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Ulaanbaatar';
 const defaults=()=>({enabled:false,invoice_enabled:true,discount_enabled:true,agreement_enabled:true,loan_enabled:true,advance_days:[1],on_due_day:true,overdue_days:1,reminder_time:new Date().toTimeString().slice(0,8),timezone:zone()});
 const validContext=()=>context&&context.store===store()&&context.user===window.__nayadUser?.id;
 const message=s=>window.toast?.(s);
 const toggle=(key,label)=>`<label class="pushToggle"><span>${label}</span><input type="checkbox" ${draft[key]?'checked':''} onchange="NayadPush.toggle('${key}',this.checked)"><i aria-hidden="true"></i></label>`;
 const wheel=(key,label,count,value)=>`<div class="pushWheelColumn"><span>${label}</span><div class="pushWheel" role="listbox" aria-label="${label}" tabindex="0" data-key="${key}" onscroll="NayadPush.scroll(this)" onkeydown="NayadPush.key(event,this)">${Array.from({length:count},(_,n)=>`<button type="button" role="option" aria-selected="${n===value}" tabindex="-1" onclick="NayadPush.pick(this.parentNode,${n})">${pad(n)}</button>`).join('')}</div></div>`;
 function draw(){
  if(!validContext())return;
  const parts=draft.reminder_time.split(':').map(Number);
  const help=iosNeedsInstall()?'iPhone дээр Safari → Хуваалцах → Home Screen-д нэмэх. Дараа нь NAYAD дүрсээр нээгээд мэдэгдлээ асаана уу.':'';
  window.sheet(`<div class="pushSettings"><div class="pushHeading"><button class="secondary" onclick="closeSheet()" aria-label="Буцах">←</button><h2>Notification</h2></div><div class="pushPanel">${toggle('enabled','Мэдэгдэл идэвхжүүлэх')}<div ${draft.enabled?'':'hidden'}><h3>Юуг сануулах вэ?</h3>${toggle('invoice_enabled','Падааны төлөх хугацаа')}${toggle('discount_enabled','Хөнгөлөлтийн хугацаа дуусах')}${toggle('agreement_enabled','Тохиролцсон төлбөрийн өдөр')}${toggle('loan_enabled','Зээлийн төлөлт')}<h3>Хэзээ сануулах вэ?</h3><div class="pushChoices">${[1,3,7].map(n=>`<button type="button" aria-pressed="${draft.advance_days.includes(n)}" onclick="NayadPush.advance(${n})">${n} хоногийн өмнө</button>`).join('')}</div>${toggle('on_due_day','Төлөх өдөр')}<h3>Хугацаа хэтэрвэл</h3><div class="pushChoices">${[[1,'Өдөр бүр'],[3,'3 хоног тутам'],[0,'Унтраах']].map(([n,t])=>`<button type="button" aria-pressed="${draft.overdue_days===n}" onclick="NayadPush.overdue(${n})">${t}</button>`).join('')}</div><h3>Мэдэгдэл ирэх цаг</h3><div class="pushWheels">${wheel(0,'Цаг',24,parts[0])}${wheel(1,'Минут',60,parts[1])}${wheel(2,'Секунд',60,parts[2])}</div><p class="pushHelp">Цагийн бүс: ${esc(draft.timezone)}${draft.timezone!==zone()?` <button type="button" onclick="NayadPush.useZone()">Утасны цагийн бүсээр тохируулах</button>`:''}</p><p class="pushHelp">Төлөгдсөн падаан, хаасан зээлд сануулга илгээхгүй. Мэдэгдэл ирэхэд бага зэрэг хоцролт гарч болно.</p></div>${help?`<p class="pushHelp">${help}</p>`:''}<button id="pushSave" class="primary full" onclick="NayadPush.save()">ХАДГАЛАХ</button><p class="pushHelp">Энэ дэлгүүрийн таны сануулгын тохиргоо.</p></div></div>`);
  document.getElementById('modal')?.classList.add('pushSettingsModal');
  document.getElementById('sheet')?.classList.add('pushSettingsSheet');
  document.querySelectorAll('.pushWheel').forEach(el=>{el.scrollTop=parts[Number(el.dataset.key)]*32;});
 }
 function iosNeedsInstall(){return (/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))&&!navigator.standalone&&!window.matchMedia('(display-mode: standalone)').matches;}
 async function open(){
  const token=++generation;busy=false;context={store:store(),user:window.__nayadUser?.id};
  if(!context.store||!context.user)return message('Эхлээд дэлгүүрээ сонгоно уу.');
  try{
   const [prefs,key]=await Promise.all([sb().from('push_reminder_settings').select('*').eq('store_id',context.store).eq('user_id',context.user).maybeSingle(),sb().rpc('push_public_key')]);
   if(token!==generation||!validContext())return;
   if(prefs.error||key.error)throw prefs.error||key.error;
   publicKey=key.data;draft={...defaults(),...(prefs.data||{})};draw();
  }catch{message('Мэдэгдлийн тохиргоог ачаалж чадсангүй. Дахин оролдоно уу.');}
 }
 function pick(el,n){el.scrollTo({top:n*32,behavior:'smooth'});}
 function scroll(el){
  clearTimeout(el._pushTimer);el._pushTimer=setTimeout(()=>{
   if(!draft||!el.isConnected)return;
   const n=Math.max(0,Math.min(el.children.length-1,Math.round(el.scrollTop/32)));
   const parts=draft.reminder_time.split(':');parts[Number(el.dataset.key)]=pad(n);draft.reminder_time=parts.join(':');
   Array.from(el.children).forEach((b,i)=>b.setAttribute('aria-selected',String(i===n)));
  },80);
 }
 function readWheels(){if(!draft.enabled)return;document.querySelectorAll('.pushWheel').forEach(el=>{const p=draft.reminder_time.split(':');p[Number(el.dataset.key)]=pad(Math.max(0,Math.min(el.children.length-1,Math.round(el.scrollTop/32))));draft.reminder_time=p.join(':');});}
 const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 async function save(){
  if(busy||!validContext())return message('Дэлгүүр эсвэл бүртгэл өөрчлөгдсөн байна. Тохиргоог дахин нээнэ үү.');
  readWheels();
  if(draft.enabled&&!['invoice_enabled','discount_enabled','agreement_enabled','loan_enabled'].some(k=>draft[k]))return message('Сануулах төрлөө сонгоно уу.');
  if(draft.enabled&&!draft.advance_days.length&&!draft.on_due_day&&!draft.overdue_days)return message('Хэзээ сануулахаа сонгоно уу.');
  if(draft.enabled&&(iosNeedsInstall()||!('PushManager'in window)||!('Notification'in window)||!('serviceWorker'in navigator)))return message('Home Screen-д нэмсэн NAYAD апп эсвэл push дэмждэг хөтчөөс идэвхжүүлнэ үү.');
  if(draft.enabled&&!publicKey)return message('Мэдэгдлийн үйлчилгээ түр бэлэн биш байна.');
  busy=true;const button=document.getElementById('pushSave');if(button){button.disabled=true;button.textContent='Хадгалж байна…';}
  const captured={...context};
  try{
   if(draft.enabled){
    // Request permission directly in the save-button gesture, before any network await.
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('Утасны тохиргооноос NAYAD мэдэгдлийг зөвшөөрнө үү.');
    const reg=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Аппаа шинэчлээд дахин оролдоно уу.')),10000))]);
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});
    if(!validContext())throw new Error('Бүртгэл өөрчлөгдсөн тул хадгалсангүй.');
    const json=sub.toJSON();
    const {error}=await sb().from('web_push_subscriptions').upsert({user_id:captured.user,endpoint:json.endpoint,p256dh:json.keys.p256dh,auth:json.keys.auth},{onConflict:'endpoint'});
    if(error)throw new Error('Энэ төхөөрөмжийг мэдэгдэлд бүртгэж чадсангүй.');
   }
   if(!validContext())throw new Error('Дэлгүүр өөрчлөгдсөн тул хадгалсангүй.');
   const fields=['enabled','invoice_enabled','discount_enabled','agreement_enabled','loan_enabled','advance_days','on_due_day','overdue_days','reminder_time','timezone'];
   const payload=Object.fromEntries(fields.map(k=>[k,draft[k]]));
   const {error}=await sb().from('push_reminder_settings').upsert({...payload,user_id:captured.user,store_id:captured.store},{onConflict:'user_id,store_id'});
   if(error)throw new Error('Тохиргоог хадгалж чадсангүй. Дахин оролдоно уу.');
   message(draft.enabled?'Сануулах тохиргоо хадгалагдлаа.':'Энэ дэлгүүрийн сануулгыг унтраалаа.');window.closeSheet?.();
  }catch(e){message(e.message||'Хадгалах үед алдаа гарлаа.');}
  finally{busy=false;if(button){button.disabled=false;button.textContent='ХАДГАЛАХ';}}
 }
 window.NayadPush={open,save,pick,scroll,key(e,el){if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();pick(el,Math.max(0,Math.min(el.children.length-1,Math.round(el.scrollTop/32)+(e.key==='ArrowDown'?1:-1))));}},toggle(k,v){if(busy)return;readWheels();draft[k]=v;draw();},advance(n){if(busy)return;readWheels();draft.advance_days=draft.advance_days.includes(n)?draft.advance_days.filter(x=>x!==n):[...draft.advance_days,n];draw();},overdue(n){if(busy)return;readWheels();draft.overdue_days=n;draw();},useZone(){readWheels();draft.timezone=zone();draw();}};
 // Modal classes must never leak into invoice/payment forms.
 const originalClose=window.closeSheet;window.closeSheet=function(...args){document.getElementById('modal')?.classList.remove('pushSettingsModal');document.getElementById('sheet')?.classList.remove('pushSettingsSheet');return originalClose?.apply(this,args);};
 async function openReminderStore(id){
  if(!window.__nayadUser||!store())return false;
  if(/^[0-9a-f-]{36}$/i.test(id)&&store()!==id){await window.selectNayadStore?.(id);if(store()!==id)return true;}
  window.closeSheet?.();window.closeProfileMenu?.();
  if(typeof page!=='undefined')page='payments';
  window.NayadStatement?.select('pay');window.render?.();return true;
 }
 navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='NAYAD_OPEN_REMINDERS')openReminderStore(event.data.store_id||'');});
 const reminderId=new URLSearchParams(window.location.search).get('reminders');
 if(reminderId){let tries=0;const retry=async()=>{if(await openReminderStore(reminderId)){const url=new URL(window.location.href);url.searchParams.delete('reminders');history.replaceState(null,'',url);}else if(++tries<60)setTimeout(retry,1000);};setTimeout(retry,1000);}
 const style=document.createElement('style');style.textContent=`
 .pushSettingsModal{align-items:center;padding:14px}.pushSettingsSheet{width:min(480px,100%);max-height:90dvh;border-radius:22px;padding:18px;overflow:auto}.pushHeading{display:flex;align-items:center;gap:12px;margin-bottom:12px}.pushHeading h2{margin:0;font-size:20px}.pushHeading button{padding:8px 12px}.pushPanel{background:var(--surface,#fff);border-radius:16px;padding:12px}.pushSettings h3{font-size:12px;margin:16px 0 9px}.pushToggle{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:12px;cursor:pointer}.pushToggle input{position:absolute;opacity:0;width:1px;height:1px}.pushToggle i{width:38px;height:24px;flex:0 0 38px;border-radius:20px;background:#ccc;padding:3px}.pushToggle i:after{content:'';display:block;width:18px;height:18px;border-radius:50%;background:white;transition:transform .15s}.pushToggle input:checked+i{background:var(--yellow)}.pushToggle input:checked+i:after{transform:translateX(14px)}.pushToggle input:focus-visible+i{outline:2px solid #2675dd;outline-offset:3px}.pushChoices{display:flex;gap:5px}.pushChoices button{flex:1;min-width:0;font-size:10px;padding:10px 4px;background:var(--surface-2,#eee);color:var(--text,#222)}.pushChoices button[aria-pressed=true]{background:var(--yellow);color:#111}.pushWheels{display:flex;position:relative;border:1px solid var(--line);border-radius:12px;overflow:hidden}.pushWheelColumn{width:33.33%;text-align:center;padding-top:6px}.pushWheelColumn>span{font-size:10px;color:var(--muted)}.pushWheel{height:96px;overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;padding:32px 0;box-sizing:border-box}.pushWheel::-webkit-scrollbar{display:none}.pushWheel button{display:block;height:32px;min-height:32px;padding:0;width:100%;border-radius:0;scroll-snap-align:center;background:transparent;color:var(--muted);font-size:19px}.pushWheel button[aria-selected=true]{background:var(--yellow-soft,#fff4cc);color:#111;font-weight:800}.pushHelp{font-size:10px;color:var(--muted);line-height:1.5;margin:9px 0}.pushHelp button{font-size:10px;padding:3px}#pushSave{margin-top:8px}.pushSettings [hidden]{display:none!important}
 `;document.head.appendChild(style);
})();
