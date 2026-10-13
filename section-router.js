/* Section URLs contain navigation only, never customer or financial data. */
(function(){
  'use strict';
  const paths={home:'/nuur',companies:'/hariltsagch',payments:'/tulbur',loans:'/zeel'};
  const pageAt=path=>Object.keys(paths).find(key=>paths[key]===path.replace(/\/$/,''));
  const params=new URLSearchParams(location.search),entry=params.get('__nayad_route');
  if(pageAt(entry||'')){
    params.delete('__nayad_route');
    history.replaceState(history.state,'',entry+(params.size?'?'+params:'')+location.hash);
  }
  let current=pageAt(location.pathname)||'home';
  let index=Number(history.state?.nayadIndex)||0;
  let reverting=false;
  function busy(){
    if(window.__nayadCriticalOperation)return true;
    return [...document.querySelectorAll('#modal,[role="dialog"],#loanFormOverlay,.loanContractOverlay,.profileMenuDrawer.open,.nayadSubscriptionRoot.open')]
      .some(el=>!el.closest('.hide,[hidden]')&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden');
  }
  function url(key){return paths[key]+location.search+location.hash;}
  function record(key,replace){
    const state={...(history.state||{}),nayadPage:key,nayadIndex:index};
    history[replace?'replaceState':'pushState'](state,'',url(key));
  }
  function sync(key){
    if(!paths[key]||document.getElementById('app')?.classList.contains('hide'))return;
    if(key!==current){current=key;index++;record(key,false);}
    else if(location.pathname!==paths[key]||!history.state?.nayadPage)record(key,true);
  }
  window.__nayadHasOpenDialog=busy;
  window.__nayadRouter={initialPage:()=>pageAt(location.pathname)||current,sync};
  document.addEventListener('click',event=>{
    if(!event.target.closest('.nav[data-page]')||!busy())return;
    event.preventDefault();event.stopImmediatePropagation();
    window.toast?.('Нээлттэй цонхоо хадгалах эсвэл хаасны дараа хэсэг солино уу.');
  },true);
  window.addEventListener('popstate',event=>{
    if(reverting){reverting=false;return;}
    const next=pageAt(location.pathname)||event.state?.nayadPage||'home';
    const nextIndex=Number(event.state?.nayadIndex)||0;
    if(busy()){
      const delta=index-nextIndex;
      if(delta){reverting=true;history.go(delta);}else record(current,true);
      window.toast?.('Нээлттэй цонхоо хадгалах эсвэл хаасны дараа буцна уу.');return;
    }
    current=next;index=nextIndex;
    if(typeof page!=='undefined')page=next;
    if(typeof selected!=='undefined')selected=null;
    if(!document.getElementById('app')?.classList.contains('hide'))window.render?.();
  });
})();
