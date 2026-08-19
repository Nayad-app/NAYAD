/* NAYAD auth guard v49 — current session is authoritative; phone login starts a clean runtime. */
(function(){
  if(window.__nayadAuthGuardV49)return;
  window.__nayadAuthGuardV49=true;

  const originalHandleAuthStateChange=window.handleAuthStateChange;
  const originalShowAuthenticatedApp=window.showAuthenticatedApp;
  const originalShowLoginScreen=window.showLoginScreen;
  const originalPhoneLogin=window.phoneLogin;
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
      if(typeof originalShowAuthenticatedApp==='function')return Boolean(await originalShowAuthenticatedApp());
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
    }catch(error){console.warn('Auth guard login check:',error);}
    if(typeof originalShowLoginScreen==='function')return originalShowLoginScreen();
  }

  if(typeof originalShowAuthenticatedApp==='function')window.showAuthenticatedApp=safeShowAuthenticatedApp;
  if(typeof originalShowLoginScreen==='function')window.showLoginScreen=safeShowLoginScreen;

  /* Account switching was the remaining failure mode: setSession succeeds, but
     listeners from the previous account can still mutate store state in the same
     JS runtime. For phone login, persist the new Supabase session and immediately
     start a fresh document. A cold load has one auth identity and no stale queues. */
  if(typeof originalPhoneLogin==='function'){
    window.phoneLogin=async function(){
      const username=(document.getElementById('loginPhone')?.value||'').trim();
      if(username.includes('@'))return originalPhoneLogin.apply(this,arguments);
      const phone=(typeof normalizeMongolianPhone==='function')?normalizeMongolianPhone(username):'';
      const password=document.getElementById('loginPassword')?.value||'';
      const remember=document.getElementById('rememberMe')?.checked!==false;
      if(!username||!password){if(typeof authMessage==='function')authMessage('loginMsg','Утасны дугаар болон нууц үгээ оруулна уу.');return;}
      if(!phone){if(typeof authMessage==='function')authMessage('loginMsg','Утасны дугаараа 8 оронтой зөв оруулна уу.');return;}
      if(typeof setAuthBusy==='function')setAuthBusy('loginBtn',true,'Нэвтэрч байна...');
      let navigating=false;
      try{
        const url=(typeof SUPABASE_URL!=='undefined'?SUPABASE_URL:'https://kjgtmxcxchjevzoxwqzr.supabase.co')+'/functions/v1/phone-login';
        const key=(typeof SUPABASE_PUBLISHABLE_KEY!=='undefined'?SUPABASE_PUBLISHABLE_KEY:'');
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','apikey':key},body:JSON.stringify({phone,password})});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||!result.access_token||!result.refresh_token)throw new Error('Invalid login credentials');
        const c=client();
        if(!c?.auth?.setSession)throw new Error('Нэвтрэх үйлчилгээ бэлэн биш байна.');
        const login=await c.auth.setSession({access_token:result.access_token,refresh_token:result.refresh_token});
        if(login.error)throw login.error;
        if(!login.data?.session||!login.data?.user)throw new Error('Нэвтрэх session үүссэнгүй.');
        const rememberKey=(typeof REMEMBER_KEY!=='undefined'?REMEMBER_KEY:'NAYAD_REMEMBER_ME');
        localStorage.setItem(rememberKey,remember?'1':'0');
        if(!remember)sessionStorage.setItem('NAYAD_SESSION_ONLY','1');
        else sessionStorage.removeItem('NAYAD_SESSION_ONLY');
        sessionStorage.setItem('NAYAD_JUST_LOGGED_IN',login.data.user.id||'1');
        navigating=true;
        window.location.replace(window.location.pathname);
      }catch(error){
        console.error(error);
        const message=(typeof authFriendlyError==='function')?authFriendlyError(error):(error?.message||'Нэвтрэхэд алдаа гарлаа.');
        if(typeof authMessage==='function')authMessage('loginMsg',message);
      }finally{
        if(!navigating&&typeof setAuthBusy==='function')setAuthBusy('loginBtn',false);
      }
    };
  }

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
      }catch(error){console.warn('Auth reconcile:',reason,error);return false;}
    })();
    try{return await running;}finally{running=null;}
  }

  window.__nayadAuthReconcile=reconcile;
  window.addEventListener('pageshow',event=>{if(event.persisted)setTimeout(()=>reconcile('bfcache'),0);});
})();
