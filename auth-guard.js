/* NAYAD auth session guard — reconciles delayed auth events after account switches. */
(function(){
  let generation=0;

  function client(){return window.nayadSupabase||window.sb||null;}

  async function reconcile(reason='auth'){
    const c=client();
    if(!c?.auth?.getSession)return false;
    const ticket=++generation;
    await new Promise(resolve=>setTimeout(resolve,0));

    let currentSession=null;
    try{
      const {data,error}=await c.auth.getSession();
      if(error)throw error;
      currentSession=data?.session||null;
    }catch(error){
      console.warn('Auth reconcile session:',reason,error);
      return false;
    }

    if(ticket!==generation)return false;
    const currentUser=currentSession?.user||null;
    const currentUserId=currentUser?.id||'';

    if(currentUser){
      if(String(window.__nayadUser?.id||'')!==String(currentUserId)){
        if(typeof window.profileFromUser==='function')window.profileFromUser(currentUser);
        else window.__nayadUser=currentUser;
      }

      if(typeof window.showAuthenticatedApp==='function'){
        const opened=await window.showAuthenticatedApp();
        if(ticket!==generation)return false;
        if(opened){
          const message=document.getElementById('loginMsg');
          if(message)message.innerHTML='';
        }
        return Boolean(opened);
      }
      return true;
    }

    if(window.__nayadUser){
      window.__nayadUser=null;
      if(typeof window.switchUserData==='function')window.switchUserData(null);
    }
    if(typeof window.showLoginScreen==='function')await window.showLoginScreen();
    return true;
  }

  window.__nayadAuthReconcile=reconcile;

  const c=client();
  if(typeof c?.auth?.onAuthStateChange==='function'){
    c.auth.onAuthStateChange(()=>{
      setTimeout(()=>reconcile('auth-state-change'),0);
      setTimeout(()=>reconcile('auth-state-settled'),180);
    });
  }

  window.addEventListener('pageshow',()=>setTimeout(()=>reconcile('pageshow'),0));
})();
