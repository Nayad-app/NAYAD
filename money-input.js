/* NAYAD money input helpers — thousands separators without changing numeric values. */
(function(){
  const MONEY_SELECTOR=[
    'input[data-money-input]',
    'input.allocationAmount',
    'input#iAmount',
    'input#pAmount',
    'input#cloudIAmount',
    'input#reviseInvoiceAmount',
    'input#agreementAmount'
  ].join(',');

  function formatMoneyInput(value){
    const raw=String(value??'').replace(/,/g,'').replace(/[^\d.]/g,'');
    if(!raw)return '';
    const decimalAt=raw.indexOf('.');
    const wholeRaw=(decimalAt<0?raw:raw.slice(0,decimalAt)).replace(/\D/g,'');
    const fraction=decimalAt<0?'':raw.slice(decimalAt+1).replace(/\D/g,'').slice(0,2);
    const whole=(wholeRaw||'0').replace(/^0+(?=\d)/,'');
    const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
    return decimalAt<0?grouped:`${grouped}.${fraction}`;
  }

  function parseMoneyInput(value){
    const parsed=Number(String(value??'').replace(/,/g,'').trim());
    return Number.isFinite(parsed)?parsed:0;
  }

  function matchesMoneyInput(input){
    return Boolean(input&&typeof input.matches==='function'&&input.matches(MONEY_SELECTOR));
  }

  function caretForFormattedValue(formatted,leftOfCaret){
    const rawLeft=String(leftOfCaret??'').replace(/,/g,'');
    const decimalAt=rawLeft.indexOf('.');
    if(decimalAt>=0){
      const formattedDecimalAt=formatted.indexOf('.');
      if(formattedDecimalAt<0)return formatted.length;
      const fractionDigits=rawLeft.slice(decimalAt+1).replace(/\D/g,'').length;
      return Math.min(formattedDecimalAt+1+fractionDigits,formatted.length);
    }
    const wholeDigits=rawLeft.replace(/\D/g,'').length;
    if(!wholeDigits)return 0;
    let seen=0;
    for(let index=0;index<formatted.length;index++){
      if(/\d/.test(formatted[index]))seen++;
      if(seen===wholeDigits)return index+1;
    }
    return formatted.length;
  }

  function formatMoneyInputElement(input,preserveCaret=true){
    if(!input)return '';
    const oldValue=String(input.value??'');
    const caret=Number.isInteger(input.selectionStart)?input.selectionStart:oldValue.length;
    const formatted=formatMoneyInput(oldValue);
    input.value=formatted;
    if(preserveCaret&&typeof input.setSelectionRange==='function'){
      const nextCaret=caretForFormattedValue(formatted,oldValue.slice(0,caret));
      try{input.setSelectionRange(nextCaret,nextCaret);}catch(_){ }
    }
    return formatted;
  }

  function prepareMoneyInputs(root){
    if(typeof document==='undefined')return;
    const scope=root||document;
    const inputs=[];
    if(matchesMoneyInput(scope))inputs.push(scope);
    if(typeof scope.querySelectorAll==='function')inputs.push(...scope.querySelectorAll(MONEY_SELECTOR));
    inputs.forEach(input=>{
      input.type='text';
      input.inputMode='decimal';
      input.autocomplete='off';
      formatMoneyInputElement(input,false);
    });
  }

  window.__nayadFormatMoneyInput=formatMoneyInput;
  window.__nayadParseMoneyInput=parseMoneyInput;
  window.__nayadFormatMoneyInputElement=formatMoneyInputElement;
  window.__nayadPrepareMoneyInputs=prepareMoneyInputs;

  if(typeof document!=='undefined'&&typeof document.addEventListener==='function'){
    document.addEventListener('input',event=>{
      if(matchesMoneyInput(event.target))formatMoneyInputElement(event.target,true);
    },true);
    document.addEventListener('focusin',event=>{
      if(matchesMoneyInput(event.target))formatMoneyInputElement(event.target,false);
    },true);
  }
})();
