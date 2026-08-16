// NAYAD: Facebook login disabled intentionally.
(function(){
  function removeFacebookUI(){
    document.querySelectorAll('button[onclick*="facebook" i], .oauth.facebook').forEach(function(el){ el.remove(); });
    document.querySelectorAll('.oauthGrid').forEach(function(grid){
      if(!grid.querySelector('.oauth.facebook') && grid.dataset.facebookRemoved!=='1'){
        grid.dataset.facebookRemoved='1';
        grid.style.gridTemplateColumns='1fr';
      }
    });
    document.querySelectorAll('.authHint').forEach(function(el){ el.remove(); });
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
  window.addEventListener('DOMContentLoaded',apply,{once:true});
  window.addEventListener('load',apply,{once:true});
  var observer=new MutationObserver(function(mutations){
    var needs=false;
    for(var i=0;i<mutations.length;i++){
      if(mutations[i].addedNodes && mutations[i].addedNodes.length){ needs=true; break; }
    }
    if(needs) apply();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
