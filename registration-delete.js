/* Delete exactly one owned registration while preserving the login account. */
(function(){
  const CONFIRMATION='УСТГАХ';
  const DATA_PREFIX='NAYAD_DATA_V4:';
  const ACTIVE_PREFIX='NAYAD_ACTIVE_STORE:';
  let pendingTarget=null;
  let deleting=false;

  function esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function notify(message){if(typeof window.toast==='function')window.toast(message);}
  function currentUserId(){return String(window.__nayadUser?.id||'');}
  function currentStore(){return window.__nayadActiveStore||null;}
  function ownerTarget(){
    const userId=currentUserId(),store=currentStore();
    if(!userId||!store?.id||store.role!=='owner')return null;
    return {userId,storeId:String(store.id),name:String(store.name||'NAYAD')};
  }
  function setBusy(busy){
    const button=document.getElementById('deleteRegistrationBtn');
    if(!button)return;
    button.disabled=busy;
    if(busy){button.dataset.oldText=button.textContent;button.textContent='Устгаж байна...';}
    else button.textContent=button.dataset.oldText||'Бүртгэл устгах';
  }
  function sameTarget(target){
    return currentUserId()===target.userId&&String(currentStore()?.id||'')===target.storeId&&currentStore()?.role==='owner';
  }

  function showDeleteRegistrationConfirm(){
    if(window.__nayadCriticalOperation){notify('Хадгалалт дууссаны дараа бүртгэлээ устгана уу.');return;}
    const target=ownerTarget();
    if(!target){notify('Зөвхөн бүртгэлийн эзэмшигч устгах боломжтой.');return;}
    pendingTarget=target;
    if(typeof window.sheet!=='function')return;
    window.sheet(`<h2>“${esc(target.name)}” бүртгэлийг устгах уу?</h2><div class="authError" style="margin-top:0">Зөвхөн “${esc(target.name)}” бүртгэл болон түүнд хамаарах мэдээлэл бүгд устна. Таны нэвтрэх эрх болон бусад бүртгэл хэвээр үлдэнэ.</div><p class="authSub">Үргэлжлүүлэх бол доорх талбарт <b>УСТГАХ</b> гэж бичнэ үү.</p><div class="field"><label>Баталгаажуулах үг</label><input id="deleteRegistrationConfirm" autocomplete="off" placeholder="УСТГАХ"></div><div class="actions"><button class="secondary" type="button" onclick="showProfileDetails()">Болих</button><button class="primary" type="button" id="deleteRegistrationBtn" style="background:#d64545;color:#fff" onclick="deleteActiveRegistration()">Бүртгэл устгах</button></div>`);
  }

  async function verifiedSessionUserId(){
    const client=window.nayadSupabase||window.sb;
    if(!client?.auth?.getSession)return '';
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    return String(data?.session?.user?.id||'');
  }

  async function deleteActiveRegistration(){
    if(deleting)return;
    const target=pendingTarget;
    if(!target||!sameTarget(target)){notify('Идэвхтэй бүртгэл өөрчлөгдсөн байна. Дахин оролдоно уу.');return;}
    const confirmation=String(document.getElementById('deleteRegistrationConfirm')?.value||'').trim();
    if(confirmation!==CONFIRMATION){notify('Баталгаажуулах үгийг яг УСТГАХ гэж оруулна уу.');return;}
    if(window.__nayadCriticalOperation){notify('Хадгалалт дууссаны дараа бүртгэлээ устгана уу.');return;}

    const operationToken=`registration-delete:${target.userId}:${target.storeId}`;
    let serverDeleted=false;
    deleting=true;
    window.__nayadCriticalOperation=operationToken;
    setBusy(true);
    try{
      if(window.__nayadCloudSyncQueue)await window.__nayadCloudSyncQueue.catch(()=>{});
      if(!sameTarget(target))throw new Error('Идэвхтэй бүртгэл өөрчлөгдсөн байна. Дахин оролдоно уу.');
      if(await verifiedSessionUserId()!==target.userId)throw new Error('Нэвтэрсэн хэрэглэгч өөрчлөгдсөн байна. Дахин оролдоно уу.');

      const client=window.nayadSupabase||window.sb;
      const {data:{session},error:sessionError}=await client.auth.getSession();
      if(sessionError||!session?.access_token||String(session.user?.id||'')!==target.userId){
        throw new Error('Нэвтрэх session олдсонгүй.');
      }
      const response=await fetch(`${window.SUPABASE_URL||SUPABASE_URL}/functions/v1/delete-registration`,{
        method:'POST',
        headers:{
          Authorization:`Bearer ${session.access_token}`,
          apikey:window.SUPABASE_PUBLISHABLE_KEY||SUPABASE_PUBLISHABLE_KEY,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({store_id:target.storeId,confirmation:CONFIRMATION})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result?.ok!==true)throw new Error(result?.error||'Бүртгэл устгахад алдаа гарлаа.');
      if(String(result.deleted_store_id||'')!==target.storeId)throw new Error('Устгалын хариу зөрүүтэй байна.');
      serverDeleted=true;
      pendingTarget=null;
      if(typeof window.closeSheet==='function')window.closeSheet();

      /* A response from the old account must never clear the next account's
         runtime or browser cache if the session changed while awaiting it. */
      if(currentUserId()!==target.userId||await verifiedSessionUserId()!==target.userId)return;

      localStorage.removeItem(`${DATA_PREFIX}${target.userId}:${target.storeId}`);
      const activeKey=`${ACTIVE_PREFIX}${target.userId}`;
      if(String(localStorage.getItem(activeKey)||'')===target.storeId)localStorage.removeItem(activeKey);

      const remaining=typeof window.__nayadRefreshStores==='function'
        ?await window.__nayadRefreshStores({sync:true,close:true})
        :[];
      if(currentUserId()!==target.userId)return;
      const nextStore=window.__nayadActiveStore||null;
      const hasCompletedRegistration=typeof window.__nayadIsRegistrationComplete==='function'
        ?window.__nayadIsRegistrationComplete(nextStore)
        :Boolean(nextStore?.id&&nextStore?.registration_completed_at);
      if(!remaining.length||!hasCompletedRegistration){
        if(typeof window.showNayadRegistrationOnboarding==='function'){
          window.showNayadRegistrationOnboarding({initial:true,existingRegistration:window.__nayadPendingRegistration||null});
        }
      }
      notify(`“${target.name}” бүртгэл устлаа.`);
    }catch(error){
      if(serverDeleted){
        console.error('Registration deleted; refresh failed:',error);
        if(currentUserId()===target.userId&&String(currentStore()?.id||'')===target.storeId){
          if(typeof window.__nayadClearStoreRuntime==='function')window.__nayadClearStoreRuntime();
        }
        if(typeof window.closeSheet==='function')window.closeSheet();
        notify(`“${target.name}” бүртгэл устсан. Жагсаалтыг дахин ачаалж байна.`);
        setTimeout(()=>window.location?.reload?.(),250);
      }else{
        console.error('Delete registration:',error);
        notify(error?.message||'Бүртгэл устгахад алдаа гарлаа.');
      }
    }finally{
      if(window.__nayadCriticalOperation===operationToken)delete window.__nayadCriticalOperation;
      deleting=false;
      setBusy(false);
    }
  }

  window.showDeleteRegistrationConfirm=showDeleteRegistrationConfirm;
  window.deleteActiveRegistration=deleteActiveRegistration;
})();
