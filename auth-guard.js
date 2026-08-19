/* NAYAD auth guard v47 — stale auth events must never replace the current session. */
(function(){
  if(window.__nayadAuthGuardV47)return;
  window.__nayadAuthGuardV47=true;

  const originalShowAuthenticatedApp=window.showAuthenticatedApp;
  const originalShowLoginScreen=window.showLoginScreen;
  let running=null;

  function client(){return window.nayadSupabase||window.sb||null;}

  async function readCurrentSession(){
    const c=client();
    if(!c?.auth?.getSession)return null;
    const {data,error}=await c.auth.getSession();
    if(error)throw error;
    return data?.session||null;
  }

  function applyCurrentUser(user){
    if(!user)return;
    if(String(window.__nayadUser?.id||'')!==String(user.id||'')){
      if(typeof window.profileFromUser==='function')window.profileFromUser(user);
      else window.__nayadUser=user;
    }
  }

  async function safeShowAuthenticatedApp(){
    try{
      const session=await readCurrentSession();
      const user=session?.user||null;
      if(!user){
        window.__nayadUser=null;
        if(typeof window.switchUserData==='function')window.switchUserData(null);
        if(typeof originalShowLoginScreen==='function')await originalShowLoginScreen();
        return false;
      }

      /* A delayed SIGNED_IN/TOKEN_REFRESHED callback may have just written an
         older user into window.__nayadUser. Always restore the user from the
         session that Supabase currently owns before opening a store. */
      applyCurrentUser(user);
      if(typeof originalShowAuthenticatedApp==='function'){
        return Boolean(await originalShowAuthenticatedApp());
      }
      return true;
    }catch(error){
      console.warn('Auth guard show app:',error);
      return false;
    }
  }

  async function safeShowLoginScreen(){
    try{
      const session=await readCurrentSession();
      if(session?.user){
        /* A stale SIGNED_OUT event must not kick an already signed-in account
           back to the login screen. */
        applyCurrentUser(session.user);
        return safeShowAuthenticatedApp();
      }
    }catch(error){
      console.warn('Auth guard login check:',error);
    }
    if(typeof originalShowLoginScreen==='function')return originalShowLoginScreen();
  }

  if(typeof originalShowAuthenticatedApp==='function')window.showAuthenticatedApp=safeShowAuthenticatedApp;
  if(typeof originalShowLoginScreen==='function')window.showLoginScreen=safeShowLoginScreen;

  async function reconcile(reason='recovery'){
    if(running)return running;
    running=(async()=>{
      try{
        const session=await readCurrentSession();
        if(session?.user){
          applyCurrentUser(session.user);
          const app=document.getElementById('app');
          if(app&&!app.classList.contains('hide'))return true;
          return Boolean(await safeShowAuthenticatedApp());
        }
        return false;
      }catch(error){
        console.warn('Auth reconcile:',reason,error);
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
