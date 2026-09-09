/* NAYAD granular member permissions — UI guard layered on top of database RLS. */
(function(){
  if(window.__nayadMemberPermissionsV1)return;
  window.__nayadMemberPermissionsV1=true;

  const pageRules={companies:['customers','view'],payments:['payments','view'],loans:['loans','view']};
  const editActions={
    customers:['addCompany','showContactTypePicker','selectContactType','showContactForm','saveCompany','editCompany','saveEdit'],
    invoices:['invoice','__saveCloudInvoice','editConfirmedInvoice','saveConfirmedInvoiceRevision','showInvoiceAgreement','saveInvoiceAgreement'],
    payments:['payment','savePayment','reviewPaymentCenter','commitPaymentCenter','showPaymentReversal','reversePayment'],
    loans:['showLoanCreate','showLoanEdit','saveLoan','markLoanInstallmentPaid']
  };
  const ownerActions={customers:['deleteCompany'],invoices:['showInvoiceDeleteConfirm','deleteInvoiceWithHistory']};
  const wrapped=new Set();
  let lastRefresh=0;

  function can(module,action='view'){
    return typeof window.__nayadCan==='function'&&window.__nayadCan(module,action);
  }
  function notify(message){if(typeof window.toast==='function')window.toast(message);}
  function guard(name,module,action){
    if(wrapped.has(name)||typeof window[name]!=='function')return;
    const original=window[name];
    window[name]=function(){
      if(!can(module,action)){
        notify(action==='owner'?'Энэ үйлдлийг зөвхөн дэлгүүрийн эзэн хийх эрхтэй.':'Танд энэ хэсгийг засах эрх байхгүй.');
        return;
      }
      return original.apply(this,arguments);
    };
    wrapped.add(name);
  }
  function installGuards(){
    Object.entries(editActions).forEach(([module,names])=>names.forEach(name=>guard(name,module,'edit')));
    Object.entries(ownerActions).forEach(([module,names])=>names.forEach(name=>guard(name,module,'owner')));
  }
  function pageAllowed(value){
    if(value==='reports')return can('customers','view')||can('invoices','view')||can('payments','view');
    const rule=pageRules[value];return !rule||can(rule[0],rule[1]);
  }
  function hide(selector,hidden){document.querySelectorAll(selector).forEach(element=>{element.classList.toggle('nayadPermissionHidden',hidden);});}
  function apply(){
    installGuards();
    document.querySelectorAll('.nav[data-page]').forEach(button=>{button.classList.toggle('nayadPermissionHidden',!pageAllowed(button.dataset.page));});
    hide('[onclick*="addCompany"],[onclick*="editCompany"],[onclick*="saveCompany"],[onclick*="saveEdit"]',!can('customers','edit'));
    hide('[onclick*="invoice("],[onclick*="editConfirmedInvoice"],[onclick*="showInvoiceAgreement"]',!can('invoices','edit'));
    hide('[onclick*="payment("],[onclick*="reviewPaymentCenter"],[onclick*="showPaymentReversal"]',!can('payments','edit'));
    hide('[onclick*="showLoanCreate"],[onclick*="showLoanEdit"],[onclick*="markLoanInstallmentPaid"]',!can('loans','edit'));
    hide('[onclick*="deleteCompany"]',!can('customers','owner'));
    hide('[onclick*="showInvoiceDeleteConfirm"],[onclick*="deleteInvoiceWithHistory"]',!can('invoices','owner'));
    hide('[onclick*="profileMenuAction(\'share\')"]',!can('customers','owner'));
  }
  function refreshPermissions(){
    const now=Date.now();if(now-lastRefresh<8000)return;lastRefresh=now;
    if(typeof window.__nayadRefreshStores==='function')window.__nayadRefreshStores({sync:true,close:false}).then(apply).catch(()=>{});
  }

  const style=document.createElement('style');
  style.id='nayad-member-permission-styles';
  style.textContent='.nayadPermissionHidden{display:none!important}';
  document.head.appendChild(style);

  const baseRender=window.render;
  if(typeof baseRender==='function')window.render=function(){
    if(typeof page!=='undefined'&&!pageAllowed(page))page='home';
    const result=baseRender.apply(this,arguments);apply();return result;
  };
  const baseSheet=window.sheet;
  if(typeof baseSheet==='function')window.sheet=function(){
    const result=baseSheet.apply(this,arguments);setTimeout(apply,0);return result;
  };
  window.__nayadApplyMemberPermissions=apply;
  installGuards();
  window.addEventListener('focus',refreshPermissions);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshPermissions();});
  window.addEventListener('load',()=>setTimeout(()=>{installGuards();apply();refreshPermissions();},1400));
  if(typeof window.setInterval==='function')window.setInterval(refreshPermissions,60000);
})();
