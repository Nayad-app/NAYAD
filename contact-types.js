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
      .homeInvoiceMeta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)}
      .homeInvoiceMeta b{color:var(--text);font-size:10px}.homeDueState{padding:3px 6px;border-radius:7px;font-size:9px;font-weight:800}.homeDueState.overdue{background:#fff0f0;color:#c33}.homeDueState.today,.homeDueState.soon{background:#fff4cc;color:#6a5200}.homeDueState.future{background:#f2f2ee;color:#666}
      .homeUrgentHead{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;overflow:visible}.homeDebtMenuToggle{width:35px;height:35px;padding:0;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:var(--text)}.homeDebtMenuToggle:hover,.homeDebtMenuToggle:focus-visible{background:var(--surface-2)}.homeDebtMenuToggle:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}.homeDebtMenuToggle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
      .homeDebtMenu{position:absolute;z-index:35;right:0;top:calc(100% + 7px);width:min(295px,calc(100vw - 54px));max-height:min(440px,calc(100vh - 175px));overflow-y:auto;padding:8px;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 15px 35px rgba(0,0,0,.19);font-size:12px;font-weight:700;text-transform:none;letter-spacing:0}.homeDebtMenu button{width:100%;min-height:43px;padding:8px 10px;display:grid;grid-template-columns:29px minmax(0,1fr);align-items:center;gap:8px;border:0;border-radius:11px;background:transparent;color:var(--text);font-size:12px;font-weight:700;text-align:left}.homeDebtMenu button:active,.homeDebtMenu button:hover{background:var(--surface-2)}.homeDebtMenu button.active{font-weight:850}.homeDebtMenu button.active .homeDebtMenuIcon{color:#B88A00}.homeDebtMenuIcon{width:24px;height:24px;display:grid;place-items:center;color:var(--muted)}.homeDebtMenuIcon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.homeDebtMenuIcon svg text{fill:currentColor;stroke:none;font-size:8px;font-weight:850}.homeAlphaIcon{display:flex;flex-direction:column;align-items:center;font-size:8px;font-weight:900;line-height:.9}.homeUrgentEmpty{margin-bottom:10px;padding:24px 14px;color:var(--muted);font-size:11px;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:17px}
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
      html.nightMode .contactListRow,html.nightMode .contactFilter,html.nightMode .contactListEmpty,html.nightMode .homeDebtMenu,html.nightMode .homeUrgentEmpty{background:#1D1D1B;border-color:#3C3C38}html.nightMode .contactFilter.selected{background:var(--yellow);border-color:var(--yellow);color:#111}html.nightMode .homeDebtMenu button:hover,html.nightMode .homeDebtMenu button:active,html.nightMode .homeDebtMenuToggle:hover{background:#292927}
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
  const HOME_DEBT_VIEW_KEY='NAYAD_HOME_DEBT_VIEW';
  const validHomeDebtView=value=>['all','next7','next30','nearest','overdue','missing','debt','name-asc','name-desc'].includes(value)?value:'all';
  let homeDebtView=(()=>{try{return validHomeDebtView(localStorage.getItem(HOME_DEBT_VIEW_KEY));}catch(_error){return 'all';}})();
  function homeDue(invoice){return invoice?.effective_due_date||invoice?.due_date||'';}
  function homeDate(value){if(!value)return 'Оруулаагүй';const parts=String(value).split('-');return parts.length===3?`${parts[0]}.${parts[1]}.${parts[2]}`:String(value);}
  function homeDueDays(value){
    if(!value)return null;const parts=String(value).split('-').map(Number);
    if(parts.length!==3||!parts[0]||!parts[1]||!parts[2])return null;
    const now=new Date(),todayDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()),due=new Date(parts[0],parts[1]-1,parts[2]);
    if(Number.isNaN(due.getTime())||due.getFullYear()!==parts[0]||due.getMonth()!==parts[1]-1||due.getDate()!==parts[2])return null;
    return Math.round((due-todayDate)/86400000);
  }
  function homeDueMeta(value){
    if(!value)return {kind:'future',label:'Хугацаа оруулаагүй'};
    const days=homeDueDays(value);if(days===null)return {kind:'future',label:'Хугацаа оруулаагүй'};
    if(days<0)return {kind:'overdue',label:`${Math.abs(days)} хоног хэтэрсэн`};
    if(days===0)return {kind:'today',label:'Өнөөдөр төлөх'};
    if(days===1)return {kind:'soon',label:'Маргааш төлөх'};
    return {kind:days<=7?'soon':'future',label:`${days} хоногийн дараа`};
  }
  function homeOpenInvoices(contact){
    return (contact?.invoices||[]).filter(invoice=>(invoice.status||'confirmed')!=='draft'&&invoice.status!=='cancelled'&&Math.max((Number(invoice.amount)||0)-(Number(invoice.paid)||0),0)>0);
  }
  function homeInvoicesForView(contact){
    const invoices=homeOpenInvoices(contact);
    if(homeDebtView==='next7')return invoices.filter(invoice=>{const days=homeDueDays(homeDue(invoice));return days!==null&&days>=0&&days<=7;});
    if(homeDebtView==='next30')return invoices.filter(invoice=>{const days=homeDueDays(homeDue(invoice));return days!==null&&days>=0&&days<=30;});
    if(homeDebtView==='overdue')return invoices.filter(invoice=>{const days=homeDueDays(homeDue(invoice));return days!==null&&days<0;});
    if(homeDebtView==='missing')return invoices.filter(invoice=>homeDueDays(homeDue(invoice))===null);
    return invoices;
  }
  function homeDueInvoice(contact){
    return homeInvoicesForView(contact).sort((a,b)=>String(homeDue(a)||'9999-99-99').localeCompare(String(homeDue(b)||'9999-99-99')))[0]||null;
  }
  function homeDebtCompanies(companies){
    let rows=(companies||[]).filter(contact=>(Number(contact.debt)||0)>0);
    if(['next7','next30','overdue','missing'].includes(homeDebtView))rows=rows.filter(contact=>homeInvoicesForView(contact).length>0);
    if(homeDebtView==='nearest'||['next7','next30','overdue'].includes(homeDebtView))rows.sort((a,b)=>String(homeDue(homeDueInvoice(a))||'9999-99-99').localeCompare(String(homeDue(homeDueInvoice(b))||'9999-99-99')));
    else if(homeDebtView==='debt')rows.sort((a,b)=>(Number(b.debt)||0)-(Number(a.debt)||0));
    else if(homeDebtView==='name-asc'||homeDebtView==='name-desc')rows.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'mn',{sensitivity:'base'})*(homeDebtView==='name-desc'?-1:1));
    return rows;
  }
  function homeMenuIcon(kind){
    if(kind==='all')return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';
    if(kind==='next7'||kind==='next30')return `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/><text x="12" y="18" text-anchor="middle">${kind==='next7'?'7':'1'}</text></svg>`;
    if(kind==='nearest')return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    if(kind==='overdue')return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>';
    if(kind==='missing')return '<svg viewBox="0 0 24 24"><path d="M5 12c2.5-4 5-4 7 0s4.5 4 7 0-2.5-4-7 0-4.5 4-7 0Z"/></svg>';
    if(kind==='debt')return '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/></svg>';
    return '<span class="homeAlphaIcon"><b>A↓</b><b>Я↑</b></span>';
  }
  const homeMenuRows=()=>[
    ['all','Бүгд'],['next7','7 хоногт төлөх'],['next30','1 сард төлөх'],['nearest','Төлөх хугацаа хамгийн ойр'],['overdue','Хугацаа хэтэрсэн'],['missing','Хугацаагүй'],['debt','Их өртэй'],['name',homeDebtView==='name-desc'?'Нэрээр Я–A':'Нэрээр A–Я']
  ];
  function homeDebtControls(){
    const sliders='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h7M15 7h5M4 17h5M13 17h7"/><circle cx="13" cy="7" r="2"/><circle cx="11" cy="17" r="2"/></svg>';
    const options=homeMenuRows().map(([value,label])=>{const active=value==='name'?homeDebtView.startsWith('name-'):homeDebtView===value;return `<button type="button" role="menuitemradio" aria-checked="${active}" class="${active?'active':''}" onclick="event.stopPropagation();setHomeDebtView('${value}')"><span class="homeDebtMenuIcon">${homeMenuIcon(value)}</span><span>${esc(label)}</span></button>`;}).join('');
    return `<button id="homeDebtMenuToggle" class="homeDebtMenuToggle" type="button" aria-label="Яаралтай өрийг шүүх, эрэмбэлэх" aria-haspopup="menu" aria-expanded="false" onclick="toggleHomeDebtMenu(event)">${sliders}</button><div id="homeDebtMenu" class="homeDebtMenu hide" role="menu" aria-label="Яаралтай өрийг шүүх, эрэмбэлэх" onclick="event.stopPropagation()">${options}</div>`;
  }
  function closeHomeDebtMenu(){const menu=document.getElementById('homeDebtMenu'),button=document.getElementById('homeDebtMenuToggle');menu?.classList.add('hide');button?.setAttribute('aria-expanded','false');}
  function toggleHomeDebtMenu(event){event?.stopPropagation?.();const menu=document.getElementById('homeDebtMenu'),button=document.getElementById('homeDebtMenuToggle');if(!menu||!button)return;const opening=menu.classList.contains('hide');menu.classList.toggle('hide',!opening);button.setAttribute('aria-expanded',String(opening));}
  function setHomeDebtView(value){
    homeDebtView=value==='name'?(homeDebtView==='name-asc'?'name-desc':'name-asc'):validHomeDebtView(value);
    try{localStorage.setItem(HOME_DEBT_VIEW_KEY,homeDebtView);}catch(_error){}
    closeHomeDebtMenu();window.render();
  }
  function card(contact,pay=false){
    const c=contact||{},type=validType(c.contactType),invoice=homeDueInvoice(c),due=homeDue(invoice),meta=homeDueMeta(due);
    const dueInfo=pay&&invoice?`<div class="homeInvoiceMeta"><span>${esc(invoice.no||'Дугааргүй')}</span><span>Төлөх өдөр <b>${esc(homeDate(due))}</b></span><span class="homeDueState ${meta.kind}">${esc(meta.label)}</span></div>`:'';
    return `<div class="card" onclick="company(${c.id})"><div class="row"><div class="company">${avatar(type)}<div><b>${esc(c.name)}</b><span>${typeLabel(type)}<span class="contactTypeText">· ${c.invoices?.length||0} падаан</span></span></div></div><div class="amount redText">${window.money(c.debt)}${pay?`<br><button class="primary" style="padding:6px 9px;margin-top:5px" onclick="event.stopPropagation();payment(${c.id})">Төлөх</button>`:''}</div></div>${dueInfo}</div>`;
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
  document.addEventListener?.('click',event=>{if(!event.target?.closest?.('.homeUrgentHead'))closeHomeDebtMenu();});
  document.addEventListener?.('keydown',event=>{if(event.key==='Escape')closeHomeDebtMenu();});
  window.__nayadHomeDebtList=homeDebtCompanies;window.__nayadHomeDebtControls=homeDebtControls;window.__nayadHomeDebtView=()=>homeDebtView;window.toggleHomeDebtMenu=toggleHomeDebtMenu;window.closeHomeDebtMenu=closeHomeDebtMenu;window.setHomeDebtView=setHomeDebtView;
  window.addCompany=showContactTypePicker;window.showContactTypePicker=showContactTypePicker;window.selectContactType=selectContactType;window.showContactForm=showContactForm;window.card=card;window.companies=companies;window.filter=filterContacts;window.setContactListFilter=setContactListFilter;window.company=company;window.saveCompany=saveCompany;window.editCompany=editCompany;window.saveEdit=saveEdit;
  injectStyle();
})();
