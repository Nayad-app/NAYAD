/* Contract amounts are authoritative; unknown principal/interest stay unknown. */
(function(root){
  'use strict';
  const cents=v=>Math.round(Number(v)*100);
  function money(value,allowZero=false){
    const s=String(value??'').replace(/,/g,'').trim();
    if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Мөнгөн дүнг хоёр хүртэл орны бутархайтай оруулна уу.');
    const n=Number(s);if(!Number.isFinite(n)||n>999999999999.99||(allowZero?n<0:n<=0))throw Error('Мөнгөн дүнг зөв оруулна уу.');return cents(n)/100;
  }
  function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number(s.slice(0,4))>=1900&&Number(s.slice(0,4))<=9999&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
  function monthDate(first,offset,day){
    const [y,m]=first.split('-').map(Number),d=new Date(Date.UTC(y,m-1+offset,1));
    const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);
  }
  function generate(d){
    if(!validDate(d.startDate)||!validDate(d.firstDate)||d.firstDate<=d.startDate)throw Error('Анхны төлөлт зээл авсан огнооноос хойш байна.');
    if(!Number.isInteger(d.term)||d.term<1||d.term>600)throw Error('Төлөлтийн тоо 1–600 байна.');
    if(!Number.isInteger(d.paymentDay)||d.paymentDay<1||d.paymentDay>31)throw Error('Төлөх өдөр 1–31 байна.');
    const regular=money(d.regular),last=money(d.last===''?d.regular:d.last);
    const rows=Array.from({length:d.term},(_,i)=>({installment_number:i+1,due_date:i===0?d.firstDate:monthDate(d.firstDate,i,d.paymentDay),total_amount:i===d.term-1?last:regular,principal_amount:null,interest_amount:null,status:'pending',paid_at:null,paid_amount:0}));
    validate(d,rows);return rows;
  }
  function validate(d,rows){
    money(d.principal);if(!validDate(d.startDate))throw Error('Авсан огноог зөв сонгоно уу.');
    if(rows.length!==d.term)throw Error('Хуваарийн мөрийн тоо зөрсөн байна.');
    let prev=d.startDate,principal=0,total=0,allKnown=true;
    rows.forEach((r,i)=>{
      if(r.installment_number!==i+1||!validDate(r.due_date)||r.due_date<=prev)throw Error(`${i+1}-р төлөлтийн огноог шалгана уу. Огноо өсөх дарааллаар байна.`);prev=r.due_date;
      total+=cents(money(r.total_amount));
      if(r.principal_amount==null&&r.interest_amount==null)allKnown=false;
      else{const p=money(r.principal_amount,true),interest=money(r.interest_amount,true);if(cents(p)+cents(interest)!==cents(r.total_amount))throw Error(`${i+1}-р төлөлтийн үндсэн дүн + хүү нийт дүнтэй тэнцэх ёстой.`);principal+=cents(p);}
      if(!['pending','paid'].includes(r.status))throw Error('Төлөлтийн төлөв буруу байна.');
      if(r.status==='paid'&&(!validDate(String(r.paid_at||'').slice(0,10))||String(r.paid_at).slice(0,10)>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ulaanbaatar'}).format(new Date())||String(r.paid_at).slice(0,10)<d.startDate))throw Error(`${i+1}-р төлөлтийн төлсөн огноог шалгана уу.`);
    });
    if(!Number.isSafeInteger(total))throw Error('Нийт төлбөрийн дүн хэт их байна.');
    if(total<cents(d.principal))throw Error('Нийт төлбөр зээлийн үндсэн дүнгээс бага байна.');
    if(principal>cents(d.principal)||(allKnown&&principal!==cents(d.principal)))throw Error('Үндсэн төлбөрүүдийн нийлбэр зээлийн дүнтэй таарахгүй байна.');
    return total/100;
  }
  const api={generate,validate,money,validDate,monthDate};root.NayadLoanSchedule=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
