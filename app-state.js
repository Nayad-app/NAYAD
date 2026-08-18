/* NAYAD canonical client state — every cloud layer commits through this API. */
(function(){
  const LEGACY_KEY='NAYAD_DATA_V2';
  const USER_DATA_PREFIX='NAYAD_DATA_V3:';

  function key(){
    if(typeof window.__nayadStoreDataKey==='function')return window.__nayadStoreDataKey();
    return window.__nayadUser?.id ? USER_DATA_PREFIX+window.__nayadUser.id : LEGACY_KEY;
  }

  function empty(){return {companies:[],payments:[]};}

  function normalize(next){
    const state=next&&typeof next==='object'?next:empty();
    state.companies=Array.isArray(state.companies)?state.companies:[];
    state.payments=Array.isArray(state.payments)?state.payments:[];
    for(const company of state.companies){
      company.invoices=Array.isArray(company.invoices)?company.invoices:[];
      company.debt=company.invoices.reduce((sum,invoice)=>{
        const amount=Math.max(Number(invoice.amount)||0,0);
        const paid=Math.min(Math.max(Number(invoice.paid)||0,0),amount);
        invoice.amount=amount;
        invoice.paid=paid;
        return sum+(amount-paid);
      },0);
    }
    return state;
  }

  function read(){
    try{return normalize(JSON.parse(localStorage.getItem(key()))||empty());}
    catch(_){return empty();}
  }

  function persist(next){
    const state=normalize(next);
    localStorage.setItem(key(),JSON.stringify(state));
    return state;
  }

  function commit(next,options){
    const state=persist(next);
    const renderNow=options?.render!==false;
    try{
      const selectedId=typeof selected!=='undefined'&&selected?selected.id:null;
      if(typeof data!=='undefined')data=state;
      if(typeof selected!=='undefined'){
        selected=selectedId?(state.companies.find(c=>String(c.id)===String(selectedId))||null):null;
      }
      if(renderNow&&typeof render==='function')render();
    }catch(e){console.warn('NAYAD state commit:',e);}
    return state;
  }

  window.__nayadState={read,persist,commit,normalize};
})();
