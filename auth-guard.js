/* NAYAD auth guard v55 — browser Supabase Auth owns session persistence. */
(function(){
  if(window.__nayadAuthGuardV55)return;
  window.__nayadAuthGuardV55=true;

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
  function resetRuntimeIdentity(){
    window.__nayadUser=null;
    window.__nayadStores=[];
    window.__nayadActiveStoreId='';
    window.__nayadActiveStore=null;
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
        resetRuntimeIdentity();
        if(typeof originalShowLoginScreen==='function')await originalShowLoginScreen();
        return false;
      }
      applyCurrentUser(user);
      const opened=typeof originalShowAuthenticatedApp==='function'
        ?Boolean(await originalShowAuthenticatedApp())
        :true;
      if(opened)scheduleCloudSync('app-open');
      return opened;
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

  /* Phone login v55: the edge function only resolves and verifies the phone
     identity. The browser then signs in natively with Supabase Auth. No raw
     token handoff, no setSession(), and no forced navigation are used. */
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
      try{
        const url=(typeof SUPABASE_URL!=='undefined'?SUPABASE_URL:'https://kjgtmxcxchjevzoxwqzr.supabase.co')+'/functions/v1/phone-login';
        const key=(typeof SUPABASE_PUBLISHABLE_KEY!=='undefined'?SUPABASE_PUBLISHABLE_KEY:'');
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','apikey':key},body:JSON.stringify({phone,password})});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||typeof result.email!=='string'||!result.email||typeof result.user_id!=='string'||!result.user_id){
          throw new Error('Invalid login credentials');
        }

        const c=client();
        if(!c?.auth?.signInWithPassword)throw new Error('Нэвтрэх үйлчилгээ бэлэн биш байна.');
        const login=await c.auth.signInWithPassword({email:result.email,password});
        if(login.error)throw login.error;
        if(!login.data?.session||!login.data?.user)throw new Error('Нэвтрэх session үүссэнгүй.');
        if(String(login.data.user.id)!==String(result.user_id)){
          try{await c.auth.signOut({scope:'local'});}catch(_){ }
          throw new Error('Нэвтрэх хэрэглэгч таарсангүй.');
        }

        const rememberKey=(typeof REMEMBER_KEY!=='undefined'?REMEMBER_KEY:'NAYAD_REMEMBER_ME');
        localStorage.setItem(rememberKey,remember?'1':'0');
        if(!remember)sessionStorage.setItem('NAYAD_SESSION_ONLY','1');
        else sessionStorage.removeItem('NAYAD_SESSION_ONLY');

        applyCurrentUser(login.data.user);
        const opened=await safeShowAuthenticatedApp();
        if(!opened)throw new Error('Дэлгүүрийн мэдээлэл ачаалж чадсангүй.');
      }catch(error){
        console.error(error);
        const message=(typeof authFriendlyError==='function')?authFriendlyError(error):(error?.message||'Нэвтрэхэд алдаа гарлаа.');
        if(typeof authMessage==='function')authMessage('loginMsg',message);
      }finally{
        if(typeof setAuthBusy==='function')setAuthBusy('loginBtn',false);
      }
    };
  }

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
    if(running)return running;
    running=(async()=>{
      try{
        const session=await readCurrentSession();
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
