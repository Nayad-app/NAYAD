/* NAYAD contact types — keeps the supplier table/API compatible while the UI
   supports people and organizations as equal debt contacts. */
(function(){
  const PERSON='person', ORGANIZATION='organization';
  const validType=value=>value===PERSON||value===ORGANIZATION?value:ORGANIZATION;
  const typeLabel=value=>validType(value)===PERSON?'Хувь хүн':'Байгууллага';
  const esc=value=>typeof window.escapeHtml==='function'?window.escapeHtml(value??''):String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const icon=value=>validType(value)===PERSON
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5"></circle><path d="M5 20v-1.2a5.8 5.8 0 0 1 5.8-5.8h2.4a5.8 5.8 0 0 1 5.8 5.8V20"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21M15 9h3.5A1.5 1.5 0 0 1 20 10.5V21M8 8h3M8 12h3M8 16h3M17 13h1M17 17h1M2 21h20"></path></svg>';
  const avatar=value=>`<div class="contactAvatar ${validType(value)}">${icon(value)}</div>`;
  const fieldValue=id=>typeof window.v==='function'?window.v(id):document.getElementById(id)?.value?.trim?.()||'';
  const input=(id,label,value='',placeholder='',type='text')=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`;
  const area=(id,label,value='',placeholder='')=>`<div class="field"><label for="${id}">${label}</label><textarea id="${id}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></div>`;
  const bankHolder=(id,value='')=>input(id,'Данс эзэмшигчийн нэр *',value,'Нэрээ оруулна уу');
  const bankFields=(prefix,contact)=>`${window.bankSelect(prefix+'Bank','Банк *',contact?.bank||'')}${window.bankAccountField(prefix+'BankAccount',contact?.bankAccount||'')}${bankHolder(prefix+'BankAccountHolder',contact?.bankAccountHolder||'')}`;
  const requireBank=(bank,account,holder)=>{
    if(!bank||!account||!holder){window.toast('Банк, дансны дугаар, данс эзэмшигчийн нэрийг бөглөнө үү.');return false;}
    return true;
  };
  function injectStyle(){
    if(document.getElementById('nayadContactTypeStyle'))return;
    const style=document.createElement('style');style.id='nayadContactTypeStyle';style.textContent=`
      .contactTypeHint{color:var(--muted);font-size:12px;font-weight:700;margin:5px 0 12px}
      .contactTypePicker{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0 4px}
      .contactTypeOption{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:22px 10px 18px;display:flex;flex-direction:column;align-items:center;gap:9px;color:var(--text)}
      .contactTypeOption:active{border-color:#F0B900;background:var(--yellow-soft)}
      .contactTypeOption svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      .contactTypeOption.person svg{color:#20A85A}.contactTypeOption.organization svg{color:#6F7470}
      .contactTypeOption b{font-size:13px}.contactTypeOption small{color:var(--muted);font-size:10px}
      .contactAvatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto}
      .contactAvatar svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .contactAvatar.person{background:var(--green-soft);color:var(--green)}.contactAvatar.organization{background:#F0F1EF;color:#6F7470}
      .contactTypeText{font-size:10px;color:var(--muted);margin-left:5px}
      .contactDetailType{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);font-weight:700}
      .contactDetailType svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    `;document.head.appendChild(style);
  }
  function showContactTypePicker(){
    injectStyle();
    window.sheet(`<h2>Харилцагч бүртгэх</h2><div class="contactTypeHint">Харилцагчийн төрөл</div><div class="contactTypePicker"><button type="button" class="contactTypeOption person" onclick="showContactForm('person')">${icon(PERSON)}<b>Хувь хүн</b><small>Хувийн харилцагч</small></button><button type="button" class="contactTypeOption organization" onclick="showContactForm('organization')">${icon(ORGANIZATION)}<b>Байгууллага</b><small>Дэлгүүр, компани</small></button></div>`);
  }
  function showContactForm(type,contact={}){
    injectStyle();
    const kind=validType(type),person=kind===PERSON,prefix=contact.id?'e':'new';
    const title=person?'Хувь хүн бүртгэх':'Байгууллага бүртгэх';
    const nameLabel=person?'Нэр *':'Байгууллагын нэр *';
    const fields=person
      ? input(prefix+'Name',nameLabel,contact.name||'',person?'Нэрээ оруулна уу':'Жишээ: MCS Ундаа')
        +input(prefix+'Phone','Утас *',contact.phone||'', 'Утасны дугаараа оруулна уу','tel')
        +input(prefix+'Address','Хаяг',contact.address||'','Хаягаа оруулна уу')
        +area(prefix+'Note','Нэмэлт тэмдэглэл',contact.note||'','Шаардлагатай зүйлээ тэмдэглэнэ үү')
      : input(prefix+'Name',nameLabel,contact.name||'','Жишээ: MCS Ундаа')
        +input(prefix+'Phone','Утас *',contact.phone||'','Утасны дугаараа оруулна уу','tel')
        +input(prefix+'Address','Хаяг',contact.address||'','Хаягаа оруулна уу')
        +input(prefix+'Director','Захирал',contact.director||'','Нэрээ оруулна уу')
        +input(prefix+'DirectorPhone','Захирлын утас',contact.directorPhone||'','Утасны дугаараа оруулна уу','tel')
        +input(prefix+'Sales','Худалдааны төлөөлөгч',contact.sales||'','Нэрээ оруулна уу')
        +input(prefix+'SalesPhone','ХТ-ийн утас',contact.salesPhone||'','Утасны дугаараа оруулна уу','tel')
        +area(prefix+'Note','Нэмэлт тэмдэглэл',contact.note||'','Шаардлагатай зүйлээ тэмдэглэнэ үү');
    const status=contact.id?`<div class="field"><label for="eStatus">Төлөв</label><select id="eStatus"><option value="active" ${contact.status!=='inactive'?'selected':''}>Идэвхтэй</option><option value="inactive" ${contact.status==='inactive'?'selected':''}>Идэвхгүй</option></select></div>`:'';
    const hidden=`<input id="${prefix}ContactType" type="hidden" value="${kind}">`;
    const actions=`<div class="actions"><button class="secondary" onclick="closeSheet()">Болих</button><button class="primary" onclick="${contact.id?'saveEdit':'saveCompany'}()">Хадгалах</button></div>`;
    const remove=contact.id&&contact.status==='inactive'?`<button class="secondary full" style="margin-top:10px;color:#c72c2c;background:#ffe2e2" onclick="deleteCompany(${contact.id})">Устгах</button>`:'';
    window.sheet(`<h2>${title}</h2>${hidden}${fields}<div class="title" style="margin-top:20px">БАНКНЫ МЭДЭЭЛЭЛ</div>${bankFields(prefix,contact)}${status}${actions}${remove}`);
  }
  function companyIconLabel(contact){const type=validType(contact?.contactType);return `<span class="contactDetailType">${icon(type)}${typeLabel(type)}</span>`;}
  function card(contact,pay=false){
    const c=contact||{},type=validType(c.contactType);
    return `<div class="card" onclick="company(${c.id})"><div class="row"><div class="company">${avatar(type)}<div><b>${esc(c.name)}</b><span>${typeLabel(type)}<span class="contactTypeText">· ${c.invoices?.length||0} падаан</span></span></div></div><div class="amount redText">${window.money(c.debt)}${pay?`<br><button class="primary" style="padding:6px 9px;margin-top:5px" onclick="event.stopPropagation();payment(${c.id})">Төлөх</button>`:''}</div></div></div>`;
  }
  function companies(){
    window.sync();const active=data.companies.filter(c=>c.status!=='inactive'),inactive=data.companies.filter(c=>c.status==='inactive');
    return `<div class="row"><div><div class="hello">Өглөгийн бүртгэл</div><div class="name">Харилцагчид</div></div><button class="primary" onclick="addCompany()">＋</button></div><input class="search" placeholder="⌕ Харилцагч хайх..." oninput="filter(this.value)"><div class="title">ИДЭВХТЭЙ</div><div id="list">${active.map(c=>card(c)).join('')||'<div class="card sub">Идэвхтэй харилцагч алга.</div>'}</div><div class="title">ИДЭВХГҮЙ</div><div id="inactiveList">${inactive.map(c=>card(c)).join('')||'<div class="card sub">Идэвхгүй харилцагч алга.</div>'}</div>`;
  }
  function company(id){
    selected=data.companies.find(c=>c.id===id);if(!selected)return;window.sync();const c=selected,type=validType(c.contactType),person=type===PERSON;
    const details=person
      ?`<div class="invoice"><div><small>Утас</small><b>${esc(c.phone||'—')}</b></div>${window.tel(c.phone)}</div><div class="invoice"><div><small>Хаяг</small><b>${esc(c.address||'—')}</b></div></div>`
      :`<div class="invoice"><div><small>Утас</small><b>${esc(c.phone||'—')}</b></div>${window.tel(c.phone)}</div><div class="invoice"><div><small>Хаяг</small><b>${esc(c.address||'—')}</b></div></div><div class="invoice"><div><small>Захирал</small><b>${esc(c.director||'—')}</b></div>${window.tel(c.directorPhone)}</div><div class="invoice"><div><small>Худалдааны төлөөлөгч</small><b>${esc(c.sales||'—')}</b></div>${window.tel(c.salesPhone)}</div>`;
    const note=c.note?`<div class="invoice"><div><small>Нэмэлт тэмдэглэл</small><b>${esc(c.note)}</b></div></div>`:'';
    const bank=`<div class="invoice"><div><small>Банк</small><b>${esc(c.bank||'—')}</b></div></div><div class="invoice"><div><small>Дансны дугаар</small><b>${esc(c.bankAccount||'—')}</b></div></div><div class="invoice"><div><small>Данс эзэмшигчийн нэр</small><b>${esc(c.bankAccountHolder||'—')}</b></div></div>`;
    document.getElementById('content').innerHTML=`<button class="back" onclick="page='companies';render()">← Буцах</button><div class="center">${avatar(type)}<h2 style="margin:8px 0 2px">${esc(c.name)}</h2><div>${companyIconLabel(c)}</div><div class="sub">${c.status==='inactive'?'⚪ Идэвхгүй':'🟢 Идэвхтэй'}</div><div class="bigAmount">${window.money(c.debt)}</div><div class="sub">Нийт өр</div></div><div class="sectionTitle">Харилцагчийн мэдээлэл</div><div class="card">${details}${note}${bank}</div><div class="sectionTitle">Падаанууд</div><div class="card">${(c.invoices||[]).map(i=>{const count=Array.isArray(i.image_urls)?i.image_urls.length:(i.image_url?1:0);return `<div class="invoice" onclick="viewInvoiceImages('${String(i.id||'').replace(/'/g,"\\'")}')" style="cursor:${count?'pointer':'default'}"><div><small>${esc(i.date)} · ${esc(i.no)}</small><b>${window.money(i.amount)}</b>${count?`<span style="display:block;color:#777;font-size:10px;margin-top:4px">🖼 ${count} хуудастай зураг · үзэх</span>`:'<span style="display:block;color:#aaa;font-size:10px;margin-top:4px">Зураггүй</span>'}</div><div class="${i.amount-i.paid>0?'redText':'greenText'}">${i.amount-i.paid>0?window.money(i.amount-i.paid):'Төлөгдсөн'}</div></div>`}).join('')}</div><button class="primary full" onclick="invoice(${c.id})">＋ Падаан нэмэх</button><button class="secondary full" onclick="payment(${c.id})">Төлбөр бүртгэх</button><button type="button" class="secondary full" onclick="event.stopPropagation();window.editCompany(Number(${c.id}))">✎ Мэдээлэл засах</button>`;
  }
  function readContact(prefix){
    return {contactType:validType(fieldValue(prefix+'ContactType')),name:fieldValue(prefix+'Name'),phone:fieldValue(prefix+'Phone'),address:fieldValue(prefix+'Address'),director:fieldValue(prefix+'Director'),directorPhone:fieldValue(prefix+'DirectorPhone'),sales:fieldValue(prefix+'Sales'),salesPhone:fieldValue(prefix+'SalesPhone'),note:fieldValue(prefix+'Note'),bank:fieldValue(prefix+'Bank'),bankAccount:fieldValue(prefix+'BankAccount').toUpperCase(),bankAccountHolder:fieldValue(prefix+'BankAccountHolder')};
  }
  function saveCompany(){
    const draft=readContact('new');if(!draft.name)return window.toast('Нэр эсвэл байгууллагын нэрийг оруулна уу.');if(!draft.phone)return window.toast('Утасны дугаараа оруулна уу.');if(!requireBank(draft.bank,draft.bankAccount,draft.bankAccountHolder))return;
    if(data.companies.some(c=>String(c.name||'').trim().toLowerCase()===draft.name.toLowerCase()))return window.toast('Ийм нэртэй харилцагч бүртгэлтэй байна.');
    data.companies.push({id:Date.now(),...draft,status:'active',color:draft.contactType===PERSON?'green':'blue',invoices:[]});window.save();window.closeSheet();window.render();window.toast('Харилцагч бүртгэгдлээ.');
  }
  function editCompany(id){selected=data.companies.find(c=>c.id===id);if(!selected)return;showContactForm(validType(selected.contactType),selected);}
  function saveEdit(){
    if(!selected)return;const draft=readContact('e');if(!draft.name)return window.toast('Нэр эсвэл байгууллагын нэрийг оруулна уу.');if(!draft.phone)return window.toast('Утасны дугаараа оруулна уу.');if(!requireBank(draft.bank,draft.bankAccount,draft.bankAccountHolder))return;
    if(data.companies.some(c=>c!==selected&&String(c.name||'').trim().toLowerCase()===draft.name.toLowerCase()))return window.toast('Ийм нэртэй харилцагч бүртгэлтэй байна.');
    Object.assign(selected,draft,{status:fieldValue('eStatus')||'active'});window.save();window.closeSheet();page='companies';window.render();window.toast('Мэдээлэл шинэчлэгдлээ.');
  }
  window.addCompany=showContactTypePicker;window.showContactTypePicker=showContactTypePicker;window.showContactForm=showContactForm;window.card=card;window.companies=companies;window.company=company;window.saveCompany=saveCompany;window.editCompany=editCompany;window.saveEdit=saveEdit;
  injectStyle();
})();
