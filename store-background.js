/* Personal background preferences, isolated by account and store on this device. */
(()=>{
  const colors=[
    {id:'default',name:'Үндсэн',light:'#F6F6F3',dark:'#1A1B1A'},
    {id:'blue',name:'Цайвар хөх',light:'#EEF4FA',dark:'#19232D'},
    {id:'green',name:'Цайвар ногоон',light:'#EEF6F0',dark:'#1B2820'},
    {id:'cream',name:'Цайвар шар',light:'#FFF8E8',dark:'#2A261C'},
    {id:'purple',name:'Цайвар ягаан',light:'#F3EFF8',dark:'#25202E'},
    {id:'pink',name:'Цайвар ягаавтар',light:'#FBF0F2',dark:'#2D2025'}
  ];
  const app=document.getElementById('app');
  const menu=document.getElementById('profileMenuButton');
  if(!app||!menu)return;
  const style=document.createElement('style');
  style.textContent=`
    #app.storeBackgroundActive,#app.storeBackgroundActive>main{background:var(--store-canvas)}
    #app .storeBackgroundButton{width:44px;height:44px;padding:8px;display:grid;place-items:center;background:transparent;border:0;border-radius:50%;flex-shrink:0}
    .storeBackgroundButton>span{display:block;width:28px;height:28px;border-radius:50%;border:1px solid #aeb4ba;background:var(--store-color-chip,#F7F7F5)}
    .storeBackgroundButton:focus-visible,.storeBackgroundSwatch:focus-visible{outline:2px solid var(--text);outline-offset:3px}
    #modal:has(.storeBackgroundPicker){align-items:center;justify-content:center;padding:20px 16px}
    #modal:has(.storeBackgroundPicker) #sheet{width:min(400px,100%);max-height:calc(100dvh - 40px);border-radius:24px;padding:22px;box-sizing:border-box;background:var(--surface,#fff);color:var(--text)}
    .storeBackgroundHeading{display:flex;align-items:center;gap:10px}
    .storeBackgroundHeading h2{flex:1;margin:0;font-size:20px;text-align:center}
    .storeBackgroundClose{width:36px;height:36px;padding:0;background:transparent;color:var(--text);font-size:27px}
    .storeBackgroundName{text-align:center;color:var(--muted);font-size:12px;margin:6px 0 20px;overflow-wrap:anywhere}
    .storeBackgroundColors{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;justify-items:center;margin:12px 0 22px}
    .storeBackgroundSwatch{width:clamp(52px,17vw,78px);height:clamp(52px,17vw,78px);padding:0;border-radius:50%;border:1px solid #0002;color:#171717;font-size:28px;background:var(--swatch)}
    .storeBackgroundSwatch[aria-pressed=true]{outline:2px solid #FFC107;outline-offset:3px}
    .storeBackgroundHint{text-align:center;font-size:11px;color:var(--muted);margin:0 0 16px}
    .storeBackgroundError{color:var(--red);font-size:12px;margin:8px 0}
  `;
  document.head.append(style);
  const button=document.createElement('button');
  button.type='button';button.className='storeBackgroundButton';button.id='storeBackgroundButton';
  button.setAttribute('aria-label','Дэвсгэрийн өнгө солих');button.setAttribute('aria-haspopup','dialog');
  button.innerHTML='<span aria-hidden="true"></span>';
  menu.before(button);
  const context=()=>{
    const uid=window.__nayadUser?.id,store=window.__nayadActiveStore;
    if(!uid||!store?.id||String(window.__nayadStoresUserId||'')!==String(uid))return null;
    return {key:`NAYAD_STORE_BACKGROUND:${uid}:${store.id}`,name:String(store.name||'Дэлгүүр')};
  };
  const read=ctx=>{try{return colors.find(c=>c.id===localStorage.getItem(ctx.key))||colors[0]}catch(_){return colors[0]}};
  function refresh(){
    const ctx=context(),color=ctx?read(ctx):colors[0];
    const night=document.documentElement.classList.contains('nightMode');
    app.style.setProperty('--store-canvas',night?color.dark:color.light);
    const active=!!ctx&&color.id!=='default';
    if(app.classList.contains('storeBackgroundActive')!==active)app.classList.toggle('storeBackgroundActive',active);
    button.style.setProperty('--store-color-chip',night?color.dark:color.light);
    button.disabled=!ctx;
    button.title=`Дэвсгэрийн өнгө: ${color.name}`;
  }
  function open(){
    const ctx=context();if(!ctx||typeof window.sheet!=='function')return;
    let selected=read(ctx).id;
    window.sheet(`<div class="storeBackgroundPicker"><div class="storeBackgroundHeading"><h2>Дэвсгэрийн өнгө</h2><button type="button" class="storeBackgroundClose" aria-label="Хаах">×</button></div><div class="storeBackgroundName"></div><div class="storeBackgroundColors" role="group" aria-label="Дэвсгэрийн өнгөнүүд">${colors.map(c=>`<button type="button" class="storeBackgroundSwatch" data-color="${c.id}" style="--swatch:${c.light}" aria-label="${c.name}" aria-pressed="${c.id===selected}">${c.id===selected?'✓':''}</button>`).join('')}</div><p class="storeBackgroundHint">Зөвхөн энэ дэлгүүрт хадгалагдана.</p><div class="storeBackgroundError" role="alert"></div><button type="button" class="primary full storeBackgroundSave">Хадгалах</button></div>`);
    const picker=document.querySelector('.storeBackgroundPicker');
    picker.querySelector('.storeBackgroundName').textContent=ctx.name;
    picker.querySelector('.storeBackgroundClose').onclick=()=>{window.closeSheet();button.focus()};
    picker.querySelectorAll('[data-color]').forEach(swatch=>swatch.onclick=()=>{
      selected=swatch.dataset.color;
      picker.querySelectorAll('[data-color]').forEach(el=>{const active=el.dataset.color===selected;el.setAttribute('aria-pressed',String(active));el.textContent=active?'✓':''});
    });
    picker.querySelector('.storeBackgroundSave').onclick=()=>{
      const error=picker.querySelector('.storeBackgroundError');
      if(context()?.key!==ctx.key){error.textContent='Дэлгүүр солигдсон байна. Цонхыг дахин нээнэ үү.';return;}
      try{localStorage.setItem(ctx.key,selected)}catch(_){error.textContent='Өнгийг хадгалж чадсангүй. Дахин оролдоно уу.';return;}
      refresh();window.closeSheet();button.focus();
    };
    picker.querySelector('[aria-pressed=true]').focus();
  }
  button.onclick=open;
  window.__nayadRefreshStoreBackground=refresh;
  new MutationObserver(refresh).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  new MutationObserver(refresh).observe(app,{attributes:true,attributeFilter:['class']});
  window.addEventListener('storage',event=>{if(event.key===null||event.key===context()?.key)refresh()});
  refresh();
})();
