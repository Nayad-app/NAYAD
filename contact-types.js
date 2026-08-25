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
      .contactTypePicker{display:flex;justify-content:center;gap:48px;margin:8px 0 4px}
      .contactTypeOption{appearance:none;background:transparent;border:0;padding:10px 2px;display:flex;flex-direction:column;align-items:center;gap:9px;color:var(--text);min-width:92px}
      .contactTypeOption:active .contactTypeIcon{transform:scale(.94)}
      .contactTypeIcon{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:1px solid var(--line);transition:transform .15s ease,border-color .15s ease,background .15s ease}
      .contactTypeOption svg{width:32px;height:32px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      .contactTypeOption.person .contactTypeIcon{color:#20A85A}.contactTypeOption.organization .contactTypeIcon{color:#8B8F8B}
      .contactTypeOption b{font-size:13px}
      .contactTypeOption.selected .contactTypeIcon,.contactTypeOption.person.selected .contactTypeIcon,.contactTypeOption.organization.selected .contactTypeIcon{background:var(--yellow);border-color:var(--yellow);color:#111;transform:scale(.96)}
      .contactTypeOption.selected b{color:var(--yellow)}
      .contactAvatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto}
      .contactAvatar svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .contactAvatar.person{background:var(--green-soft);color:var(--green)}.contactAvatar.organization{background:#F0F1EF;color:#6F7470}
      .contactTypeText{font-size:10px;color:var(--muted);margin-left:5px}
      .contactDetailType{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);font-weight:700}
      .contactDetailType svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .contactListHead{margin-bottom:18px}.contactStoreMeta{display:block;margin-top:7px;color:var(--muted);font-size:12px;font-weight:650}
      .contactSearch{position:relative;margin-bottom:12px}.contactSearch svg{position:absolute;left:15px;top:50%;width:20px;height:20px;transform:translateY(-50%);fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round}.contactSearch .search{padding-left:45px;margin:0}
      .contactFilters{display:flex;gap:8px;overflow-x:auto;padding:0 0 4px;scrollbar-width:none}.contactFilters::-webkit-scrollbar{display:none}.contactFilter{flex:0 0 auto;padding:9px 16px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--text);font-size:12px;font-weight:750}.contactFilter.selected{background:var(--yellow);border-color:var(--yellow);color:#111}
      .contactListTitle{margin:18px 3px 10px;color:var(--muted);font-size:10px;font-weight:850;letter-spacing:.25px}.contactList{display:flex;flex-direction:column;gap:9px;margin:0 0 14px}
      .contactListRow{position:relative;padding:14px;background:var(--surface);border:1px solid var(--line);border-radius:17px;box-shadow:var(--shadow-sm);cursor:pointer}.contactListRow.inactive{opacity:.72}.contactListRow:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}
      .contactListMain{display:grid;grid-template-columns:42px minmax(0,1fr) 18px;gap:10px;align-items:center}.contactListIdentity{min-width:0}.contactListIdentity b,.contactListIdentity span{display:block}.contactListIdentity b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.contactListIdentity span{margin-top:4px;color:var(--muted);font-size:10px}.contactListArrow{width:9px;height:9px;border-right:2px solid var(--muted);border-top:2px solid var(--muted);transform:rotate(45deg)}
      .contactListBalance{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}.contactListBalance small{color:var(--muted);font-size:10px}.contactListBalance b{font-size:14px}.contactListBalance b.hasDebt{color:var(--red)}
      .contactInactiveBadge{display:inline-block!important;margin-left:5px!important;color:var(--muted)!important;font-size:9px!important}.contactListEmpty{padding:25px 14px;color:var(--muted);font-size:12px;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:17px}
      .contactAddButton{width:100%;margin-top:13px;padding:15px;border:0;border-radius:15px;background:var(--yellow);color:#111;font-size:13px;font-weight:850}
      html.nightMode .contactListRow,html.nightMode .contactFilter,html.nightMode .contactListEmpty{background:#1D1D1B;border-color:#3C3C38}html.nightMode .contactFilter.selected{background:var(--yellow);border-color:var(--yellow);color:#111}
    `;document.head.appendChild(style);
  }
  let contactTypeSelectionTimer=0;
  function selectContactType(type){
    const kind=validType(type),options=[...document.querySelectorAll('.contactTypeOption')];
    options.forEach(option=>{const chosen=option.dataset.contactType===kind;option.classList.toggle('selected',chosen);option.setAttribute('aria-pressed',String(chosen));});
    if(contactTypeSelectionTimer&&typeof window.clearTimeout==='function')window.clearTimeout(contactTypeSelectionTimer);
    contactTypeSelectionTimer=window.setTimeout(()=>{const modal=document.getElementById('modal');if(modal?.classList?.contains?.('hide'))return;showContactForm(kind);},160);
  }
  function showContactTypePicker(){
    injectStyle();
    window.sheet(`<h2>Харилцагч бүртгэх</h2><div class="contactTypeHint">Харилцагчийн төрөл</div><div class="contactTypePicker"><button type="button" class="contactTypeOption person" data-contact-type="person" aria-pressed="false" onclick="selectContactType('person')"><span class="contactTypeIcon">${icon(PERSON)}</span><b>Хувь хүн</b></button><button type="button" class="contactTypeOption organization" data-contact-type="organization" aria-pressed="false" onclick="selectContactType('organization')"><span class="contactTypeIcon">${icon(ORGANIZATION)}</span><b>Байгууллага</b></button></div>`);
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
  const phoneLabel=value=>{
    const digits=String(value||'').replace(/\D/g,'').replace(/^976(?=\d{8}$)/,'');
    return digits.length===8?digits.slice(0,4)+' '+digits.slice(4):String(value||'').trim();
  };
  function contactListRow(contact){
    const c=contact||{},type=validType(c.contactType),debt=Math.max(Number(c.debt)||0,0),phone=phoneLabel(c.phone);
    return `<div class="contactListRow ${c.status==='inactive'?'inactive':''}" role="button" tabindex="0" onclick="company(${c.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();company(${c.id})}"><div class="contactListMain">${avatar(type)}<div class="contactListIdentity"><b>${esc(c.name)}</b><span>${typeLabel(type)}${phone?' · '+esc(phone):''}${c.status==='inactive'?'<i class="contactInactiveBadge">· Идэвхгүй</i>':''}</span></div><span class="contactListArrow" aria-hidden="true"></span></div><div class="contactListBalance"><small>${debt?'Нийт үлдэгдэл':'Тооцоогүй'}</small>${debt?`<b class="hasDebt">${window.money(debt)}</b>`:''}</div></div>`;
  }
  const emptyList=message=>`<div class="contactListEmpty">${message}</div>`;
  let contactListType='all',contactListQuery='';
  function filteredContacts(){
    const q=contactListQuery.trim().toLowerCase().replace(/\s/g,'');
    return (data.companies||[]).filter(contact=>{
      const type=validType(contact.contactType);
      if(contactListType!=='all'&&type!==contactListType)return false;
      if(!q)return true;
      const searchable=[contact.name,contact.phone,contact.directorPhone,contact.salesPhone].map(value=>String(value||'').toLowerCase().replace(/\s/g,'')).join(' ');
      return searchable.includes(q);
    }).sort((a,b)=>(a.status==='inactive')-(b.status==='inactive')||String(a.name||'').localeCompare(String(b.name||''),'mn'));
  }
  function renderContactList(){
    const list=document.getElementById('contactUnifiedList');if(!list)return;
    const matches=filteredContacts();list.innerHTML=matches.map(contactListRow).join('')||emptyList('Илэрц олдсонгүй.');
  }
  function companies(){
    window.sync();
    const storeName=window.__nayadActiveStore?.name||'Сонгосон дэлгүүр',count=(data.companies||[]).length;
    const filters=[['all','Бүгд'],[PERSON,'Хувь хүн'],[ORGANIZATION,'Байгууллага']];
    return `<div class="contactListHead"><div class="name">Харилцагчид</div><span class="contactStoreMeta">${esc(storeName)} · ${count} харилцагч</span></div><div class="contactSearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 5 5"></path></svg><input class="search" value="${esc(contactListQuery)}" placeholder="Нэр эсвэл утасны дугаараар хайх" oninput="filter(this.value)"></div><div class="contactFilters">${filters.map(([value,label])=>`<button type="button" class="contactFilter ${contactListType===value?'selected':''}" data-contact-filter="${value}" onclick="setContactListFilter('${value}')">${label}</button>`).join('')}</div><div class="contactListTitle">НЭГДСЭН ЖАГСААЛТ</div><div id="contactUnifiedList" class="contactList">${filteredContacts().map(contactListRow).join('')||emptyList('Харилцагч бүртгэгдээгүй байна.')}</div><button type="button" class="contactAddButton" onclick="addCompany()">+ ХАРИЛЦАГЧ НЭМЭХ</button>`;
  }
  function filterContacts(query){
    contactListQuery=String(query||'');renderContactList();
  }
  function setContactListFilter(type){
    contactListType=type==='all'?'all':validType(type);
    document.querySelectorAll('[data-contact-filter]').forEach(button=>button.classList.toggle('selected',button.dataset.contactFilter===contactListType));
    renderContactList();
  }
  function company(id){
    selected=data.companies.find(c=>c.id===id);if(!selected)return;window.sync();const c=selected,type=validType(c.contactType),person=type===PERSON;
    const details=person
      ?`<div class="invoice"><div><small>Утас</small><b>${esc(c.phone||'—')}</b></div>${window.tel(c.phone)}</div><div class="invoice"><div><small>Хаяг</small><b>${esc(c.address||'—')}</b></div></div>`
      :`<div class="invoice"><div><small>Утас</small><b>${esc(c.phone||'—')}</b></div>${window.tel(c.phone)}</div><div class="invoice"><div><small>Хаяг</small><b>${esc(c.address||'—')}</b></div></div><div class="invoice"><div><small>Захирал</small><b>${esc(c.director||'—')}</b></div>${window.tel(c.directorPhone)}</div><div class="invoice"><div><small>Худалдааны төлөөлөгч</small><b>${esc(c.sales||'—')}</b></div>${window.tel(c.salesPhone)}</div>`;
    const note=c.note?`<div class="invoice"><div><small>Нэмэлт тэмдэглэл</small><b>${esc(c.note)}</b></div></div>`:'';
    const bank=`<div class="invoice"><div><small>Банк</small><b>${esc(c.bank||'—')}</b></div></div><div class="invoice"><div><small>Дансны дугаар</small><b>${esc(c.bankAccount||'—')}</b></div></div><div class="invoice"><div><small>Данс эзэмшигчийн нэр</small><b>${esc(c.bankAccountHolder||'—')}</b></div></div>`;
    const visibleInvoices=(c.invoices||[]).filter(invoice=>(invoice.status||'confirmed')!=='draft');
    document.getElementById('content').innerHTML=`<button class="back" onclick="page='companies';render()">← Буцах</button><div class="center">${avatar(type)}<h2 style="margin:8px 0 2px">${esc(c.name)}</h2><div>${companyIconLabel(c)}</div><div class="sub">${c.status==='inactive'?'⚪ Идэвхгүй':'🟢 Идэвхтэй'}</div><div class="bigAmount">${window.money(c.debt)}</div><div class="sub">Нийт өр</div></div><div class="sectionTitle">Харилцагчийн мэдээлэл</div><div class="card">${details}${note}${bank}</div><div class="sectionTitle">Падаанууд</div><div class="card">${visibleInvoices.length?visibleInvoices.map(i=>{const count=Array.isArray(i.image_urls)?i.image_urls.length:(i.image_url?1:0),balance=Math.max((Number(i.amount)||0)-(Number(i.paid)||0),0);return `<div class="invoice invoiceClickable" role="button" tabindex="0" onclick="window.showInvoiceDetails('${String(i.id||'').replace(/'/g,"\\'")}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.showInvoiceDetails('${String(i.id||'').replace(/'/g,"\\'")}')}"><div><small>${esc(i.date)} · ${esc(i.no||'Дугааргүй')}</small><b>${window.money(i.amount)}</b>${count?`<span style="display:block;color:var(--muted);font-size:10px;margin-top:4px">🖼 ${count} хуудастай зураг</span>`:'<span style="display:block;color:var(--muted);font-size:10px;margin-top:4px">Зураггүй</span>'}</div><div class="${balance>0?'redText':'greenText'}">${balance>0?window.money(balance):'Төлөгдсөн'}<small class="detailHint">Дэлгэрэнгүй →</small></div></div>`}).join(''):'<div class="sub">Падаан алга.</div>'}</div><button class="primary full" onclick="invoice(${c.id})">＋ Падаан нэмэх</button><button class="secondary full" onclick="payment(${c.id})">Төлбөр бүртгэх</button><button type="button" class="secondary full" onclick="event.stopPropagation();window.editCompany(Number(${c.id}))">✎ Мэдээлэл засах</button>`;
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
  window.addCompany=showContactTypePicker;window.showContactTypePicker=showContactTypePicker;window.selectContactType=selectContactType;window.showContactForm=showContactForm;window.card=card;window.companies=companies;window.filter=filterContacts;window.setContactListFilter=setContactListFilter;window.company=company;window.saveCompany=saveCompany;window.editCompany=editCompany;window.saveEdit=saveEdit;
  injectStyle();
})();
