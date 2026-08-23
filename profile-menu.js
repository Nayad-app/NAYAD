/* NAYAD profile and store menu — a right-side drawer for account actions. */
(function(){
  const STYLE=`<style id="nayad-profile-menu-styles">
  body.profileMenuOpen{overflow:hidden}
  .profileMenuRoot{position:fixed;inset:0;z-index:70;pointer-events:none;visibility:hidden}
  .profileMenuRoot.open{pointer-events:auto;visibility:visible}
  .profileMenuBackdrop{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;border-radius:0;background:rgba(17,17,17,.36);opacity:0;transition:opacity .2s ease}
  .profileMenuRoot.open .profileMenuBackdrop{opacity:1}
  .profileMenuDrawer{position:absolute;top:0;right:max(0px,calc((100vw - 430px)/2));width:min(92vw,380px);height:100%;height:100dvh;background:#fff;box-shadow:-20px 0 48px rgba(0,0,0,.16);transform:translateX(104%);transition:transform .22s ease;overflow:auto;overscroll-behavior:contain}
  .profileMenuRoot.open .profileMenuDrawer{transform:translateX(0)}
  .profileMenuLayout{min-height:100%;display:flex;flex-direction:column;padding:calc(18px + env(safe-area-inset-top)) 21px calc(18px + env(safe-area-inset-bottom))}
  .profileMenuHeader{display:flex;align-items:center;justify-content:space-between;margin-bottom:21px}.profileMenuHeader b{font-size:21px;font-weight:900;letter-spacing:-.5px}.profileMenuBrand{font-size:20px;font-weight:950;letter-spacing:-1.1px;margin-right:auto}.profileMenuBrand .y{color:var(--yellow)}
  .profileMenuClose{width:42px;height:42px;flex:0 0 42px;padding:0;border-radius:13px;background:var(--surface-2);display:grid;place-items:center}.profileMenuClose svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
  .profileMenuUser{width:100%;display:flex;align-items:center;gap:14px;padding:16px;background:#FBFBF9;border:1px solid var(--line);border-radius:18px;color:var(--text);text-align:left;position:relative}.profileMenuUser:after{content:'›';margin-left:auto;color:#92938E;font-size:29px;font-weight:300;line-height:1}
  .profileMenuAvatar{width:48px;height:48px;flex:0 0 48px;border-radius:50%;object-fit:cover;border:1px solid var(--line);background:#EDEDE8;display:grid;place-items:center;font-size:17px;font-weight:900;color:#555}
  .profileMenuUserMeta{min-width:0;flex:1}.profileMenuUserMeta b{display:block;font-size:15px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.profileMenuUserMeta span{display:block;color:var(--muted);font-size:10px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .profileMenuSectionTitle{display:none}
  .profileMenuStore{display:none}
  .profileMenuActions{overflow:visible;border:0;border-radius:0;background:transparent;box-shadow:none}
  .profileMenuAction{width:100%;min-height:70px;padding:12px 0;border-radius:0;background:transparent;color:var(--text);display:flex;align-items:center;gap:15px;text-align:left;border-bottom:1px solid var(--line)}.profileMenuAction:hover{background:transparent}
  .profileMenuActionIcon{width:35px;height:35px;flex:0 0 35px;border-radius:0;background:transparent;display:grid;place-items:center}.profileMenuActionIcon svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
  .profileMenuActionText{min-width:0;flex:1}.profileMenuActionText b{display:block;font-size:15px;font-weight:750}.profileMenuActionText span:empty{display:none}.profileMenuActionText span{display:block;color:var(--muted);font-size:10px;margin-top:3px;line-height:1.3}.profileMenuChevron{width:18px;height:18px;fill:none;stroke:#999A95;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .profileMenuTheme{width:100%;min-height:70px;padding:12px 0;background:transparent;color:var(--text);display:flex;align-items:center;gap:15px;text-align:left;border-bottom:1px solid var(--line)}.profileMenuTheme:hover{background:transparent}.profileMenuTheme[aria-pressed="true"]{background:transparent}.profileMenuThemeSwitch{width:42px;height:25px;flex:0 0 42px;padding:3px;border-radius:999px;background:#C8C8C1;display:flex;align-items:center;justify-content:flex-start;transition:background .18s ease}.profileMenuThemeSwitch span{display:block;width:19px;height:19px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .18s ease}.profileMenuTheme[aria-pressed="true"] .profileMenuThemeSwitch{background:var(--yellow)}.profileMenuTheme[aria-pressed="true"] .profileMenuThemeSwitch span{transform:translateX(17px)}
  .profileMenuUpgrade{width:100%;min-height:73px;margin:15px 0 2px;padding:11px 13px;border:1px solid #E0AD00;border-radius:17px;background:linear-gradient(135deg,#E9B400,#FFC400 64%,#FFD34E);color:#191500;display:flex;align-items:center;gap:13px;text-align:left;box-shadow:0 8px 17px rgba(175,124,0,.19)}.profileMenuUpgrade:hover{filter:brightness(1.02)}.profileMenuUpgradeIcon{width:42px;height:42px;flex:0 0 42px;border-radius:50%;background:rgba(57,43,0,.12);display:grid;place-items:center}.profileMenuUpgradeIcon svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.profileMenuUpgradeText{min-width:0;flex:1}.profileMenuUpgradeText b{display:block;font-size:14px;font-weight:900}.profileMenuUpgradeText span{display:block;font-size:10px;font-weight:750;opacity:.78;margin-top:3px}.profileMenuUpgradeChevron{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
  .profileMenuSupport{width:100%;min-height:70px;padding:12px 0;display:flex;align-items:center;gap:15px;color:var(--text);text-decoration:none;border-bottom:1px solid var(--line)}.profileMenuSupport:hover{background:transparent}.profileMenuSupportIcon{width:35px;height:35px;flex:0 0 35px;display:grid;place-items:center}.profileMenuSupportIcon svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.profileMenuSupportText{min-width:0;flex:1}.profileMenuSupportText b{display:block;font-size:15px;font-weight:750}.profileMenuSupportText span{display:block;color:var(--muted);font-size:12px;margin-top:3px}.profileMenuSupport .profileMenuChevron{margin-left:auto}
  .profileMenuSpacer{flex:1;min-height:22px}
  .profileMenuLogout{width:100%;min-height:49px;display:flex;align-items:center;justify-content:center;gap:8px;background:#FFF0F0;color:#B83232;border:1px solid #F4CCCC}.profileMenuLogout svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
  html.nightMode .profileMenuDrawer{background:#111312;box-shadow:-20px 0 48px rgba(0,0,0,.55)}html.nightMode .profileMenuUser{background:#1B1D1C;border-color:#343735}html.nightMode .profileMenuAvatar{background:#2A2D2B;border-color:#454946;color:#EEE}html.nightMode .profileMenuAction,html.nightMode .profileMenuTheme,html.nightMode .profileMenuSupport{background:transparent;color:#F4F4EF;border-bottom-color:#2D302E}html.nightMode .profileMenuAction:hover,html.nightMode .profileMenuTheme:hover,html.nightMode .profileMenuSupport:hover{background:transparent}html.nightMode .profileMenuChevron{stroke:#C6C8C3}html.nightMode .profileMenuLogout{background:transparent;color:#FF6B6B;border-color:#B23A3A}html.nightMode .profileMenuClose{color:#F4F4EF;background:#1D201E;border:1px solid #343735}html.nightMode .profileMenuUpgrade{background:linear-gradient(135deg,#A87900,#D8A400 64%,#E4B31A);border-color:#E4B31A;box-shadow:0 8px 20px rgba(0,0,0,.3)}
  @media(max-width:370px){.profileMenuDrawer{width:91vw}.profileMenuLayout{padding-left:14px;padding-right:14px}.profileMenuAction{min-height:50px}}
  @media(prefers-reduced-motion:reduce){.profileMenuBackdrop,.profileMenuDrawer{transition:none}}
  </style>`;

  const ICONS={
    store:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10h18l-1.5-6h-15Z"/><path d="M8 10v2a2 2 0 0 0 4 0v-2M12 10v2a2 2 0 0 0 4 0v-2M9 20v-5h6v5"/></svg>',
    switch:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h12l-3-3M17 17H5l3 3"/><path d="m19 7-3 3M5 17l3-3"/></svg>',
    share:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19M18 8v6M15 11h6"/></svg>',
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20v-1.5A5.5 5.5 0 0 1 11 13h2a5.5 5.5 0 0 1 5.5 5.5V20"/></svg>',
    report:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3.2a8.8 8.8 0 1 0 9.8 9.8H11Z"/><path d="M14 3.2a7 7 0 0 1 6.8 6.8H14Z"/></svg>',
    moon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.3A8 8 0 0 1 8.7 4 8 8 0 1 0 20 15.3Z"/></svg>',
    crown:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 4 4 4-7 4 7 4-4-2 10H6Z"/><path d="M6 21h12"/></svg>',
    support:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h3l1.2 3-1.8 1.5a13 13 0 0 0 8.1 8.1l1.5-1.8L20 16v3c0 1 1 1.8-2.8 1.6C10.1 19.5 4.5 13.9 3.4 6.8 3.2 5.2 4 4 5 4Z"/></svg>',
    logout:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8V5.5A2.5 2.5 0 0 0 11.5 3h-6A2.5 2.5 0 0 0 3 5.5v13A2.5 2.5 0 0 0 5.5 21h6a2.5 2.5 0 0 0 2.5-2.5V16"/><path d="M10 12h11M17 8l4 4-4 4"/></svg>'
  };
  let lastFocus=null;

  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function initial(s){return String(s||'N').trim().slice(0,1).toUpperCase();}
  function profile(){return typeof window.getCurrentUserProfile==='function'?window.getCurrentUserProfile():{name:'Профайл',avatar:''};}
  function activeStore(){return window.__nayadActiveStore||null;}
  function roleLabel(role){return role==='owner'?'Эзэмшигч':role==='member'?'Гишүүн':'';}

  function action(icon,title,detail,name){
    return `<button class="profileMenuAction" type="button" onclick="profileMenuAction('${name}')"><span class="profileMenuActionIcon">${icon}</span><span class="profileMenuActionText"><b>${title}</b>${detail?`<span>${detail}</span>`:''}</span><svg class="profileMenuChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
  }

  function isNightMode(){return document.documentElement?.classList?.contains('nightMode')||false;}

  function themeControl(){
    const night=isNightMode();
    return `<button class="profileMenuTheme" type="button" onclick="profileMenuAction('theme')" aria-pressed="${night}"><span class="profileMenuActionIcon">${ICONS.moon}</span><span class="profileMenuActionText"><b>Night mode</b></span><span class="profileMenuThemeSwitch" aria-hidden="true"><span></span></span></button>`;
  }

  function upgradeControl(){
    return `<button class="profileMenuUpgrade" type="button" onclick="profileMenuAction('subscription')"><span class="profileMenuUpgradeIcon">${ICONS.crown}</span><span class="profileMenuUpgradeText"><b>Plus багц руу ахиулах</b><span>Илүү олон боломж нээх</span></span><svg class="profileMenuUpgradeChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
  }

  function supportControl(){
    return `<a class="profileMenuSupport" href="tel:72231380" aria-label="NAYAD холбоо барих 7223 1380"><span class="profileMenuSupportIcon">${ICONS.support}</span><span class="profileMenuSupportText"><b>Холбоо барих</b><span>7223 1380</span></span><svg class="profileMenuChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></a>`;
  }

  function menuHtml(){
    const p=profile();
    const user=window.__nayadUser||{};
    const phone=String(user.user_metadata?.login_phone||'').replace(/^\+976/,'');
    const email=user.email||'';
    const contact=phone?`Утас: ${esc(phone)}`:(email?esc(email):esc(p.provider||'Нэвтрэлт'));
    const avatar=p.avatar?`<img class="profileMenuAvatar" src="${esc(p.avatar)}" alt="">`:`<div class="profileMenuAvatar">${esc(initial(p.name))}</div>`;
    return `<div class="profileMenuLayout"><div class="profileMenuHeader"><span class="profileMenuBrand">N<span class="y">Y</span>AD</span><b id="profileMenuTitle">Цэс</b><button class="profileMenuClose" type="button" onclick="closeProfileMenu()" aria-label="Цэс хаах"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><button class="profileMenuUser" type="button" onclick="profileMenuAction('settings')" aria-label="Профайлын тохиргоо">${avatar}<div class="profileMenuUserMeta"><b>${esc(p.name||'Нэр тодорхойгүй')}</b><span>${contact}</span></div></button><div class="profileMenuActions">${action(ICONS.switch,'Дэлгүүр солих','','store')}${action(ICONS.share,'Дэлгүүр хуваалцах','','share')}</div><div class="profileMenuActions">${themeControl()}</div>${upgradeControl()}<div class="profileMenuActions">${action(ICONS.report,'Тайлан','','reports')}</div><div class="profileMenuActions">${supportControl()}</div><div class="profileMenuSpacer"></div><button class="profileMenuLogout" type="button" onclick="profileMenuAction('logout')">${ICONS.logout}<span>Гарах</span></button></div>`;
  }

  function ensureRoot(){
    let root=document.getElementById('profileMenuRoot');
    if(root)return root;
    if(!document.getElementById('nayad-profile-menu-styles'))document.head.insertAdjacentHTML('beforeend',STYLE);
    root=document.createElement('div');
    root.id='profileMenuRoot';
    root.className='profileMenuRoot';
    root.setAttribute('aria-hidden','true');
    root.innerHTML='<button class="profileMenuBackdrop" type="button" onclick="closeProfileMenu()" aria-label="Цэс хаах"></button><aside id="profileMenuDrawer" class="profileMenuDrawer" role="dialog" aria-modal="true" aria-labelledby="profileMenuTitle"></aside>';
    document.body.appendChild(root);
    return root;
  }

  function renderMenu(){
    const root=ensureRoot();
    const drawer=root.querySelector('.profileMenuDrawer');
    if(drawer)drawer.innerHTML=menuHtml();
    return root;
  }

  function showMenu(){
    const app=document.getElementById('app');
    if(!window.__nayadUser||app?.classList.contains('hide'))return;
    lastFocus=document.activeElement;
    const root=renderMenu();
    root.classList.add('open');
    root.setAttribute('aria-hidden','false');
    document.body.classList.add('profileMenuOpen');
    document.getElementById('profileMenuButton')?.setAttribute('aria-expanded','true');
    setTimeout(()=>root.querySelector('.profileMenuClose')?.focus(),40);
  }

  function closeMenu(options={}){
    const root=document.getElementById('profileMenuRoot');
    if(!root)return;
    root.classList.remove('open');
    root.setAttribute('aria-hidden','true');
    document.body.classList.remove('profileMenuOpen');
    document.getElementById('profileMenuButton')?.setAttribute('aria-expanded','false');
    if(options.restoreFocus!==false&&lastFocus?.focus)setTimeout(()=>lastFocus.focus(),220);
  }

  function runAction(name){
    if(name==='theme'){
      const setTheme=window.__nayadSetTheme;
      if(typeof setTheme==='function')setTheme(isNightMode()?'light':'night');
      else if(typeof window.toast==='function')window.toast('Night mode түр боломжгүй байна.');
      renderMenu();
      return;
    }
    const actions={
      store:window.showNayadStorePicker,
      share:window.showStoreShare,
      subscription:window.showNayadSubscription,
      reports:function(){if(typeof page!=='undefined')page='reports';window.render?.();},
      settings:window.showProfileDetails,
      logout:window.confirmLogout
    };
    const next=actions[name];
    closeMenu({restoreFocus:false});
    if(typeof next==='function')setTimeout(()=>next(),230);
    else if(typeof window.toast==='function')window.toast('Үйлдэл түр боломжгүй байна.');
  }

  function refreshMenu(){
    const root=document.getElementById('profileMenuRoot');
    if(root?.classList.contains('open'))renderMenu();
    if(!window.__nayadUser)closeMenu({restoreFocus:false});
  }

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.getElementById('profileMenuRoot')?.classList.contains('open'))closeMenu();
  });

  window.showProfileMenu=showMenu;
  window.closeProfileMenu=closeMenu;
  window.profileMenuAction=runAction;
  window.__nayadRefreshProfileMenu=refreshMenu;
})();
