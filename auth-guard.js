/* NAYAD auth guard v58 — browser Supabase Auth owns session persistence. */
(function(){
  if(window.__nayadAuthGuardV58)return;
  window.__nayadAuthGuardV58=true;

  const originalHandleAuthStateChange=window.handleAuthStateChange;
  const originalShowAuthenticatedApp=window.showAuthenticatedApp;
  const originalShowLoginScreen=window.showLoginScreen;
  const originalPhoneLogin=window.phoneLogin;
  let running=null;
  function faceLocked(){return window.__nayadFaceIdLocked?.()===true;}

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
  function resetRuntimeIdentity(){
    if(typeof window.__nayadClearStoreRuntime==='function')window.__nayadClearStoreRuntime();
    else{
      window.__nayadStores=[];
      window.__nayadStoresUserId='';
      window.__nayadActiveStoreId='';
      window.__nayadActiveStore=null;
    }
    window.__nayadUser=null;
    if(typeof window.switchUserData==='function')window.switchUserData(null);
  }
  function scheduleCloudSync(reason){
    setTimeout(async()=>{
      for(let i=0;i<20;i++){
        if(typeof window.__nayadStartCloudSync==='function'){
          await window.__nayadStartCloudSync({reason});
          return;
        }
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      console.warn('NAYAD cloud runtime was not ready after app boot.');
    },0);
  }
  function hasCompletedActiveRegistration(){
    const store=window.__nayadActiveStore||null;
    return typeof window.__nayadIsRegistrationComplete==='function'
      ?window.__nayadIsRegistrationComplete(store)
      :Boolean(store?.id&&store?.registration_completed_at);
  }

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
      if(faceLocked()){await originalShowLoginScreen();return false;}
      const session=await readCurrentSession();
      if(faceLocked()){await originalShowLoginScreen();return false;}
      const user=session?.user||null;
      if(!user){
        resetRuntimeIdentity();
        if(typeof originalShowLoginScreen==='function')await originalShowLoginScreen();
        return false;
      }
      applyCurrentUser(user);
      const opened=typeof originalShowAuthenticatedApp==='function'
        ?Boolean(await originalShowAuthenticatedApp())
        :true;
      if(opened&&hasCompletedActiveRegistration())scheduleCloudSync('app-open');
      return opened;
    }catch(error){
      console.warn('Auth guard show app:',error);
      return false;
    }
  }

  async function safeShowLoginScreen(){
    if(faceLocked())return originalShowLoginScreen();
    try{
      const session=await readCurrentSession();
      if(session?.user){
        applyCurrentUser(session.user);
        return safeShowAuthenticatedApp();
      }
    }catch(error){console.warn('Auth guard login check:',error);}
    if(typeof originalShowLoginScreen==='function')return originalShowLoginScreen();
  }

  if(typeof originalShowAuthenticatedApp==='function')window.showAuthenticatedApp=safeShowAuthenticatedApp;
  if(typeof originalShowLoginScreen==='function')window.showLoginScreen=safeShowLoginScreen;

  // The canonical login owns password verification, passkey enrollment and unlock.
  // A second phone-only implementation bypassed the Face ID checkbox entirely.
  if(typeof originalPhoneLogin==='function')window.phoneLogin=originalPhoneLogin;

  /* Logout is local to this browser. A user signing out here must not revoke
     the same account on other devices. */
  window.logoutNayad=async function(){
    const rememberKey=(typeof REMEMBER_KEY!=='undefined'?REMEMBER_KEY:'NAYAD_REMEMBER_ME');
    localStorage.removeItem(rememberKey);
    sessionStorage.removeItem('NAYAD_SESSION_ONLY');
    sessionStorage.removeItem('NAYAD_JUST_LOGGED_IN');
    try{
      const c=client();
      if(c?.auth?.signOut)await c.auth.signOut({scope:'local'});
    }catch(error){
      console.warn('Local signOut:',error);
    }finally{
      resetRuntimeIdentity();
      if(typeof originalShowLoginScreen==='function')await originalShowLoginScreen();
    }
  };

  async function reconcile(reason='recovery'){
    if(faceLocked()){await originalShowLoginScreen();return false;}
    if(running)return running;
    running=(async()=>{
      try{
        const session=await readCurrentSession();
        if(faceLocked()){await originalShowLoginScreen();return false;}
        if(session?.user){
          applyCurrentUser(session.user);
          const app=document.getElementById('app');
          if(app&&!app.classList.contains('hide')){
            scheduleCloudSync('reconcile-'+reason);
            return true;
          }
          return Boolean(await safeShowAuthenticatedApp());
        }
        return false;
      }catch(error){console.warn('Auth reconcile:',reason,error);return false;}
    })();
    try{return await running;}finally{running=null;}
  }

  window.__nayadAuthReconcile=reconcile;
  window.addEventListener('pageshow',event=>{if(event.persisted)setTimeout(()=>reconcile('bfcache'),0);});
})();
