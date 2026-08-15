/* NAYAD OAuth callback/session recovery */
(async function(){
  async function finishOAuth(){
    const sb=window.nayadSupabase;
    if(!sb) return false;
    try{
      const url=new URL(window.location.href);
      const code=url.searchParams.get('code');
      if(code){
        const {data,error}=await sb.auth.exchangeCodeForSession(code);
        if(error) console.warn('OAuth code exchange:',error.message);
        if(data?.session){
          url.searchParams.delete('code');
          url.searchParams.delete('state');
          history.replaceState({},document.title,url.pathname+(url.search?url.search:'')+url.hash);
        }
      }
      const {data:{session}}=await sb.auth.getSession();
      if(!session) return false;
      window.__nayadUser=session.user;
      if(typeof profileFromUser==='function') profileFromUser(session.user);
      if(typeof showAuthenticatedApp==='function') await showAuthenticatedApp();
      return true;
    }catch(e){
      console.warn('NAYAD OAuth callback:',e);
      return false;
    }
  }
  for(let i=0;i<12;i++){
    if(await finishOAuth()) return;
    await new Promise(r=>setTimeout(r,500));
  }
})();
