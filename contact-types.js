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
  const safeLogoUrl=value=>{const url=String(value||'').trim();return /^(https:\/\/|blob:|data:image\/)/i.test(url)?url:'';};
  const avatar=value=>{const contact=value&&typeof value==='object'?value:null,type=validType(contact?.contactType||value),logo=type===ORGANIZATION?safeLogoUrl(contact?.logoUrl):'';return `<div class="contactAvatar ${type}${logo?' hasLogo':''}">${logo?`<img src="${esc(logo)}" alt="">`:icon(type)}</div>`;};
  const fieldValue=id=>typeof window.v==='function'?window.v(id):document.getElementById(id)?.value?.trim?.()||'';
  const input=(id,label,value='',placeholder='',type='text',hint='')=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">${hint?`<small class="contactFieldHint">${esc(hint)}</small>`:''}</div>`;
  const area=(id,label,value='',placeholder='')=>`<div class="field"><label for="${id}">${label}</label><textarea id="${id}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></div>`;
  const bankHolder=(id,value='')=>input(id,'Данс эзэмшигчийн нэр *',value,'Нэрээ оруулна уу');
  const copyIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"></path></svg>';
  const bankCopyField=(id,label,value,placeholder,copyAction,hint='')=>`<div class="field bankCopyField"><label for="${id}">${label}</label><div class="bankCopyInput"><input id="${id}" type="text" maxlength="34" autocomplete="off" value="${esc(value||'')}" placeholder="${esc(placeholder)}"><button type="button" class="bankCopyButton" onclick="${copyAction}" aria-label="${esc(label)} хуулах" title="${esc(label)} хуулах">${copyIcon}</button></div>${hint?`<small class="contactFieldHint">${esc(hint)}</small>`:''}</div>`;
  const bankFields=(prefix,contact)=>`${window.bankSelect(prefix+'Bank','Банк *',contact?.bank||'')}${bankCopyField(prefix+'BankIban','IBAN — заавал биш',contact?.bankIban||'','Жишээ: 69000500',`copyBankIban('${prefix}BankIban','${prefix}BankAccount')`,'Хуулах тэмдэг дарвал IBAN болон дансны дугаар хамт хуулагдана.')}${bankCopyField(prefix+'BankAccount','Дансны дугаар',contact?.bankAccount||'','Дансны дугаараа оруулна уу',`copyBankAccount('${prefix}BankAccount')`)}${bankHolder(prefix+'BankAccountHolder',contact?.bankAccountHolder||'')}`;
  const requireBank=(bank,account,holder)=>{
    if(!bank||!account||!holder){window.toast('Банк, дансны дугаар, данс эзэмшигчийн нэрийг бөглөнө үү.');return false;}
    return true;
  };
  const cleanBankPart=value=>String(value||'').trim().replace(/[\s-]+/g,'').toUpperCase();
  async function copyBankValue(value,success){
    if(!value){window.toast('Хуулах мэдээлэл оруулаагүй байна.');return;}
    try{
      if(globalThis.navigator?.clipboard?.writeText)await globalThis.navigator.clipboard.writeText(value);
      else{
        const node=document.createElement('textarea');node.value=value;node.setAttribute('readonly','');node.style.position='fixed';node.style.opacity='0';document.body.appendChild(node);node.select();if(!document.execCommand('copy'))throw new Error('copy failed');node.remove();
      }
      window.toast(success);
    }catch(error){console.warn('bank copy:',error);window.toast('Хуулж чадсангүй. Дахин оролдоно уу.');}
  }
  function copyBankIban(ibanId,accountId){
    const iban=cleanBankPart(fieldValue(ibanId)).replace(/^MN/,'');
    const account=cleanBankPart(fieldValue(accountId));
    if(!iban){window.toast('IBAN оруулна уу.');return;}
    if(!account){window.toast('Дансны дугаар оруулна уу.');return;}
    return copyBankValue(`MN${iban}${account}`,'IBAN болон дансны дугаар хуулагдлаа.');
  }
  function copyBankAccount(accountId){
    const account=cleanBankPart(fieldValue(accountId));
    if(!account){window.toast('Дансны дугаар оруулна уу.');return;}
    return copyBankValue(account,'Дансны дугаар хуулагдлаа.');
  }
  function requireCompletedRegistration(){
    const active=window.__nayadActiveStore||null;
    const complete=typeof window.__nayadIsRegistrationComplete==='function'
      ?window.__nayadIsRegistrationComplete(active)
      :Boolean(active?.id&&active?.registration_completed_at);
    if(complete)return true;
    const pending=active?.id?active:window.__nayadPendingRegistration||null;
    window.toast?.('Эхлээд үйл ажиллагааны бүртгэлээ гүйцээнэ үү.');
    if(pending?.role==='owner'&&typeof window.showNayadRegistrationOnboarding==='function'){
      window.closeSheet?.();
      window.showNayadRegistrationOnboarding({initial:false,existingRegistration:pending});
    }
    return false;
  }
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
      .contactAvatar.hasLogo{overflow:hidden;background:#fff;border:1px solid var(--line)}.contactAvatar.hasLogo img{width:100%;height:100%;display:block;object-fit:cover}
      .contactAvatar.person{background:var(--green-soft);color:var(--green)}.contactAvatar.organization{background:#F0F1EF;color:#6F7470}
      .contactTypeText{font-size:10px;color:var(--muted);margin-left:5px}
      .homeDebtValue{display:flex;flex-direction:column;align-items:flex-end;gap:2px}.homeDebtDue{color:var(--red);font-size:9px;font-weight:750;white-space:nowrap}
      .homeUrgentHead{position:relative;display:flex;align-items:center;gap:4px;overflow:visible;margin-top:16px}.homeUrgentTitle{margin-right:auto;white-space:nowrap}.homeQuickFilters{display:flex;align-items:center;gap:0}.homeQuickFilter{width:29px;height:29px;padding:0;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:var(--muted)}.homeQuickFilter:hover,.homeQuickFilter:focus-visible{background:var(--surface-2)}.homeQuickFilter.active{color:#E6AB00}.homeQuickFilter:focus-visible{outline:2px solid var(--yellow);outline-offset:1px}.homeQuickFilter svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}.homeQuickFilter svg text{fill:currentColor;stroke:none;font-size:8px;font-weight:850}.homeDebtMenuToggle{width:31px;height:31px;padding:0;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:var(--text)}.homeDebtMenuToggle:hover,.homeDebtMenuToggle:focus-visible{background:var(--surface-2)}.homeDebtMenuToggle:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}.homeDebtMenuToggle svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
      .homeDebtMenu{position:absolute;z-index:35;right:0;top:calc(100% + 7px);width:min(295px,calc(100vw - 54px));max-height:min(440px,calc(100vh - 175px));overflow-y:auto;padding:8px;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 15px 35px rgba(0,0,0,.19);font-size:12px;font-weight:700;text-transform:none;letter-spacing:0}.homeDebtMenu button{width:100%;min-height:43px;padding:8px 10px;display:grid;grid-template-columns:29px minmax(0,1fr);align-items:center;gap:8px;border:0;border-radius:11px;background:transparent;color:var(--text);font-size:12px;font-weight:700;text-align:left}.homeDebtMenu button:active,.homeDebtMenu button:hover{background:var(--surface-2)}.homeDebtMenu button.active{font-weight:850}.homeDebtMenu button.active .homeDebtMenuIcon{color:#B88A00}.homeDebtMenuIcon{width:24px;height:24px;display:grid;place-items:center;color:var(--muted)}.homeDebtMenuIcon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.homeDebtMenuIcon svg text{fill:currentColor;stroke:none;font-size:8px;font-weight:850}.homeAlphaIcon{display:flex;flex-direction:column;align-items:center;font-size:8px;font-weight:900;line-height:.9}.homeUrgentEmpty{margin-bottom:10px;padding:24px 14px;color:var(--muted);font-size:11px;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:17px}.homeDebtCard{padding:10px 12px;margin-bottom:8px;border-radius:16px}.homeDebtCard .row{align-items:center}.homeDebtCard .contactAvatar{width:38px;height:38px}.homeDebtCard .company{gap:10px}.homeDebtCard .company b{font-size:14px}.homeDebtCard .company span{margin-top:2px;font-size:10px}.homeDebtAmount{display:flex;align-items:center;gap:8px}.homeDebtChevron{width:16px;height:16px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.homeDebtCard .amount{font-size:13px}.homeStoreRow{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px}.homeInvoiceAdd{width:38px;height:38px;flex:0 0 38px;padding:0;border-radius:50%;background:var(--yellow);color:#111;font-size:24px;font-weight:500;line-height:1;display:grid;place-items:center;box-shadow:var(--shadow-sm)}
      .homePeriodOverlay{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.48)}.homePeriodDialog{width:min(350px,100%);max-height:calc(100svh - 40px);overflow:auto;padding:18px;background:var(--surface);border:1px solid var(--line);border-radius:22px;box-shadow:0 20px 54px rgba(0,0,0,.25)}.homePeriodHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.homePeriodHead h2{margin:0;font-size:20px;line-height:1.15;letter-spacing:-.4px}.homePeriodClose{width:38px;height:38px;flex:0 0 38px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;background:var(--surface-2);color:var(--text);font-size:23px;font-weight:500}.homePeriodOptions{display:flex;flex-direction:column;gap:6px}.homePeriodOption{width:100%;min-height:48px;padding:8px 12px;display:grid;grid-template-columns:28px minmax(0,1fr) 22px;align-items:center;gap:9px;border:1px solid var(--line);border-radius:13px;background:var(--surface);color:var(--text);font-size:13px;font-weight:750;text-align:left}.homePeriodOption.selected{border-color:#F0C341;background:#FFF8DF;font-weight:850}.homePeriodOptionIcon{width:24px;height:24px;display:grid;place-items:center;color:var(--muted)}.homePeriodOption.selected .homePeriodOptionIcon,.homePeriodCheck{color:#B88A00}.homePeriodOptionIcon svg,.homePeriodChevron{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.homePeriodCheck{font-size:18px;font-weight:900;text-align:center}.homePeriodDateFields{display:flex;flex-direction:column;gap:12px}.homePeriodField label{display:block;margin-bottom:6px;color:var(--text);font-size:12px;font-weight:750}.homePeriodInputWrap{position:relative}.homePeriodInputWrap input{width:100%;min-height:48px;padding:10px 42px 10px 12px;border:1px solid var(--line);border-radius:13px;background:var(--surface);color:var(--text);font-size:14px}.homePeriodInputWrap svg{position:absolute;right:13px;top:50%;width:20px;height:20px;transform:translateY(-50%);pointer-events:none;fill:none;stroke:var(--muted);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.homePeriodActions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:16px}.homePeriodActions button{min-height:45px}.homePeriodError{margin:0 0 10px;padding:9px 10px;border-radius:10px;background:#FFF0F0;color:#B83232;font-size:11px;font-weight:700;line-height:1.4}
      .contactDetailType{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);font-weight:700}
      .contactDetailType svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .contactFieldHint{display:block;margin-top:6px;color:var(--muted);font-size:10px;line-height:1.4}
      .bankCopyInput{position:relative}.bankCopyInput input{padding-right:52px}.bankCopyButton{position:absolute;right:6px;top:50%;width:38px;height:38px;padding:0;transform:translateY(-50%);display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:var(--text)}.bankCopyButton:hover,.bankCopyButton:focus-visible{background:var(--surface-2)}.bankCopyButton:focus-visible{outline:2px solid var(--yellow);outline-offset:1px}.bankCopyButton svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .contactEditTypePicker{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:12px 0 16px}.contactEditTypeOption{min-height:62px;padding:9px 10px;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);font-size:12px;font-weight:800}.contactEditTypeOption svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}.contactEditTypeOption.selected{border-color:var(--yellow);background:#FFF8DF;color:#111}.contactEditTypeOption:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}
      .contactLogoEditor{margin:2px 0 18px;text-align:center}.contactLogoPreview{position:relative;width:92px;height:92px;margin:0 auto 8px;display:grid;place-items:center;overflow:visible;border:1px solid var(--line);border-radius:50%;background:var(--surface-2);color:var(--muted)}.contactLogoPreview>img{width:100%;height:100%;display:block;border-radius:50%;object-fit:cover}.contactLogoPreview>svg{width:40px;height:40px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.contactLogoCamera{position:absolute;right:-2px;bottom:1px;width:31px;height:31px;display:grid;place-items:center;border:2px solid var(--surface);border-radius:50%;background:var(--yellow);color:#111}.contactLogoCamera svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.contactLogoTitle{font-size:12px;font-weight:800}.contactLogoActions{display:flex;justify-content:center;gap:12px;margin-top:5px}.contactLogoAction{padding:4px;border:0;background:transparent;color:#B88A00;font-size:11px;font-weight:750}.contactLogoRemove{color:var(--red)}
      .contactListHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}.contactListHead .name{flex:0 0 auto}.contactStoreMeta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10px;font-weight:650;text-align:right}
      .contactSearchRow{position:relative;z-index:6;display:grid;grid-template-columns:minmax(0,1fr) 48px;gap:9px;margin-bottom:10px;overflow:visible}.contactSearch{position:relative;min-width:0}.contactSearch>svg{position:absolute;left:15px;top:50%;width:20px;height:20px;transform:translateY(-50%);fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round}.contactSearch .search{height:48px;padding-left:45px;margin:0}
      .contactFilterToggle{width:48px;height:48px;padding:0;display:grid;place-items:center;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);box-shadow:var(--shadow-sm)}.contactFilterToggle:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}.contactFilterToggle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .contactFilterMenu{position:absolute;z-index:40;right:0;top:calc(100% + 7px);width:210px;padding:7px;background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 15px 35px rgba(0,0,0,.19)}.contactFilterMenu button{width:100%;min-height:42px;padding:7px 9px;display:grid;grid-template-columns:28px minmax(0,1fr) 16px;align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;color:var(--text);font-size:12px;font-weight:750;text-align:left}.contactFilterMenu button:hover,.contactFilterMenu button:active{background:var(--surface-2)}.contactFilterMenu button.active{background:#FFF8DF;font-weight:850}.contactFilterMenuIcon{width:24px;height:24px;display:grid;place-items:center;color:var(--muted)}.contactFilterMenu button.active .contactFilterMenuIcon,.contactFilterCheck{color:#B88A00}.contactFilterMenuIcon svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}.contactFilterCheck{font-size:15px;font-weight:900;text-align:center}
      .contactList{display:flex;flex-direction:column;gap:7px;margin:0 0 10px}.contactListRow{position:relative;min-height:58px;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:15px;box-shadow:var(--shadow-sm);cursor:pointer;box-sizing:border-box}.contactListRow.inactive{opacity:.72}.contactListRow:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}
      .contactListMain{display:grid;grid-template-columns:36px minmax(0,1fr) 38px;gap:9px;align-items:center}.contactListMain .contactAvatar{width:36px;height:36px}.contactListMain .contactAvatar svg{width:20px;height:20px}.contactListIdentity{min-width:0}.contactListIdentity b,.contactListIdentity span{display:block}.contactListIdentity b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.contactListDebt{margin-top:3px;color:#D85B5B;font-size:10px;font-weight:750}.contactCallButton{appearance:none;width:36px;height:36px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;background:#20A44B;color:#fff;text-decoration:none;font:inherit;cursor:pointer}.contactCallButton:hover,.contactCallButton:active{background:#16863C}.contactCallButton:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}.contactCallButton svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .modal.contactCallNoticeModal{align-items:center;padding:20px}.sheet.contactCallNoticeSheet{width:min(370px,100%);max-height:none;border-radius:22px;padding:24px 20px}.contactCallNoticeSheet h2{font-size:18px;text-align:center;margin-bottom:12px}.contactCallNoticeText{margin:0;color:var(--muted);font-size:13px;line-height:1.55;text-align:center}.contactCallNoticeSheet .actions{margin-top:20px}.contactCallNoticeSheet .actions button{min-height:46px}
      .contactListEmpty{padding:25px 14px;color:var(--muted);font-size:12px;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:17px}.contactAddButton{width:100%;margin-top:10px;padding:14px;border:0;border-radius:15px;background:var(--yellow);color:#111;font-size:13px;font-weight:850}
      html.nightMode .contactListRow,html.nightMode .contactFilterToggle,html.nightMode .contactFilterMenu,html.nightMode .contactListEmpty,html.nightMode .homeDebtMenu,html.nightMode .homeUrgentEmpty,html.nightMode .homePeriodDialog,html.nightMode .homePeriodOption,html.nightMode .homePeriodInputWrap input{background:#1D1D1B;border-color:#3C3C38}html.nightMode .contactAvatar.organization{background:#2B2C29;color:#A9ACA8}html.nightMode .contactEditTypeOption.selected,html.nightMode .homePeriodOption.selected{background:#332F20;color:var(--text)}html.nightMode .contactLogoCamera{border-color:#1D1D1B}html.nightMode .contactFilterMenu button.active{background:#332F20}html.nightMode .contactFilterMenu button:hover,html.nightMode .contactFilterMenu button:active,html.nightMode .homeDebtMenu button:hover,html.nightMode .homeDebtMenu button:active,html.nightMode .homeDebtMenuToggle:hover{background:#292927}
    `;document.head.appendChild(style);
  }
  let editContactDraft=null,pendingContactLogo=null;
  function editTypePicker(kind){return `<div class="contactEditTypePicker" role="group" aria-label="Харилцагчийн төрөл"><button type="button" class="contactEditTypeOption ${kind===PERSON?'selected':''}" aria-pressed="${kind===PERSON}" onclick="changeEditContactType('${PERSON}')">${icon(PERSON)}<span>Хувь хүн</span></button><button type="button" class="contactEditTypeOption ${kind===ORGANIZATION?'selected':''}" aria-pressed="${kind===ORGANIZATION}" onclick="changeEditContactType('${ORGANIZATION}')">${icon(ORGANIZATION)}<span>Байгууллага</span></button></div>`;}
  function logoEditor(contact){const pending=safeLogoUrl(pendingContactLogo?.previewUrl),saved=safeLogoUrl(contact?.logoUrl),src=pending||(!pendingContactLogo?.remove?saved:''),hasLogo=Boolean(src||contact?.logoPath&&!pendingContactLogo?.remove);return `<div class="contactLogoEditor"><input id="eContactLogo" type="file" accept="image/jpeg,image/png,image/webp" hidden onchange="previewContactLogo(this)"><button type="button" class="contactLogoPreview" onclick="document.getElementById('eContactLogo').click()" aria-label="Байгууллагын лого сонгох">${src?`<img src="${esc(src)}" alt="Байгууллагын лого">`:icon(ORGANIZATION)}<span class="contactLogoCamera"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3l1.4-2h7.2l1.4 2h3v10H4z"></path><circle cx="12" cy="13.5" r="3.2"></circle></svg></span></button><div class="contactLogoTitle">Байгууллагын лого</div><div class="contactLogoActions"><button type="button" class="contactLogoAction" onclick="document.getElementById('eContactLogo').click()">${hasLogo?'Лого солих':'Лого оруулах'}</button>${hasLogo?'<button type="button" class="contactLogoAction contactLogoRemove" onclick="removeContactLogo()">Устгах</button>':''}</div></div>`;}
  function captureEditDraft(){const base={...(editContactDraft||selected||{})},keys={Name:'name',Phone:'phone',Address:'address',Director:'director',DirectorPhone:'directorPhone',Sales:'sales',SalesPhone:'salesPhone',Note:'note',Bank:'bank',BankIban:'bankIban',BankAccount:'bankAccount',BankAccountHolder:'bankAccountHolder',Status:'status'};for(const [suffix,key] of Object.entries(keys)){const node=document.getElementById('e'+suffix);if(node)base[key]=String(node.value||'').trim();}base.contactType=validType(fieldValue('eContactType')||base.contactType);return base;}
  function refreshEditForm(){editContactDraft=captureEditDraft();showContactForm(editContactDraft.contactType,editContactDraft);}
  function changeEditContactType(type){editContactDraft=captureEditDraft();editContactDraft.contactType=validType(type);showContactForm(editContactDraft.contactType,editContactDraft);}
  async function previewContactLogo(input){const chosen=input?.files?.[0];if(!chosen)return;if(!/^image\/(jpeg|png|webp)$/i.test(chosen.type||'')){window.toast('JPG, PNG эсвэл WEBP зураг сонгоно уу.');return;}let file=chosen;if(typeof window.compressInvoiceImage==='function')file=await window.compressInvoiceImage(chosen);if(!file?.size){window.toast('Сонгосон зураг хоосон байна. Өөр зураг сонгоно уу.');return;}if(file.size>2*1024*1024){window.toast('Логоны зураг 2 MB-аас бага байна.');return;}if(pendingContactLogo?.objectUrl)URL.revokeObjectURL(pendingContactLogo.objectUrl);const objectUrl=URL.createObjectURL(file);pendingContactLogo={file,remove:false,previewUrl:objectUrl,objectUrl};refreshEditForm();}
  function removeContactLogo(){if(pendingContactLogo?.objectUrl)URL.revokeObjectURL(pendingContactLogo.objectUrl);pendingContactLogo={file:null,remove:true,previewUrl:'',objectUrl:''};refreshEditForm();}
  let contactTypeSelectionTimer=0;
  function selectContactType(type){
    const kind=validType(type),options=[...document.querySelectorAll('.contactTypeOption')];
    options.forEach(option=>{const chosen=option.dataset.contactType===kind;option.classList.toggle('selected',chosen);option.setAttribute('aria-pressed',String(chosen));});
    if(contactTypeSelectionTimer&&typeof window.clearTimeout==='function')window.clearTimeout(contactTypeSelectionTimer);
    contactTypeSelectionTimer=window.setTimeout(()=>{const modal=document.getElementById('modal');if(modal?.classList?.contains?.('hide'))return;showContactForm(kind);},160);
  }
  function showContactTypePicker(){
    if(!requireCompletedRegistration())return;
    injectStyle();
    window.sheet(`<h2>Харилцагч бүртгэх</h2><div class="contactTypeHint">Харилцагчийн төрөл</div><div class="contactTypePicker"><button type="button" class="contactTypeOption person" data-contact-type="person" aria-pressed="false" onclick="selectContactType('person')"><span class="contactTypeIcon">${icon(PERSON)}</span><b>Хувь хүн</b></button><button type="button" class="contactTypeOption organization" data-contact-type="organization" aria-pressed="false" onclick="selectContactType('organization')"><span class="contactTypeIcon">${icon(ORGANIZATION)}</span><b>Байгууллага</b></button></div>`);
  }
  function showContactForm(type,contact={}){
    if(!contact?.id&&!requireCompletedRegistration())return;
    injectStyle();
    const kind=validType(type),person=kind===PERSON,prefix=contact.id?'e':'new';
    const title=contact.id?'Харилцагчийн мэдээлэл засах':(person?'Хувь хүн бүртгэх':'Байгууллага бүртгэх');
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
        +input(prefix+'SalesPhone','Худалдааны төлөөлөгчийн утас',contact.salesPhone||'','Утасны дугаараа оруулна уу','tel','Харилцагчдын жагсаалтын ногоон залгах товч энэ дугаар руу шууд залгана.')
        +area(prefix+'Note','Нэмэлт тэмдэглэл',contact.note||'','Шаардлагатай зүйлээ тэмдэглэнэ үү');
    const status=contact.id?`<div class="field"><label for="eStatus">Төлөв</label><select id="eStatus"><option value="active" ${contact.status!=='inactive'?'selected':''}>Идэвхтэй</option><option value="inactive" ${contact.status==='inactive'?'selected':''}>Идэвхгүй</option></select></div>`:'';
    const hidden=`<input id="${prefix}ContactType" type="hidden" value="${kind}">`;
    const editIdentity=contact.id?editTypePicker(kind)+(person?'':logoEditor(contact)):'';
    const actions=`<div class="actions"><button class="secondary" onclick="closeSheet()">Болих</button><button class="primary" onclick="${contact.id?'saveEdit':'saveCompany'}()">Хадгалах</button></div>`;
    const remove=contact.id&&contact.status==='inactive'?`<button class="secondary full" style="margin-top:10px;color:#c72c2c;background:#ffe2e2" onclick="deleteCompany(${contact.id})">Устгах</button>`:'';
    window.sheet(`<h2>${title}</h2>${hidden}${editIdentity}${fields}<div class="title" style="margin-top:20px">БАНКНЫ МЭДЭЭЛЭЛ</div>${bankFields(prefix,contact)}${status}${actions}${remove}`);
  }
  function companyIconLabel(contact){const type=validType(contact?.contactType);return `<span class="contactDetailType">${icon(type)}${typeLabel(type)}</span>`;}
  const HOME_DEBT_VIEW_KEY='NAYAD_HOME_DEBT_VIEW',HOME_DEBT_RANGE_KEY='NAYAD_HOME_DEBT_RANGE';
  const HOME_PERIOD_VIEWS=['today','next3','next7','next14','this-month','custom-date'];
  const validHomeDebtView=value=>['all','today','next3','next7','next14','next30','this-month','custom-date','nearest','overdue','missing','debt','name-asc','name-desc','invoice-date-asc','invoice-date-desc'].includes(value)?value:'all';
  let homeDebtView=(()=>{try{return validHomeDebtView(localStorage.getItem(HOME_DEBT_VIEW_KEY));}catch(_error){return 'all';}})();
  let homeCustomRange=(()=>{try{const value=JSON.parse(localStorage.getItem(HOME_DEBT_RANGE_KEY)||'{}');return {start:String(value.start||''),end:String(value.end||'')};}catch(_error){return {start:'',end:''};}})();
  function homeDue(invoice){return invoice?.effective_due_date||invoice?.due_date||'';}
  function homeDate(value){if(!value)return 'Оруулаагүй';const parts=String(value).split('-');return parts.length===3?`${parts[0]}.${parts[1]}.${parts[2]}`:String(value);}
  const HOME_DAY_MS=86400000,HOME_GREEN=[22,163,74],HOME_YELLOW=[234,179,8],HOME_RED=[220,38,38],HOME_OVERDUE='#8B2B22';
  function homeDateValue(value){
    if(!value)return null;const raw=String(value).slice(0,10),parts=raw.split('-').map(Number);
    if(parts.length!==3||!parts[0]||!parts[1]||!parts[2])return null;
    const date=new Date(parts[0],parts[1]-1,parts[2]);
    if(Number.isNaN(date.getTime())||date.getFullYear()!==parts[0]||date.getMonth()!==parts[1]-1||date.getDate()!==parts[2])return null;
    return date.getTime();
  }
  function homeTodayValue(){const now=new Date();return new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();}
  function homeRgbHex(rgb){return `#${rgb.map(value=>Math.round(value).toString(16).padStart(2,'0')).join('').toUpperCase()}`;}
  function homeMixColor(from,to,ratio){return homeRgbHex(from.map((value,index)=>value+(to[index]-value)*ratio));}
  function homeProgressColor(progress){
    const step=Math.max(1,Math.min(30,Math.floor(Math.max(0,Math.min(1,progress))*29)+1));
    return step<=15?homeMixColor(HOME_GREEN,HOME_YELLOW,(step-1)/14):homeMixColor(HOME_YELLOW,HOME_RED,(step-15)/15);
  }
  function homeInvoiceRisk(invoice){
    const start=homeDateValue(homeInvoiceDate(invoice)),dueText=homeDue(invoice),due=homeDateValue(dueText),today=homeTodayValue();
    if(start===null||due===null||due<start)return {invoice,kind:'unknown',score:-1,color:'var(--text)',due:dueText};
    if(today>due)return {invoice,kind:'overdue',score:2+(today-due)/HOME_DAY_MS,color:HOME_OVERDUE,due:dueText};
    const duration=due-start,progress=duration<=0?(today>=due?1:0):Math.max(0,Math.min(1,(today-start)/duration));
    return {invoice,kind:today===due?'due':'active',score:progress,color:homeProgressColor(progress),due:dueText};
  }
  function homeDebtRisk(contact){
    return homeOpenInvoices(contact).map(homeInvoiceRisk).sort((left,right)=>right.score-left.score)[0]||{invoice:null,kind:'unknown',score:-1,color:'var(--text)',due:''};
  }
  function homeDueDays(value){
    if(!value)return null;const parts=String(value).split('-').map(Number);
    if(parts.length!==3||!parts[0]||!parts[1]||!parts[2])return null;
    const now=new Date(),todayDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()),due=new Date(parts[0],parts[1]-1,parts[2]);
    if(Number.isNaN(due.getTime())||due.getFullYear()!==parts[0]||due.getMonth()!==parts[1]-1||due.getDate()!==parts[2])return null;
    return Math.round((due-todayDate)/86400000);
  }
  function homeOpenInvoices(contact){
    return (contact?.invoices||[]).filter(invoice=>(invoice.status||'confirmed')!=='draft'&&invoice.status!=='cancelled'&&Math.max((Number(invoice.amount)||0)-(Number(invoice.paid)||0),0)>0);
  }
  function homeInvoiceMatchesPeriod(invoice,view){
    const dueText=homeDue(invoice),days=homeDueDays(dueText);
    if(view==='today')return days===0;
    if(view==='next3')return days!==null&&days>=0&&days<=3;
    if(view==='next7')return days!==null&&days>=0&&days<=7;
    if(view==='next14')return days!==null&&days>=0&&days<=14;
    const due=homeDateValue(dueText),now=new Date();
    if(view==='this-month'){
      const start=new Date(now.getFullYear(),now.getMonth(),1).getTime(),end=new Date(now.getFullYear(),now.getMonth()+1,0).getTime();
      return due!==null&&due>=start&&due<=end;
    }
    if(view==='custom-date'){
      const start=homeDateValue(homeCustomRange.start),end=homeDateValue(homeCustomRange.end);
      return due!==null&&start!==null&&end!==null&&due>=start&&due<=end;
    }
    return true;
  }
  function homeInvoicesForView(contact){
    const invoices=homeOpenInvoices(contact);
    if(HOME_PERIOD_VIEWS.includes(homeDebtView))return invoices.filter(invoice=>homeInvoiceMatchesPeriod(invoice,homeDebtView));
    if(homeDebtView==='next30')return invoices.filter(invoice=>{const days=homeDueDays(homeDue(invoice));return days!==null&&days>=0&&days<=30;});
    if(homeDebtView==='overdue')return invoices.filter(invoice=>{const days=homeDueDays(homeDue(invoice));return days!==null&&days<0;});
    if(homeDebtView==='missing')return invoices.filter(invoice=>homeDueDays(homeDue(invoice))===null);
    return invoices;
  }
  function homeDueInvoice(contact){
    return homeInvoicesForView(contact).sort((a,b)=>String(homeDue(a)||'9999-99-99').localeCompare(String(homeDue(b)||'9999-99-99')))[0]||null;
  }
  function homeInvoiceDate(invoice){return invoice?.date||invoice?.invoice_date||'';}
  function homeInvoiceDateValue(contact){
    const dates=homeInvoicesForView(contact).map(homeInvoiceDate).filter(Boolean).sort();
    if(!dates.length)return '';
    return homeDebtView==='invoice-date-desc'?dates[dates.length-1]:dates[0];
  }
  function homeDebtCompanies(companies){
    let rows=(companies||[]).filter(contact=>(Number(contact.debt)||0)>0);
    if([...HOME_PERIOD_VIEWS,'next30','overdue','missing'].includes(homeDebtView))rows=rows.filter(contact=>homeInvoicesForView(contact).length>0);
    if(homeDebtView==='nearest'||[...HOME_PERIOD_VIEWS,'next30','overdue'].includes(homeDebtView))rows.sort((a,b)=>String(homeDue(homeDueInvoice(a))||'9999-99-99').localeCompare(String(homeDue(homeDueInvoice(b))||'9999-99-99')));
    else if(homeDebtView==='debt')rows.sort((a,b)=>(Number(b.debt)||0)-(Number(a.debt)||0));
    else if(homeDebtView==='name-asc'||homeDebtView==='name-desc')rows.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'mn',{sensitivity:'base'})*(homeDebtView==='name-desc'?-1:1));
    else if(homeDebtView==='invoice-date-asc'||homeDebtView==='invoice-date-desc')rows.sort((a,b)=>{
      const left=homeInvoiceDateValue(a),right=homeInvoiceDateValue(b);
      if(!left&&!right)return 0;
      if(!left)return 1;
      if(!right)return -1;
      return left.localeCompare(right)*(homeDebtView==='invoice-date-desc'?-1:1);
    });
    return rows;
  }
  function homeMenuIcon(kind){
    if(kind==='all')return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';
    if(kind==='next7'||kind==='next30')return `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/><text x="12" y="18" text-anchor="middle">${kind==='next7'?'7':'1'}</text></svg>`;
    if(kind==='nearest')return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    if(kind==='overdue')return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>';
    if(kind==='missing')return '<svg viewBox="0 0 24 24"><path d="M5 12c2.5-4 5-4 7 0s4.5 4 7 0-2.5-4-7 0-4.5 4-7 0Z"/></svg>';
    if(kind==='debt')return '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/></svg>';
    if(kind==='invoice-date')return '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>';
    return '<span class="homeAlphaIcon"><b>A↓</b><b>Я↑</b></span>';
  }
  const homeMenuRows=()=>[
    ['all','Бүгд'],['next7','7 хоногт төлөх'],['next30','1 сард төлөх'],['nearest','Төлөх хугацаа хамгийн ойр'],['overdue','Хугацаа хэтэрсэн'],['missing','Хугацаагүй'],['debt','Их өртэй'],['invoice-date',homeDebtView==='invoice-date-desc'?'Анх авсан огноо ↓':'Анх авсан огноо ↑'],['name',homeDebtView==='name-desc'?'Нэрээр Я–A':'Нэрээр A–Я']
  ];
  function homeDebtControls(){
    const sliders='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h7M15 7h5M4 17h5M13 17h7"/><circle cx="13" cy="7" r="2"/><circle cx="11" cy="17" r="2"/></svg>';
    const quickRows=[['all','Бүгд'],['next7','7 хоногт төлөх'],['next30','1 сард төлөх'],['nearest','Төлөх хугацаа хамгийн ойр'],['overdue','Хугацаа хэтэрсэн']];
    const quick=quickRows.map(([value,label])=>`<button type="button" class="homeQuickFilter ${homeDebtView===value?'active':''}" aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${homeDebtView===value}" onclick="event.stopPropagation();setHomeDebtView('${value}')">${homeMenuIcon(value)}</button>`).join('');
    const options=homeMenuRows().map(([value,label])=>{const active=value==='name'?homeDebtView.startsWith('name-'):value==='invoice-date'?homeDebtView.startsWith('invoice-date-'):homeDebtView===value;return `<button type="button" role="menuitemradio" aria-checked="${active}" class="${active?'active':''}" onclick="event.stopPropagation();setHomeDebtView('${value}')"><span class="homeDebtMenuIcon">${homeMenuIcon(value)}</span><span>${esc(label)}</span></button>`;}).join('');
    return `<span class="homeQuickFilters">${quick}</span><button id="homeDebtMenuToggle" class="homeDebtMenuToggle" type="button" aria-label="Яаралтай бүртгэлийг шүүх, эрэмбэлэх" aria-haspopup="menu" aria-expanded="false" onclick="toggleHomeDebtMenu(event)">${sliders}</button><div id="homeDebtMenu" class="homeDebtMenu hide" role="menu" aria-label="Яаралтай бүртгэлийг шүүх, эрэмбэлэх" onclick="event.stopPropagation()">${options}</div>`;
  }
  function closeHomeDebtMenu(){const menu=document.getElementById('homeDebtMenu'),button=document.getElementById('homeDebtMenuToggle');menu?.classList.add('hide');button?.setAttribute('aria-expanded','false');}
  function toggleHomeDebtMenu(event){event?.stopPropagation?.();const menu=document.getElementById('homeDebtMenu'),button=document.getElementById('homeDebtMenuToggle');if(!menu||!button)return;const opening=menu.classList.contains('hide');menu.classList.toggle('hide',!opening);button.setAttribute('aria-expanded',String(opening));}
  function setHomeDebtView(value){
    homeDebtView=value==='name'?(homeDebtView==='name-asc'?'name-desc':'name-asc'):value==='invoice-date'?(homeDebtView==='invoice-date-asc'?'invoice-date-desc':'invoice-date-asc'):validHomeDebtView(value);
    try{localStorage.setItem(HOME_DEBT_VIEW_KEY,homeDebtView);}catch(_error){}
    closeHomeDebtMenu();window.render();
  }
  function showHomeDebtView(value){
    homeDebtView=validHomeDebtView(value);
    try{localStorage.setItem(HOME_DEBT_VIEW_KEY,homeDebtView);}catch(_error){}
    closeHomeDebtMenu();window.render();
    const scroll=()=>document.getElementById('homeUrgentDebtList')?.scrollIntoView?.({behavior:'smooth',block:'start'});
    if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(scroll);else window.setTimeout?.(scroll,0);
  }
  function homePeriodView(){return HOME_PERIOD_VIEWS.includes(homeDebtView)?homeDebtView:'today';}
  function homePeriodLabel(supplier=false){
    const action=supplier?'авах':'төлөх',view=homePeriodView();
    if(view==='next3')return `3 хоногт ${action}`;
    if(view==='next7')return `7 хоногт ${action}`;
    if(view==='next14')return `14 хоногт ${action}`;
    if(view==='this-month')return `Энэ сард ${action}`;
    if(view==='custom-date')return `Сонгосон хугацаанд ${action}`;
    return `Өнөөдөр ${action}`;
  }
  function periodDebtSummary(companies){
    const view=homePeriodView();let amount=0,count=0;
    for(const contact of companies||[]){
      const invoices=homeOpenInvoices(contact).filter(invoice=>homeInvoiceMatchesPeriod(invoice,view));
      if(!invoices.length)continue;
      count++;
      amount+=invoices.reduce((sum,invoice)=>sum+Math.max((Number(invoice.amount)||0)-(Number(invoice.paid)||0),0),0);
    }
    return {amount,count,view};
  }
  function homeCalendarIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>';}
  function homeClockIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';}
  function homePeriodOverlay(){
    let overlay=document.getElementById('homePeriodOverlay');
    if(overlay)return overlay;
    overlay=document.createElement('div');overlay.id='homePeriodOverlay';overlay.className='homePeriodOverlay hide';overlay.setAttribute('role','presentation');
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeHomePeriodFilter();});document.body.appendChild(overlay);return overlay;
  }
  function closeHomePeriodFilter(){document.getElementById('homePeriodOverlay')?.classList.add('hide');}
  function showHomePeriodFilter(){
    const selected=homePeriodView(),overlay=homePeriodOverlay(),supplier=window.__nayadActiveStore?.operation_role==='supplier';
    const rows=[['today','Өнөөдөр'],['next3','3 хоногт'],['next7','7 хоногт'],['next14','14 хоногт'],['this-month','Энэ сард'],['custom-date','Огноо сонгох']];
    overlay.innerHTML=`<section class="homePeriodDialog" role="dialog" aria-modal="true" aria-labelledby="homePeriodTitle"><div class="homePeriodHead"><h2 id="homePeriodTitle">${supplier?'Авах':'Төлөх'} хугацаа</h2><button type="button" class="homePeriodClose" onclick="closeHomePeriodFilter()" aria-label="Хаах">×</button></div><div class="homePeriodOptions">${rows.map(([value,label])=>{const active=selected===value,custom=value==='custom-date';return `<button type="button" class="homePeriodOption ${active?'selected':''}" aria-pressed="${active}" onclick="${custom?'showHomeCustomDateFilter()':`applyHomePeriodFilter('${value}')`}"><span class="homePeriodOptionIcon">${custom?homeCalendarIcon():homeClockIcon()}</span><span>${label}</span><span class="homePeriodCheck">${active?'✓':custom?'<svg class="homePeriodChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>':''}</span></button>`;}).join('')}</div></section>`;
    overlay.classList.remove('hide');overlay.querySelector?.('.homePeriodClose')?.focus?.();
  }
  function homeDateInputValue(value,fallback){return homeDateValue(value)!==null?String(value).slice(0,10):fallback;}
  function localDateText(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function showHomeCustomDateFilter(error=''){
    const overlay=homePeriodOverlay(),now=new Date(),today=localDateText(now),monthEnd=localDateText(new Date(now.getFullYear(),now.getMonth()+1,0));
    const start=homeDateInputValue(homeCustomRange.start,today),end=homeDateInputValue(homeCustomRange.end,monthEnd),calendar=homeCalendarIcon();
    overlay.innerHTML=`<section class="homePeriodDialog" role="dialog" aria-modal="true" aria-labelledby="homePeriodDateTitle"><div class="homePeriodHead"><h2 id="homePeriodDateTitle">Огноо сонгох</h2><button type="button" class="homePeriodClose" onclick="closeHomePeriodFilter()" aria-label="Хаах">×</button></div>${error?`<p class="homePeriodError">${esc(error)}</p>`:''}<div class="homePeriodDateFields"><div class="homePeriodField"><label for="homePeriodStart">Эхлэх огноо</label><div class="homePeriodInputWrap"><input id="homePeriodStart" type="date" value="${start}">${calendar}</div></div><div class="homePeriodField"><label for="homePeriodEnd">Дуусах огноо</label><div class="homePeriodInputWrap"><input id="homePeriodEnd" type="date" value="${end}">${calendar}</div></div></div><div class="homePeriodActions"><button type="button" class="secondary" onclick="showHomePeriodFilter()">Болих</button><button type="button" class="primary" onclick="applyHomeCustomDateFilter()">Шүүх</button></div></section>`;
    overlay.classList.remove('hide');document.getElementById('homePeriodStart')?.focus?.();
  }
  function applyHomePeriodFilter(value){closeHomePeriodFilter();showHomeDebtView(value);}
  function applyHomeCustomDateFilter(){
    const start=String(document.getElementById('homePeriodStart')?.value||''),end=String(document.getElementById('homePeriodEnd')?.value||'');
    if(homeDateValue(start)===null||homeDateValue(end)===null)return showHomeCustomDateFilter('Эхлэх болон дуусах огноог сонгоно уу.');
    if(homeDateValue(start)>homeDateValue(end))return showHomeCustomDateFilter('Эхлэх огноо дуусах огнооноос хойш байж болохгүй.');
    homeCustomRange={start,end};try{localStorage.setItem(HOME_DEBT_RANGE_KEY,JSON.stringify(homeCustomRange));}catch(_error){}
    closeHomePeriodFilter();showHomeDebtView('custom-date');
  }
  function todayDebtSummary(companies){
    let amount=0,count=0;
    for(const contact of companies||[]){
      const invoices=homeOpenInvoices(contact).filter(invoice=>homeDueDays(homeDue(invoice))===0);
      if(!invoices.length)continue;
      count++;
      amount+=invoices.reduce((sum,invoice)=>sum+Math.max((Number(invoice.amount)||0)-(Number(invoice.paid)||0),0),0);
    }
    return {amount,count};
  }
  function card(contact,pay=false){
    const c=contact||{},type=validType(c.contactType),risk=homeDebtRisk(c);
    const dueInfo=pay&&risk.kind==='overdue'&&risk.due?`<span class="homeDebtDue">Төлөх өдөр ${esc(homeDate(risk.due))}</span>`:'';
    const chevron=pay?'<svg class="homeDebtChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>':'';
    const subline=pay?`${c.invoices?.length||0} падаан`:`${typeLabel(type)}<span class="contactTypeText">· ${c.invoices?.length||0} падаан</span>`;
    return `<div class="card ${pay?'homeDebtCard':''}" onclick="company(${c.id})"><div class="row"><div class="company">${avatar(c)}<div><b>${esc(c.name)}</b><span>${subline}</span></div></div><div class="homeDebtAmount"><div class="homeDebtValue"><div class="amount" style="color:${risk.color}">${window.money(c.debt)}</div>${dueInfo}</div>${chevron}</div></div></div>`;
  }
  const contactCallPhone=contact=>validType(contact?.contactType)===PERSON?contact?.phone:contact?.salesPhone;
  const contactCallHref=value=>{
    const raw=String(value||'').trim(),digits=raw.replace(/\D/g,'');
    if(!digits)return '';
    return `${raw.startsWith('+')?'+':''}${digits}`;
  };
  const contactCallIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5 10 7.3 8.3 9.5c1.2 2.4 3.1 4.3 5.5 5.5l2.2-1.7 3.8 2.8c.5.4.7 1 .5 1.6l-.6 2c-.2.7-.9 1.2-1.7 1.2C10.2 20.9 3.1 13.8 3.1 6c0-.8.5-1.5 1.2-1.7l2-.6c.4-.1.7-.1.9-.2Z"></path></svg>';
  function setContactCallNoticeMode(active){
    document.getElementById('modal')?.classList?.toggle?.('contactCallNoticeModal',Boolean(active));
    document.getElementById('sheet')?.classList?.toggle?.('contactCallNoticeSheet',Boolean(active));
  }
  function closeMissingContactPhone(){setContactCallNoticeMode(false);window.closeSheet();}
  function openMissingContactEdit(id){setContactCallNoticeMode(false);editCompany(id);}
  function showMissingContactPhone(id){
    const contact=data.companies.find(c=>c.id===id);if(!contact)return;
    const organization=validType(contact.contactType)===ORGANIZATION;
    const title=organization?'Худалдааны төлөөлөгчийн утас бүртгэгдээгүй':'Утасны дугаар бүртгэгдээгүй';
    const message=organization?'Харилцагчийн “Мэдээлэл засах” хэсгээс худалдааны төлөөлөгчийн утасны дугаарыг оруулна уу.':'Харилцагчийн “Мэдээлэл засах” хэсгээс утасны дугаарыг оруулна уу.';
    window.sheet(`<h2>${title}</h2><p class="contactCallNoticeText">${message}</p><div class="actions"><button type="button" class="secondary" onclick="closeMissingContactPhone()">Болих</button><button type="button" class="primary" onclick="openMissingContactEdit(${contact.id})">Мэдээлэл засах</button></div>`);
    setContactCallNoticeMode(true);
  }
  function contactListRow(contact){
    const c=contact||{},type=validType(c.contactType),debt=Math.max(Number(c.debt)||0,0),callHref=contactCallHref(contactCallPhone(c));
    const call=callHref?`<a class="contactCallButton" href="tel:${esc(callHref)}" aria-label="${esc(c.name)} руу залгах" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">${contactCallIcon}</a>`:`<button type="button" class="contactCallButton" aria-label="${esc(c.name)}-ийн утасны дугаарыг оруулах" onclick="event.stopPropagation();showMissingContactPhone(${c.id})" onkeydown="event.stopPropagation()">${contactCallIcon}</button>`;
    return `<div class="contactListRow ${c.status==='inactive'?'inactive':''}" role="button" tabindex="0" onclick="company(${c.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();company(${c.id})}"><div class="contactListMain">${avatar(c)}<div class="contactListIdentity"><b>${esc(c.name)}</b><span class="contactListDebt">${window.money(debt)}</span></div>${call}</div></div>`;
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
  function contactFilterIcon(type){
    if(type==='all')return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>';
    return icon(type);
  }
  function contactFilterControls(){
    const sliders='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h7M15 7h5M4 17h5M13 17h7"></path><circle cx="13" cy="7" r="2"></circle><circle cx="11" cy="17" r="2"></circle></svg>';
    const filters=[['all','Бүгд'],[PERSON,'Хувь хүн'],[ORGANIZATION,'Байгууллага']];
    const options=filters.map(([value,label])=>{const active=contactListType===value;return `<button type="button" role="menuitemradio" aria-checked="${active}" class="${active?'active':''}" data-contact-filter="${value}" onclick="event.stopPropagation();setContactListFilter('${value}')"><span class="contactFilterMenuIcon">${contactFilterIcon(value)}</span><span>${label}</span><span class="contactFilterCheck" aria-hidden="true">${active?'✓':''}</span></button>`;}).join('');
    return `<button id="contactFilterToggle" class="contactFilterToggle" type="button" aria-label="Харилцагчийн төрлийг шүүх" aria-haspopup="menu" aria-expanded="false" onclick="toggleContactFilterMenu(event)">${sliders}</button><div id="contactFilterMenu" class="contactFilterMenu hide" role="menu" aria-label="Харилцагчийн төрөл" onclick="event.stopPropagation()">${options}</div>`;
  }
  function closeContactFilterMenu(){const menu=document.getElementById('contactFilterMenu'),button=document.getElementById('contactFilterToggle');menu?.classList.add('hide');button?.setAttribute('aria-expanded','false');}
  function toggleContactFilterMenu(event){event?.stopPropagation?.();const menu=document.getElementById('contactFilterMenu'),button=document.getElementById('contactFilterToggle');if(!menu||!button)return;const opening=menu.classList.contains('hide');menu.classList.toggle('hide',!opening);button.setAttribute('aria-expanded',String(opening));}
  function companies(){
    window.sync();
    const storeName=window.__nayadActiveStore?.name||'Сонгосон дэлгүүр',count=(data.companies||[]).length;
    return `<div class="contactListHead"><div class="name">Харилцагчид</div><span class="contactStoreMeta">${esc(storeName)} · ${count} харилцагч</span></div><div class="contactSearchRow"><div class="contactSearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 5 5"></path></svg><input class="search" value="${esc(contactListQuery)}" placeholder="Нэр эсвэл утасны дугаараар хайх" oninput="filter(this.value)"></div>${contactFilterControls()}</div><div id="contactUnifiedList" class="contactList">${filteredContacts().map(contactListRow).join('')||emptyList('Харилцагч бүртгэгдээгүй байна.')}</div><button type="button" class="contactAddButton" onclick="addCompany()">+ ХАРИЛЦАГЧ НЭМЭХ</button>`;
  }
  function filterContacts(query){
    contactListQuery=String(query||'');renderContactList();
  }
  function setContactListFilter(type){
    contactListType=type==='all'?'all':validType(type);
    document.querySelectorAll('[data-contact-filter]').forEach(button=>{const active=button.dataset.contactFilter===contactListType;button.classList.toggle('active',active);button.setAttribute('aria-checked',String(active));const check=button.querySelector?.('.contactFilterCheck');if(check)check.textContent=active?'✓':'';});
    closeContactFilterMenu();
    renderContactList();
  }
  function company(id){
    selected=data.companies.find(c=>c.id===id);if(!selected)return;window.sync();const c=selected,type=validType(c.contactType),person=type===PERSON;
    const details=person
      ?`<div class="invoice"><div><small>Утас</small><b>${esc(c.phone||'—')}</b></div>${window.tel(c.phone)}</div><div class="invoice"><div><small>Хаяг</small><b>${esc(c.address||'—')}</b></div></div>`
      :`<div class="invoice"><div><small>Утас</small><b>${esc(c.phone||'—')}</b></div>${window.tel(c.phone)}</div><div class="invoice"><div><small>Хаяг</small><b>${esc(c.address||'—')}</b></div></div><div class="invoice"><div><small>Захирал</small><b>${esc(c.director||'—')}</b></div>${window.tel(c.directorPhone)}</div><div class="invoice"><div><small>Худалдааны төлөөлөгч</small><b>${esc(c.sales||'—')}</b></div>${window.tel(c.salesPhone)}</div>`;
    const note=c.note?`<div class="invoice"><div><small>Нэмэлт тэмдэглэл</small><b>${esc(c.note)}</b></div></div>`:'';
    const bank=`<div class="invoice"><div><small>Банк</small><b>${esc(c.bank||'—')}</b></div></div>${c.bankIban?`<div class="invoice"><div><small>IBAN</small><b>${esc(c.bankIban)}</b></div></div>`:''}<div class="invoice"><div><small>Дансны дугаар</small><b>${esc(c.bankAccount||'—')}</b></div></div><div class="invoice"><div><small>Данс эзэмшигчийн нэр</small><b>${esc(c.bankAccountHolder||'—')}</b></div></div>`;
    const visibleInvoices=(c.invoices||[]).filter(invoice=>(invoice.status||'confirmed')!=='draft');
    document.getElementById('content').innerHTML=`<button class="back" onclick="page='companies';render()">← Буцах</button><div class="center">${avatar(c)}<h2 style="margin:8px 0 2px">${esc(c.name)}</h2><div>${companyIconLabel(c)}</div><div class="sub">${c.status==='inactive'?'⚪ Идэвхгүй':'🟢 Идэвхтэй'}</div><div class="bigAmount">${window.money(c.debt)}</div><div class="sub">Нийт өр</div></div><div class="sectionTitle">Харилцагчийн мэдээлэл</div><div class="card">${details}${note}${bank}</div><div class="sectionTitle">Падаанууд</div><div class="card">${visibleInvoices.length?visibleInvoices.map(i=>{const count=Array.isArray(i.image_urls)?i.image_urls.length:(i.image_url?1:0),balance=Math.max((Number(i.amount)||0)-(Number(i.paid)||0),0);return `<div class="invoice invoiceClickable" role="button" tabindex="0" onclick="window.showInvoiceDetails('${String(i.id||'').replace(/'/g,"\\'")}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.showInvoiceDetails('${String(i.id||'').replace(/'/g,"\\'")}')}"><div><small>${esc(i.date)} · ${esc(i.no||'Дугааргүй')}</small><b>${window.money(i.amount)}</b>${count?`<span style="display:block;color:var(--muted);font-size:10px;margin-top:4px">🖼 ${count} хуудастай зураг</span>`:'<span style="display:block;color:var(--muted);font-size:10px;margin-top:4px">Зураггүй</span>'}</div><div class="${balance>0?'redText':'greenText'}">${balance>0?window.money(balance):'Төлөгдсөн'}<small class="detailHint">Дэлгэрэнгүй →</small></div></div>`}).join(''):'<div class="sub">Падаан алга.</div>'}</div><button class="primary full" onclick="invoice(${c.id})">＋ Падаан нэмэх</button><button class="secondary full" onclick="payment(${c.id})">Төлбөр бүртгэх</button><button type="button" class="secondary full" onclick="event.stopPropagation();window.editCompany(Number(${c.id}))">✎ Мэдээлэл засах</button>`;
  }
  function readContact(prefix){
    return {contactType:validType(fieldValue(prefix+'ContactType')),name:fieldValue(prefix+'Name'),phone:fieldValue(prefix+'Phone'),address:fieldValue(prefix+'Address'),director:fieldValue(prefix+'Director'),directorPhone:fieldValue(prefix+'DirectorPhone'),sales:fieldValue(prefix+'Sales'),salesPhone:fieldValue(prefix+'SalesPhone'),note:fieldValue(prefix+'Note'),bank:fieldValue(prefix+'Bank'),bankIban:cleanBankPart(fieldValue(prefix+'BankIban')).replace(/^MN/,''),bankAccount:cleanBankPart(fieldValue(prefix+'BankAccount')),bankAccountHolder:fieldValue(prefix+'BankAccountHolder')};
  }
  function saveCompany(){
    if(!requireCompletedRegistration())return;
    const draft=readContact('new');if(!draft.name)return window.toast('Нэр эсвэл байгууллагын нэрийг оруулна уу.');if(!draft.phone)return window.toast('Утасны дугаараа оруулна уу.');if(!requireBank(draft.bank,draft.bankAccount,draft.bankAccountHolder))return;
    if(data.companies.some(c=>String(c.name||'').trim().toLowerCase()===draft.name.toLowerCase()))return window.toast('Ийм нэртэй харилцагч бүртгэлтэй байна.');
    data.companies.push({id:Date.now(),...draft,status:'active',color:draft.contactType===PERSON?'green':'blue',invoices:[]});window.save();window.closeSheet();window.render();window.toast('Харилцагч бүртгэгдлээ.');
  }
  function editCompany(id){setContactCallNoticeMode(false);selected=data.companies.find(c=>c.id===id);if(!selected)return;if(pendingContactLogo?.objectUrl)URL.revokeObjectURL(pendingContactLogo.objectUrl);pendingContactLogo=null;editContactDraft={...selected};showContactForm(validType(selected.contactType),editContactDraft);}
  function saveEdit(){
    if(!selected)return;const draft=readContact('e');if(!draft.name)return window.toast('Нэр эсвэл байгууллагын нэрийг оруулна уу.');if(!draft.phone)return window.toast('Утасны дугаараа оруулна уу.');if(!requireBank(draft.bank,draft.bankAccount,draft.bankAccountHolder))return;
    if(data.companies.some(c=>c!==selected&&String(c.name||'').trim().toLowerCase()===draft.name.toLowerCase()))return window.toast('Ийм нэртэй харилцагч бүртгэлтэй байна.');
    Object.assign(selected,draft,{status:fieldValue('eStatus')||'active'});window.save();window.closeSheet();page='companies';window.render();window.toast('Мэдээлэл шинэчлэгдлээ.');
  }
  document.addEventListener?.('click',event=>{if(!event.target?.closest?.('.homeUrgentHead'))closeHomeDebtMenu();if(!event.target?.closest?.('.contactSearchRow'))closeContactFilterMenu();if(event.target?.id==='modal')setContactCallNoticeMode(false);});
  document.addEventListener?.('keydown',event=>{if(event.key==='Escape'){closeHomeDebtMenu();closeContactFilterMenu();closeHomePeriodFilter();setContactCallNoticeMode(false);}});
  window.__nayadHomeDebtList=homeDebtCompanies;window.__nayadHomeDebtControls=homeDebtControls;window.__nayadHomeDebtView=()=>homeDebtView;window.__nayadTodayDebtSummary=todayDebtSummary;window.__nayadPeriodDebtSummary=periodDebtSummary;window.__nayadHomePeriodLabel=homePeriodLabel;window.__nayadHomeDebtRisk=homeDebtRisk;window.toggleHomeDebtMenu=toggleHomeDebtMenu;window.closeHomeDebtMenu=closeHomeDebtMenu;window.setHomeDebtView=setHomeDebtView;window.showHomeDebtView=showHomeDebtView;window.showHomePeriodFilter=showHomePeriodFilter;window.closeHomePeriodFilter=closeHomePeriodFilter;window.showHomeCustomDateFilter=showHomeCustomDateFilter;window.applyHomePeriodFilter=applyHomePeriodFilter;window.applyHomeCustomDateFilter=applyHomeCustomDateFilter;
  window.__nayadGetContactLogoChange=()=>pendingContactLogo?{file:pendingContactLogo.file||null,remove:Boolean(pendingContactLogo.remove)}:{file:null,remove:false};window.addCompany=showContactTypePicker;window.showContactTypePicker=showContactTypePicker;window.selectContactType=selectContactType;window.showContactForm=showContactForm;window.changeEditContactType=changeEditContactType;window.previewContactLogo=previewContactLogo;window.removeContactLogo=removeContactLogo;window.copyBankIban=copyBankIban;window.copyBankAccount=copyBankAccount;window.card=card;window.companies=companies;window.filter=filterContacts;window.setContactListFilter=setContactListFilter;window.toggleContactFilterMenu=toggleContactFilterMenu;window.closeContactFilterMenu=closeContactFilterMenu;window.company=company;window.showMissingContactPhone=showMissingContactPhone;window.closeMissingContactPhone=closeMissingContactPhone;window.openMissingContactEdit=openMissingContactEdit;window.saveCompany=saveCompany;window.editCompany=editCompany;window.saveEdit=saveEdit;
  injectStyle();
})();
