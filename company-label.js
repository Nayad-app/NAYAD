// NAYAD UI wording: show "Харилцагч" while keeping supplier backend terminology unchanged.
(function(){
  function fixLabels(){
    const sheet=document.getElementById('sheet');
    if(!sheet)return;
    const h2=sheet.querySelector('h2');
    if(h2 && h2.textContent.trim()==='Нийлүүлэгч бүртгэх') h2.textContent='Харилцагч бүртгэх';
    if(h2 && h2.textContent.trim()==='Нийлүүлэгч засах') h2.textContent='Харилцагч засах';
  }
  fixLabels();
  new MutationObserver(fixLabels).observe(document.documentElement,{childList:true,subtree:true});
})();
