/* Remember only the last successful opted-in account.
   Passwords stay in memory or the browser's credential manager, never web storage. */
(()=>{
  const key='NAYAD_REMEMBERED_LOGIN';
  const field=id=>document.getElementById(id);
  let saved=null,password='',restored=false,baseline=null;
  try{const value=JSON.parse(localStorage.getItem(key)||'null');if(typeof value?.username==='string')saved={username:value.username};}catch(_){}
  function restore(){
    if(restored)return;restored=true;
    const name=field('loginPhone'),secret=field('loginPassword'),check=field('rememberMe');
    if(name)name.value=saved?.username||'';
    if(secret)secret.value=password;
    if(check)check.checked=!!saved;
    baseline=saved?{username:saved.username,password}:null;
  }
  function edited(){
    if(!baseline)return;
    if(field('loginPhone')?.value!==baseline.username||field('loginPassword')?.value!==baseline.password){
      if(field('rememberMe'))field('rememberMe').checked=false;
      baseline=null;
    }
  }
  function success(username,secret,remember){
    if(remember&&username&&secret){
      saved={username};password=secret;
      try{localStorage.setItem(key,JSON.stringify(saved));}catch(_){}
      // Supported browsers can ask to save/update the password in their secure vault.
      if(typeof window.PasswordCredential==='function'&&navigator.credentials?.store){
        try{Promise.resolve(navigator.credentials.store(new PasswordCredential({id:username,password:secret}))).catch(()=>{});}catch(_){}
      }
    }
    restored=false;baseline=null;
  }
  window.__nayadRememberLogin={restore,edited,success};
})();
