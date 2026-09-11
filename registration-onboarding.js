/* NAYAD approved account-first registration flow. */
(function(){
  const BUYER_TYPES=[
    'Хүнсний дэлгүүр, супермаркет',
    'Ресторан, кафе, баар',
    'Зочид буудал, амралтын газар',
    'Эмийн сан',
    'Барилгын материал',
    'Авто засвар, сэлбэг',
    'Бөөний худалдаа',
    'Аж ахуйн бараа',
    'Гоо сайхан, салон',
    'Цахилгаан бараа, техник',
    'Хувцас, гутал',
    'Үйлдвэрлэл, цех'
  ];
  const CATEGORY_ICONS=['basket','utensils','hotel','pill','blocks','wrench','package','house','sparkles','plug','shirt','factory'];
  const ICON_PATHS={
    truck:'<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    basket:'<path d="M3 10h18l-2 10H5L3 10zM8 10l4-6 4 6"/><path d="M8 14v2M12 14v2M16 14v2"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    building:'<path d="M4 21V4h11v17M15 9h5v12M8 8h3M8 12h3M8 16h3M18 13v3"/>',
    utensils:'<path d="M6 3v8M3 3v5c0 2 6 2 6 0V3M6 11v10M16 3v18M16 3c3 1 5 4 5 7h-5"/>',
    hotel:'<path d="M3 20V6M21 20v-8H3v8M7 12V8h5v4M3 17h18"/>',
    pill:'<path d="M8 19a5 5 0 0 1-3-9l6-6a5 5 0 0 1 7 7l-6 6a5 5 0 0 1-4 2zM8 7l9 9"/>',
    blocks:'<rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><rect x="8" y="3" width="8" height="8" rx="1"/>',
    wrench:'<path d="M14 7a5 5 0 0 0-7 6L3 17l4 4 4-4a5 5 0 0 0 6-7l-3 3-3-3 3-3z"/>',
    package:'<path d="M4 7l8-4 8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10"/>',
    house:'<path d="M3 11l9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    sparkles:'<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/>',
    plug:'<path d="M8 3v6M16 3v6M6 9h12v3a6 6 0 0 1-12 0V9zM12 18v3"/>',
    shirt:'<path d="M8 4l4 2 4-2 5 4-3 4-2-2v11H8V10l-2 2-3-4 5-4z"/>',
    factory:'<path d="M3 21V10l6 3V9l6 3V4h6v17H3zM7 17h2M13 17h2M18 8h1"/>',
    ellipsis:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  let state=null;
  let creating=false;

  function isRegistrationComplete(registration){
    return Boolean(registration?.id&&registration?.registration_completed_at);
  }

  const STYLE=`<style id="nayad-registration-styles">
  .nayadRegistration{position:fixed;inset:0;z-index:120;overflow:auto;background:var(--bg);color:var(--text)}
  .nayadRegistrationShell{width:100%;max-width:430px;min-height:100svh;margin:0 auto;background:var(--bg);display:flex;flex-direction:column;box-shadow:0 0 40px rgba(0,0,0,.08)}
  .nayadRegistrationTop{height:68px;flex:0 0 68px;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;padding:0 14px;border-bottom:1px solid var(--line);background:var(--surface)}
  .nayadRegistrationBack{width:40px;height:40px;padding:0;border-radius:12px;background:transparent;color:var(--text);display:grid;place-items:center;font-size:22px}
  .nayadRegistrationBrand{text-align:center;font-weight:900;font-size:18px;letter-spacing:-.5px}.nayadRegistrationBrand .y{color:var(--yellow)}
  .nayadRegistrationBody{min-height:calc(100svh - 68px);padding:25px 18px calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column}
  .nayadRegistrationKicker{margin:0 0 7px;color:#a77800;font-size:11px;font-weight:900;letter-spacing:.8px;text-transform:uppercase}
  html.nightMode .nayadRegistrationKicker{color:#ffd34a}
  .nayadRegistrationBody h1{margin:0;font-size:27px;line-height:1.12;letter-spacing:-.7px}.nayadRegistrationIntro{margin:9px 0 20px;color:var(--muted);font-size:13px;line-height:1.55}
  .nayadRegistrationChoices{display:grid;gap:10px}.nayadRegistrationRole{width:100%;padding:15px;border:1px solid var(--line);border-radius:17px;background:var(--surface);color:var(--text);display:grid;grid-template-columns:44px 1fr;gap:12px;text-align:left;box-shadow:var(--shadow-sm)}
  .nayadRegistrationRole.selected{border-color:var(--yellow);background:var(--yellow-soft);box-shadow:0 0 0 2px rgba(255,193,7,.13)}
  .nayadRegistrationIcon{width:44px;height:44px;border-radius:13px;background:var(--surface-2);display:grid;place-items:center;font-size:21px;color:var(--muted)}.selected .nayadRegistrationIcon,.nayadRegistrationSummaryIcon{background:var(--yellow);color:#171717}.nayadRegistrationIcon svg,.nayadRegistrationSummaryIcon svg,.nayadRegistrationType svg,.nayadRegistrationCategory svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .nayadRegistrationRole b,.nayadRegistrationRole span{display:block}.nayadRegistrationRole b{font-size:15px}.nayadRegistrationRole span span{margin-top:5px;color:var(--muted);font-size:11px;line-height:1.4}
  .nayadRegistrationNote{margin:13px 2px 0;color:var(--muted);font-size:11px;line-height:1.5}.nayadRegistrationGrow{flex:1;min-height:25px}
  .nayadRegistrationPrimary{width:100%;min-height:50px;background:var(--yellow);color:#171717;font-size:14px;font-weight:900;border-radius:15px}.nayadRegistrationPrimary:disabled{opacity:.38}
  .nayadRegistrationTypes{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}.nayadRegistrationType{min-height:88px;padding:14px;border:1px solid var(--line);border-radius:15px;background:var(--surface);color:var(--text);text-align:left}.nayadRegistrationType.selected{border-color:var(--yellow);background:var(--yellow-soft)}.nayadRegistrationType i{display:block;width:32px;height:32px;margin-bottom:10px;border-radius:9px;background:var(--surface-2);font-style:normal;display:grid;place-items:center}.nayadRegistrationType.selected i{background:var(--yellow);color:#171717}
  .nayadRegistrationLabel{display:block;margin:0 0 7px;font-size:12px;font-weight:850}.nayadRegistrationInput{width:100%;min-height:49px;padding:13px 14px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);font-size:14px;outline:none}.nayadRegistrationInput:focus{border-color:#d3a300;box-shadow:0 0 0 3px rgba(255,193,7,.14)}
  .nayadRegistrationHelper{margin:7px 2px 0;color:var(--muted);font-size:11px;line-height:1.5}
  .nayadRegistrationCategories{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}.nayadRegistrationCategory{min-height:70px;padding:10px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);display:flex;align-items:center;gap:9px;text-align:left;font-size:11px;line-height:1.3}.nayadRegistrationCategory.selected{border-color:var(--yellow);background:var(--yellow-soft)}.nayadRegistrationCategory i{width:28px;height:28px;flex:0 0 28px;border-radius:9px;background:var(--surface-2);display:grid;place-items:center;font-style:normal;font-size:14px}.nayadRegistrationCategory.selected i{background:var(--yellow);color:#171717}
  .nayadRegistrationSelected{display:flex;align-items:center;gap:11px;padding:12px;margin-bottom:18px;border:1px solid var(--line);border-radius:15px;background:var(--surface)}.nayadRegistrationSelected span span,.nayadRegistrationSummaryHead span span{display:block;color:var(--muted);font-size:10px}.nayadRegistrationSelected b,.nayadRegistrationSummaryHead b{display:block;margin-top:4px;font-size:13px}
  .nayadRegistrationSummary{overflow:hidden;border:1px solid var(--line);border-radius:17px;background:var(--surface)}.nayadRegistrationSummaryHead{display:flex;align-items:center;gap:11px;padding:14px;background:var(--yellow-soft)}.nayadRegistrationSummaryIcon{width:40px;height:40px;flex:0 0 40px;border-radius:12px;display:grid;place-items:center;font-size:19px}.nayadRegistrationSummaryRow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:10px;padding:14px;border-top:1px solid var(--line);font-size:11px}.nayadRegistrationSummaryRow span{color:var(--muted)}.nayadRegistrationSummaryRow b{text-align:right;overflow-wrap:anywhere}
  .nayadRegistrationInfo{margin:13px 0 0;padding:12px;border-radius:13px;background:var(--surface-2);color:var(--muted);font-size:11px;line-height:1.5}
  @media(min-width:600px){.nayadRegistration{padding:28px}.nayadRegistrationShell{min-height:calc(100svh - 56px);border-radius:28px;overflow:hidden}.nayadRegistrationBody{min-height:calc(100svh - 124px)}}
  </style>`;

  function esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function root(){return document.getElementById('nayadRegistrationRoot');}
  function icon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]||ICON_PATHS.ellipsis}</svg>`;}
  function roleLabel(){return state?.operationRole==='supplier'?'Нийлүүлэгч':'Худалдан авагч';}
  function entityLabel(){return state?.entityType==='person'?'Хувь хүн':'Байгууллага';}
  function selectedBusinessType(){return state?.businessType==='Бусад'?String(state.customBusinessType||'').trim():state?.businessType||'';}
  function categoryButton(type,index){return `<button class="nayadRegistrationCategory ${state.businessType===type?'selected':''}" type="button" onclick="nayadRegistrationChooseBusinessType('${esc(type)}')"><i>${icon(CATEGORY_ICONS[index])}</i><span>${esc(type)}</span></button>`;}
  function frame(content){return `<div class="nayadRegistrationShell"><div class="nayadRegistrationTop"><button class="nayadRegistrationBack" type="button" onclick="nayadRegistrationBack()" aria-label="Буцах">←</button><div class="nayadRegistrationBrand">NA<span class="y">Y</span>AD</div><span></span></div><div class="nayadRegistrationBody">${content}</div></div>`;}

  function roleStep(){
    return frame(`<p class="nayadRegistrationKicker">Бүртгэл нэмэх</p><h1>Та аль чиглэлээр ажилладаг вэ?</h1><p class="nayadRegistrationIntro">Өөрт тохирох нэг чиглэлийг сонгоно уу.</p><div class="nayadRegistrationChoices"><button class="nayadRegistrationRole ${state.operationRole==='supplier'?'selected':''}" type="button" onclick="nayadRegistrationChooseRole('supplier')"><span class="nayadRegistrationIcon">${icon('truck')}</span><span><b>Нийлүүлэгч</b><span>Би бараа, бүтээгдэхүүн нийлүүлдэг</span><span>Харилцагчдаас авах авлага болон орсон төлбөрөө бүртгэнэ.</span></span></button><button class="nayadRegistrationRole ${state.operationRole==='buyer'?'selected':''}" type="button" onclick="nayadRegistrationChooseRole('buyer')"><span class="nayadRegistrationIcon">${icon('basket')}</span><span><b>Худалдан авагч</b><span>Би бараа авч, үйл ажиллагаандаа ашигладаг эсвэл борлуулдаг</span><span>Авсан барааны падаан, нийлүүлэгчдэд төлөх өглөгөө бүртгэнэ.</span></span></button></div><p class="nayadRegistrationNote">Хоёр чиглэлээр ажилладаг бол дараа нь нөгөө төрлийн бүртгэл нэмж болно.</p><div class="nayadRegistrationGrow"></div><button class="nayadRegistrationPrimary" type="button" ${state.operationRole?'':'disabled'} onclick="nayadRegistrationContinue()">Үргэлжлүүлэх</button>`);
  }

  function supplierDetailsStep(){
    return frame(`<p class="nayadRegistrationKicker">Нийлүүлэгч</p><h1>Нийлүүлэгчийн бүртгэл</h1><p class="nayadRegistrationIntro">Бараа, бүтээгдэхүүн нийлүүлсэн бүртгэл, авах авлага болон орсон төлбөрөө хөтөлнө.</p><span class="nayadRegistrationLabel">Нийлүүлэгчийн төрөл</span><div class="nayadRegistrationTypes"><button class="nayadRegistrationType ${state.entityType==='person'?'selected':''}" type="button" onclick="nayadRegistrationChooseEntity('person')"><i>${icon('user')}</i>Хувь хүн</button><button class="nayadRegistrationType ${state.entityType==='organization'?'selected':''}" type="button" onclick="nayadRegistrationChooseEntity('organization')"><i>${icon('building')}</i>Байгууллага</button></div><label class="nayadRegistrationLabel" for="nayadRegistrationName">Нийлүүлэгчийн нэр</label><input id="nayadRegistrationName" class="nayadRegistrationInput" maxlength="80" autocomplete="organization" placeholder="Нэрээ оруулна уу" value="${esc(state.name)}" oninput="nayadRegistrationSetName(this.value)"><div class="nayadRegistrationGrow"></div><button class="nayadRegistrationPrimary" type="button" ${state.entityType&&state.name.trim()?'':'disabled'} onclick="nayadRegistrationContinue()">Үргэлжлүүлэх</button>`);
  }

  function buyerCategoryStep(){
    const other=state.businessType==='Бусад'?`<label class="nayadRegistrationLabel" for="nayadCustomBusinessType">Үйл ажиллагааныхаа төрлийг бичнэ үү</label><input id="nayadCustomBusinessType" class="nayadRegistrationInput" maxlength="80" value="${esc(state.customBusinessType)}" oninput="nayadRegistrationSetCustomBusinessType(this.value)">`:'';
    const canContinue=state.businessType&&selectedBusinessType();
    return frame(`<p class="nayadRegistrationKicker">Худалдан авагч</p><h1>Үйл ажиллагааны төрөл</h1><p class="nayadRegistrationIntro">Өөрийн үйл ажиллагаанд хамгийн ойр нэг төрлийг сонгоно уу.</p><div class="nayadRegistrationCategories">${BUYER_TYPES.map(categoryButton).join('')}<button class="nayadRegistrationCategory ${state.businessType==='Бусад'?'selected':''}" type="button" onclick="nayadRegistrationChooseBusinessType('Бусад')"><i>${icon('ellipsis')}</i><span>Бусад</span></button></div>${other}<div class="nayadRegistrationGrow"></div><button class="nayadRegistrationPrimary" type="button" ${canContinue?'':'disabled'} onclick="nayadRegistrationContinue()">Үргэлжлүүлэх</button>`);
  }

  function buyerNameStep(){
    return frame(`<p class="nayadRegistrationKicker">Худалдан авагч</p><h1>Худалдан авагчийн бүртгэл</h1><p class="nayadRegistrationIntro">Авсан барааны падаан болон нийлүүлэгчдэд төлөх өглөгөө энд бүртгэнэ.</p><div class="nayadRegistrationSelected"><span class="nayadRegistrationSummaryIcon">${icon('basket')}</span><span><span>Сонгосон төрөл</span><b>${esc(selectedBusinessType())}</b></span></div><label class="nayadRegistrationLabel" for="nayadRegistrationName">Үйл ажиллагааны нэр</label><input id="nayadRegistrationName" class="nayadRegistrationInput" maxlength="80" autocomplete="organization" placeholder="Нэрээ оруулна уу" value="${esc(state.name)}" oninput="nayadRegistrationSetName(this.value)"><p class="nayadRegistrationHelper">Дэлгүүр, үйлчилгээ, байгууллагын нэрээ оруулна. Албан нэргүй бол өөрийн нэрээ ашиглаж болно.</p><div class="nayadRegistrationGrow"></div><button class="nayadRegistrationPrimary" type="button" ${state.name.trim()?'':'disabled'} onclick="nayadRegistrationContinue()">Үргэлжлүүлэх</button>`);
  }

  function reviewStep(){
    const supplier=state.operationRole==='supplier';
    const completing=Boolean(state.completionId);
    const extra=supplier?`<div class="nayadRegistrationSummaryRow"><span>Төрөл</span><b>${entityLabel()}</b></div><div class="nayadRegistrationSummaryRow"><span>Нэр</span><b>${esc(state.name)}</b></div>`:`<div class="nayadRegistrationSummaryRow"><span>Үйл ажиллагааны төрөл</span><b>${esc(selectedBusinessType())}</b></div><div class="nayadRegistrationSummaryRow"><span>Үйл ажиллагааны нэр</span><b>${esc(state.name)}</b></div>`;
    const info=supplier?'Үүсгэсний дараа бараа нийлүүлсэн бүртгэл, авах авлага болон орсон төлбөрөө хөтөлнө.':'Үүсгэсний дараа авсан барааны падаан болон нийлүүлэгчдэд төлөх өглөгөө бүртгэнэ.';
    return frame(`<p class="nayadRegistrationKicker">${roleLabel()}</p><h1>Бүртгэлээ шалгах</h1><p class="nayadRegistrationIntro">Оруулсан мэдээллээ шалгаад ${supplier?'нийлүүлэгчийн':'худалдан авагчийн'} бүртгэлээ ${completing?'гүйцээнэ':'үүсгэнэ'} үү.</p><div class="nayadRegistrationSummary"><div class="nayadRegistrationSummaryHead"><span class="nayadRegistrationSummaryIcon">${icon(supplier?(state.entityType==='person'?'user':'building'):'basket')}</span><span><b>${esc(state.name)}</b><span>${roleLabel()}ийн бүртгэл</span></span></div><div class="nayadRegistrationSummaryRow"><span>Чиглэл</span><b>${roleLabel()}</b></div>${extra}</div><p class="nayadRegistrationInfo">ⓘ &nbsp;${info}</p><div class="nayadRegistrationGrow"></div><button id="nayadCreateRegistrationButton" class="nayadRegistrationPrimary" type="button" onclick="nayadRegistrationCreate()">${completing?'Бүртгэл гүйцээх':'Бүртгэл үүсгэх'}</button>`);
  }

  function render(){
    const element=root();if(!element||!state)return;
    let html=roleStep();
    if(state.step==='supplier-details')html=supplierDetailsStep();
    else if(state.step==='buyer-category')html=buyerCategoryStep();
    else if(state.step==='buyer-name')html=buyerNameStep();
    else if(state.step==='review')html=reviewStep();
    element.innerHTML=html;
  }

  function show(options={}){
    if(creating)return;
    if(root()&&state)return;
    if(!document.getElementById('nayad-registration-styles'))document.head.insertAdjacentHTML('beforeend',STYLE);
    let element=root();
    if(!element){element=document.createElement('div');element.id='nayadRegistrationRoot';element.className='nayadRegistration';document.body.appendChild(element);}
    const candidate=options.existingRegistration||(options.initial?window.__nayadPendingRegistration:null)||null;
    const completionId=candidate?.role==='owner'&&!isRegistrationComplete(candidate)?String(candidate.id||''):'';
    state={step:'role',operationRole:'',entityType:'',businessType:'',customBusinessType:'',name:'',initial:Boolean(options.initial),completionId,createdId:''};
    document.getElementById('landing')?.classList.add('hide');
    document.getElementById('login')?.classList.add('hide');
    if(state.initial)document.getElementById('app')?.classList.add('hide');
    render();
  }

  function close(){root()?.remove();state=null;}
  async function back(){
    if(!state||creating)return;
    if(state.step==='review'){state.step=state.operationRole==='supplier'?'supplier-details':'buyer-name';render();return;}
    if(state.step==='supplier-details'||state.step==='buyer-category'){state.step='role';render();return;}
    if(state.step==='buyer-name'){state.step='buyer-category';render();return;}
    const initial=state.initial;close();
    if(initial){await (window.nayadSupabase||window.sb)?.auth?.signOut?.({scope:'local'});if(typeof window.showLoginScreen==='function')await window.showLoginScreen();}
    else if(typeof window.showNayadStorePicker==='function')window.showNayadStorePicker();
  }
  function chooseRole(value){if(!state||!['supplier','buyer'].includes(value))return;state.operationRole=value;render();}
  function chooseEntity(value){if(!state||!['person','organization'].includes(value))return;state.entityType=value;render();}
  function chooseBusinessType(value){if(!state||(!BUYER_TYPES.includes(value)&&value!=='Бусад'))return;state.businessType=value;render();if(value==='Бусад')setTimeout(()=>document.getElementById('nayadCustomBusinessType')?.focus(),0);}
  function setName(value){if(!state)return;state.name=String(value||'').slice(0,80);document.querySelector('.nayadRegistrationPrimary')?.toggleAttribute('disabled',!state.name.trim());}
  function setCustomBusinessType(value){if(!state)return;state.customBusinessType=String(value||'').slice(0,80);document.querySelector('.nayadRegistrationPrimary')?.toggleAttribute('disabled',!state.customBusinessType.trim());}
  function next(){
    if(!state)return;
    if(state.step==='role'){
      if(!state.operationRole)return;
      state.step=state.operationRole==='supplier'?'supplier-details':'buyer-category';
    }else if(state.step==='supplier-details'){
      if(!state.entityType||!state.name.trim())return;
      state.step='review';
    }else if(state.step==='buyer-category'){
      if(!selectedBusinessType())return;
      state.step='buyer-name';
    }else if(state.step==='buyer-name'){
      if(!state.name.trim())return;
      state.step='review';
    }
    render();
  }

  async function create(){
    if(!state||state.step!=='review'||creating)return;
    const client=window.nayadSupabase||window.sb;
    const name=state.name.trim();
    const operationRole=state.operationRole;
    const businessType=operationRole==='buyer'?selectedBusinessType():null;
    const entityType=operationRole==='supplier'?state.entityType:null;
    if(!client||!name||!operationRole||operationRole==='buyer'&&!businessType||operationRole==='supplier'&&!entityType)return;
    const initial=state.initial;
    const button=document.getElementById('nayadCreateRegistrationButton');
    const completing=Boolean(state.completionId);
    creating=true;if(button){button.disabled=true;button.textContent=completing?'Гүйцээж байна...':'Үүсгэж байна...';}
    try{
      let created=state.createdId?{id:state.createdId}:null;
      if(!created){
        const rpcName=completing?'complete_my_registration':'create_my_registration';
        const args={p_name:name,p_operation_role:operationRole,p_business_type:businessType,p_entity_type:entityType};
        if(completing)args.p_store_id=state.completionId;
        const {data,error}=await client.rpc(rpcName,args);
        if(error)throw error;
        created=Array.isArray(data)?data[0]:data;
        if(!created?.id)throw new Error('Бүртгэл үүссэнгүй.');
        state.createdId=created.id;
      }
      if(typeof window.__nayadRefreshStores==='function')await window.__nayadRefreshStores({selectStoreId:created.id,sync:true,close:true});
      close();
      if(initial&&typeof window.showAuthenticatedApp==='function')await window.showAuthenticatedApp();
      else if(typeof window.render==='function')window.render();
      window.toast?.(completing?'Бүртгэл амжилттай гүйцлээ.':'Бүртгэл амжилттай үүслээ.');
    }catch(error){
      console.error('Registration create:',error);
      const message=String(error?.message||'');
      if(/already exists/i.test(message))window.toast?.('Ийм нэртэй бүртгэл аль хэдийн байна.');
      else if(/limit/i.test(message))window.toast?.('Бүртгэлийн тооны хязгаарт хүрсэн байна.');
      else window.toast?.(completing?'Бүртгэл гүйцээхэд алдаа гарлаа.':'Бүртгэл үүсгэхэд алдаа гарлаа.');
      if(button){button.disabled=false;button.textContent=completing?'Бүртгэл гүйцээх':'Бүртгэл үүсгэх';}
    }finally{creating=false;}
  }

  window.showNayadRegistrationOnboarding=show;
  window.closeNayadRegistrationOnboarding=close;
  window.nayadRegistrationBack=back;
  window.nayadRegistrationChooseRole=chooseRole;
  window.nayadRegistrationChooseEntity=chooseEntity;
  window.nayadRegistrationChooseBusinessType=chooseBusinessType;
  window.nayadRegistrationSetName=setName;
  window.nayadRegistrationSetCustomBusinessType=setCustomBusinessType;
  window.nayadRegistrationContinue=next;
  window.nayadRegistrationCreate=create;
  window.__nayadIsRegistrationComplete=isRegistrationComplete;
  window.__nayadBuyerBusinessTypes=BUYER_TYPES.slice();
})();
