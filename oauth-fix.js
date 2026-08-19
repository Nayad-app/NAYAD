/* NAYAD OAuth callback recovery — do not interfere with normal phone/password login. */
(async function(){
  const sb=window.nayadSupabase;
  if(!sb)return;
  const url=new URL(window.location.href);
  const code=url.searchParams.get('code');

  /* Supabase PKCE OAuth callbacks contain ?code=. Normal page loads and phone
     logins must not start another showAuthenticatedApp/store preparation loop. */
  if(!code)return;

  try{
    const {data,error}=await sb.auth.exchangeCodeForSession(code);
    if(error)throw error;
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    history.replaceState({},document.title,url.pathname+(url.search?url.search:'')+url.hash);
    const session=data?.session||null;
    if(!session)return;
    if(typeof profileFromUser==='function')profileFromUser(session.user);
    else window.__nayadUser=session.user;
    if(typeof showAuthenticatedApp==='function')await showAuthenticatedApp();
  }catch(error){
    console.warn('NAYAD OAuth callback:',error);
  }
})();
