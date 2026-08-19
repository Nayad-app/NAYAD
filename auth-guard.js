/* NAYAD auth session guard — recovery only; normal auth events are handled by index.html. */
(function(){
  let running=null;

  function client(){return window.nayadSupabase||window.sb||null;}

  async function reconcile(reason='recovery'){
    if(running)return running;
    running=(async()=>{
      const c=client();
      if(!c?.auth?.getSession)return false;
      try{
        const {data,error}=await c.auth.getSession();
        if(error)throw error;
        const session=data?.session||null;
        const user=session?.user||null;
        if(!user)return false;

        if(String(window.__nayadUser?.id||'')!==String(user.id||'')){
          if(typeof window.profileFromUser==='function')window.profileFromUser(user);
          else window.__nayadUser=user;
        }

        const app=document.getElementById('app');
        if(app&&!app.classList.contains('hide'))return true;
        if(typeof window.showAuthenticatedApp==='function')return Boolean(await window.showAuthenticatedApp());
        return true;
      }catch(error){
        console.warn('Auth recovery:',reason,error);
        return false;
      }
    })();
    try{return await running;}finally{running=null;}
  }

  window.__nayadAuthReconcile=reconcile;
  window.addEventListener('pageshow',event=>{
    if(event.persisted)setTimeout(()=>reconcile('bfcache'),0);
  });
})();
