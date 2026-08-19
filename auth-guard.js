/* NAYAD auth guard v48 — the current Supabase session is the only auth source of truth. */
(function(){
  if(window.__nayadAuthGuardV48)return;
  window.__nayadAuthGuardV48=true;

  const originalHandleAuthStateChange=window.handleAuthStateChange;
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

  /* index.html registered its auth callback before this file loads. That callback
     resolves handleAuthStateChange by name when its timer runs, so replacing the
     global function here also protects the already-registered callback. Never
     trust the session object carried by a delayed event; re-read the session that
     Supabase currently owns and pass only that to the original handler. */
  if(typeof originalHandleAuthStateChange==='function'){
    window.handleAuthStateChange=async function(event,eventSession){
      const recovery=(event==='PASSWORD_RECOVERY')||
        (typeof INITIAL_RECOVERY_FLOW!=='undefined'&&INITIAL_RECOVERY_FLOW)||
        (typeof isPasswordRecovery==='function'&&isPasswordRecovery());
      const confirming=(typeof INITIAL_EMAIL_CONFIRM_FLOW!=='undefined'&&INITIAL_EMAIL_CONFIRM_FLOW);
      if(recovery||confirming)return originalHandleAuthStateChange(event,eventSession);

      try{
        await Promise.resolve();
        const currentSession=await readCurrentSession();
        const eventUserId=eventSession?.user?.id||'';
        const currentUserId=currentSession?.user?.id||'';
        if(eventUserId&&currentUserId&&String(eventUserId)!==String(currentUserId)){
          console.info('NAYAD ignored stale auth event for',eventUserId);
        }
        if(currentSession?.user)return originalHandleAuthStateChange(event,currentSession);
        return originalHandleAuthStateChange('SIGNED_OUT',null);
      }catch(error){
        console.warn('Auth event verification:',error);
        return false;
      }
    };
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
