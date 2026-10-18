/* Section URLs contain navigation only, never customer or financial data. */
(function(){
  'use strict';
  const paths={home:'/nuur',companies:'/hariltsagch',payments:'/tulbur',loans:'/zeel'};
  const storePath='/delguur_solih';
  const invoiceAt=()=>{const m=location.pathname.match(/^\/padaan\/([a-zA-Z0-9_-]+)\/?$/);return m?m[1]:null;};
  const contactPaths={picker:'/hariltsagch_nemeh',person:'/huvi_hun_burtgeh',organization:'/baiguullaga_burtgeh'};
  const contactAt=()=>Object.keys(contactPaths).find(key=>contactPaths[key]===location.pathname.replace(/\/$/,''));
  const isStorePath=()=>location.pathname.replace(/\/$/,'')===storePath;
  const pageAt=path=>Object.keys(paths).find(key=>paths[key]===path.replace(/\/$/,''));
  const params=new URLSearchParams(location.search),entry=params.get('__nayad_route');
  if(pageAt(entry||'')||entry===storePath||Object.values(contactPaths).includes(entry)||/^\/padaan\/[a-zA-Z0-9_-]+$/.test(entry||'')){
    params.delete('__nayad_route');
    history.replaceState(history.state,'',entry+(params.size?'?'+params:'')+location.hash);
  }
  let current=pageAt(location.pathname)||(contactAt()?'companies':'home');
  let index=Number(history.state?.nayadIndex)||0;
  let reverting=false,restoringHistory=false;
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
  function openStorePicker(){
    if(isStorePath())return;
    index++;
    history.pushState({...(history.state||{}),nayadPage:current,nayadIndex:index,nayadStorePicker:true},'',storePath+location.search+location.hash);
  }
  function closeStorePicker(){if(isStorePath()&&!restoringHistory)record(current,true);}
  function restoreStorePicker(){
    if(isStorePath()&&!document.getElementById('app')?.classList.contains('hide')&&!document.getElementById('modal')?.classList.contains('storePickerModal'))window.showNayadStorePicker?.();
  }
  function openContact(kind){
    const path=contactPaths[kind];if(!path||contactAt()===kind)return;
    index++;
    history.pushState({...(history.state||{}),nayadPage:current,nayadIndex:index},'',path+location.search+location.hash);
  }
  function closeContact(){if(contactAt()&&!restoringHistory)record(current,true);}
  function restoreContact(){
    const kind=contactAt(),modal=document.getElementById('modal');
    if(!kind||document.getElementById('app')?.classList.contains('hide')||modal?.classList.contains('contactRegistrationModal'))return;
    if(kind==='picker')window.showContactTypePicker?.();else window.showContactForm?.(kind);
  }
  function openInvoice(id){const path='/padaan/'+encodeURIComponent(id);if(location.pathname===path)return;index++;history.pushState({...(history.state||{}),nayadPage:current,nayadIndex:index},'',path+location.search);}
  function closeInvoice(){if(invoiceAt()&&!restoringHistory)record(current,true);}
  let restoringInvoice=false;
  async function restoreInvoice(){const id=invoiceAt();if(!id||restoringInvoice||busy()||document.getElementById('app')?.classList.contains('hide')||document.getElementById('modal')?.classList.contains('invoiceDetailModal'))return;restoringInvoice=true;try{await window.showInvoiceDetails?.(id);}finally{restoringInvoice=false;}}
  function sync(key){
    if(!paths[key]||document.getElementById('app')?.classList.contains('hide'))return;
    if(invoiceAt()){queueMicrotask(restoreInvoice);return;}
    if(contactAt()){queueMicrotask(restoreContact);return;}
    if(isStorePath()){queueMicrotask(restoreStorePicker);return;}
    if(key!==current){current=key;index++;record(key,false);}
    else if(location.pathname!==paths[key]||!history.state?.nayadPage)record(key,true);
  }
  window.__nayadHasOpenDialog=busy;
  window.__nayadRouter={initialPage:()=>pageAt(location.pathname)||current,sync,openInvoice,closeInvoice,restoreInvoice,openContact,closeContact,restoreContact,openStorePicker,closeStorePicker,restoreStorePicker};
  document.addEventListener('click',event=>{
    if(!event.target.closest('.nav[data-page]')||!busy())return;
    event.preventDefault();event.stopImmediatePropagation();
    window.toast?.('Нээлттэй цонхоо хадгалах эсвэл хаасны дараа хэсэг солино уу.');
  },true);
  window.addEventListener('popstate',event=>{
    if(reverting){reverting=false;return;}
    if(document.getElementById('modal')?.classList.contains('invoiceDetailModal')&&!window.__nayadCriticalOperation){restoringHistory=true;window.closeSheet?.();restoringHistory=false;}
    if(invoiceAt()&&!busy()){index=Number(event.state?.nayadIndex)||0;restoreInvoice();return;}
    if(document.getElementById('modal')?.classList.contains('storePickerModal')&&!window.__nayadCriticalOperation){restoringHistory=true;window.closeSheet?.();restoringHistory=false;}
    if(isStorePath()&&!busy()){index=Number(event.state?.nayadIndex)||0;restoreStorePicker();return;}
    if(contactAt()&&!busy()){index=Number(event.state?.nayadIndex)||0;restoreContact();return;}
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
