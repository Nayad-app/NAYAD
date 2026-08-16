// NAYAD: Facebook login disabled intentionally.
(function(){
  function removeFacebookUI(){
    document.querySelectorAll('button[onclick*="facebook" i], .oauth.facebook').forEach(function(el){ el.remove(); });
    document.querySelectorAll('.oauthGrid').forEach(function(grid){
      if(!grid.querySelector('.oauth.facebook')) grid.style.gridTemplateColumns='1fr';
    });
    document.querySelectorAll('.authHint').forEach(function(el){
      el.textContent = el.textContent.replace(/Google\s*\/\s*Facebook/gi,'Google').replace(/Facebook\s*\/\s*Google/gi,'Google').replace(/Facebook/gi,'');
    });
  }
  function blockFacebookOAuth(){
    if(typeof window.signInWithOAuth === 'function' && !window.__nayadFacebookBlocked){
      var original=window.signInWithOAuth;
      window.signInWithOAuth=function(provider){
        if(String(provider||'').toLowerCase()==='facebook'){
          if(typeof window.toast==='function') window.toast('Facebook нэвтрэлтийг ашиглахгүй болсон.');
          return Promise.resolve(null);
        }
        return original.apply(this,arguments);
      };
      window.__nayadFacebookBlocked=true;
    }
  }
  function apply(){ removeFacebookUI(); blockFacebookOAuth(); }
  apply();
  window.addEventListener('DOMContentLoaded',apply);
  window.addEventListener('load',apply);
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();
