/* NAYAD profile and store menu — a right-side drawer for account actions. */
(function(){
  const STYLE=`<style id="nayad-profile-menu-styles">
  body.profileMenuOpen{overflow:hidden}
  .profileMenuRoot{position:fixed;inset:0;z-index:70;pointer-events:none;visibility:hidden}
  .profileMenuRoot.open{pointer-events:auto;visibility:visible}
  .profileMenuBackdrop{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;border-radius:0;background:rgba(17,17,17,.36);opacity:0;transition:opacity .2s ease}
  .profileMenuRoot.open .profileMenuBackdrop{opacity:1}
  .profileMenuDrawer{position:absolute;top:0;right:max(0px,calc((100vw - 430px)/2));width:min(88vw,360px);height:100%;height:100dvh;background:#fff;box-shadow:-18px 0 45px rgba(0,0,0,.16);transform:translateX(104%);transition:transform .22s ease;overflow:auto;overscroll-behavior:contain}
  .profileMenuRoot.open .profileMenuDrawer{transform:translateX(0)}
  .profileMenuLayout{min-height:100%;display:flex;flex-direction:column;padding:calc(16px + env(safe-area-inset-top)) 17px calc(17px + env(safe-area-inset-bottom))}
  .profileMenuHeader{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.profileMenuHeader b{font-size:19px;font-weight:900;letter-spacing:-.35px}
  .profileMenuClose{width:40px;height:40px;flex:0 0 40px;padding:0;border-radius:50%;background:var(--surface-2);display:grid;place-items:center}.profileMenuClose svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
  .profileMenuUser{display:flex;align-items:center;gap:12px;padding:13px;background:#F7F7F4;border:1px solid var(--line);border-radius:17px}
  .profileMenuAvatar{width:48px;height:48px;flex:0 0 48px;border-radius:50%;object-fit:cover;border:1px solid var(--line);background:#EDEDE8;display:grid;place-items:center;font-size:17px;font-weight:900;color:#555}
  .profileMenuUserMeta{min-width:0;flex:1}.profileMenuUserMeta b{display:block;font-size:15px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.profileMenuUserMeta span{display:block;color:var(--muted);font-size:10px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .profileMenuSectionTitle{margin:19px 3px 8px;color:#8A8B86;font-size:10px;font-weight:900;letter-spacing:.45px}
  .profileMenuStore{display:flex;align-items:center;gap:11px;padding:12px;background:#FFF9E8;border:1px solid #F0D16B;border-radius:16px}
  .profileMenuStoreIcon{width:40px;height:40px;flex:0 0 40px;border-radius:12px;background:var(--yellow-soft);display:grid;place-items:center}.profileMenuStoreIcon svg{width:21px;height:21px;fill:none;stroke:#6F5400;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .profileMenuStoreMeta{min-width:0}.profileMenuStoreMeta small{display:block;color:#9A7410;font-size:9px;font-weight:850;margin-bottom:4px}.profileMenuStoreMeta b{display:block;font-size:13px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.profileMenuStoreMeta span{display:block;color:var(--muted);font-size:9px;margin-top:3px}
  .profileMenuActions{overflow:hidden;border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:var(--shadow-sm)}
  .profileMenuAction{width:100%;min-height:53px;padding:11px 12px;border-radius:0;background:#fff;color:var(--text);display:flex;align-items:center;gap:11px;text-align:left;border-bottom:1px solid var(--line)}.profileMenuAction:last-child{border-bottom:0}.profileMenuAction:hover{background:#FAFAF7}
  .profileMenuActionIcon{width:35px;height:35px;flex:0 0 35px;border-radius:11px;background:#F3F3EF;display:grid;place-items:center}.profileMenuActionIcon svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
  .profileMenuActionText{min-width:0;flex:1}.profileMenuActionText b{display:block;font-size:12px;font-weight:850}.profileMenuActionText span{display:block;color:var(--muted);font-size:9px;margin-top:3px;line-height:1.3}.profileMenuChevron{width:17px;height:17px;fill:none;stroke:#A0A19C;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .profileMenuTheme{width:100%;min-height:57px;padding:11px 12px;background:#fff;color:var(--text);display:flex;align-items:center;gap:11px;text-align:left}.profileMenuTheme:hover{background:#FAFAF7}.profileMenuTheme[aria-pressed="true"]{background:#FFF9E8}.profileMenuThemeSwitch{width:42px;height:25px;flex:0 0 42px;padding:3px;border-radius:999px;background:#C8C8C1;display:flex;align-items:center;justify-content:flex-start;transition:background .18s ease}.profileMenuThemeSwitch span{display:block;width:19px;height:19px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .18s ease}.profileMenuTheme[aria-pressed="true"] .profileMenuThemeSwitch{background:var(--yellow)}.profileMenuTheme[aria-pressed="true"] .profileMenuThemeSwitch span{transform:translateX(17px)}
  .profileMenuUpgrade{width:100%;min-height:73px;padding:11px 12px;border:1px solid #E0AD00;border-radius:17px;background:linear-gradient(135deg,#E9B400,#FFC400 64%,#FFD34E);color:#191500;display:flex;align-items:center;gap:11px;text-align:left;border-bottom:0;box-shadow:0 8px 17px rgba(175,124,0,.19)}.profileMenuUpgrade:hover{filter:brightness(1.02)}.profileMenuUpgradeIcon{width:42px;height:42px;flex:0 0 42px;border-radius:13px;background:rgba(57,43,0,.22);display:grid;place-items:center}.profileMenuUpgradeIcon svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.profileMenuUpgradeText{min-width:0;flex:1}.profileMenuUpgradeText b{display:block;font-size:13px;font-weight:900}.profileMenuUpgradeText span{display:block;font-size:9px;font-weight:750;opacity:.78;margin-top:3px}.profileMenuUpgradeChevron{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
  .profileMenuSpacer{flex:1;min-height:22px}
  .profileMenuLogout{width:100%;min-height:49px;display:flex;align-items:center;justify-content:center;gap:8px;background:#FFF0F0;color:#B83232;border:1px solid #F4CCCC}.profileMenuLogout svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
  html.nightMode .profileMenuDrawer{background:#171716;box-shadow:-18px 0 45px rgba(0,0,0,.48)}html.nightMode .profileMenuUser{background:#222220;border-color:var(--line)}html.nightMode .profileMenuAvatar{background:#343431;border-color:#51514C;color:#EEE}html.nightMode .profileMenuSectionTitle{color:#AAA9A2}html.nightMode .profileMenuStore{background:#30280F;border-color:#6D5815}html.nightMode .profileMenuStoreMeta small{color:#E0BD49}html.nightMode .profileMenuActions{background:#1D1D1B;border-color:var(--line);box-shadow:none}html.nightMode .profileMenuAction,html.nightMode .profileMenuTheme{background:#1D1D1B;color:var(--text);border-bottom-color:var(--line)}html.nightMode .profileMenuAction:hover,html.nightMode .profileMenuTheme:hover{background:#262624}html.nightMode .profileMenuTheme[aria-pressed="true"]{background:#30280F}html.nightMode .profileMenuActionIcon{background:#2A2A27}html.nightMode .profileMenuChevron{stroke:#AAA9A2}html.nightMode .profileMenuLogout{background:#351B1D;color:#FFD8D8;border-color:#6B363A}html.nightMode .profileMenuClose{color:var(--text)}html.nightMode .profileMenuUpgrade{background:linear-gradient(135deg,#A87900,#D8A400 64%,#E4B31A);border-color:#E4B31A;box-shadow:0 8px 20px rgba(0,0,0,.3)}
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
    logout:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8V5.5A2.5 2.5 0 0 0 11.5 3h-6A2.5 2.5 0 0 0 3 5.5v13A2.5 2.5 0 0 0 5.5 21h6a2.5 2.5 0 0 0 2.5-2.5V16"/><path d="M10 12h11M17 8l4 4-4 4"/></svg>'
  };
  let lastFocus=null;

  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function initial(s){return String(s||'N').trim().slice(0,1).toUpperCase();}
  function profile(){return typeof window.getCurrentUserProfile==='function'?window.getCurrentUserProfile():{name:'Профайл',avatar:''};}
  function activeStore(){return window.__nayadActiveStore||null;}
  function roleLabel(role){return role==='owner'?'Эзэмшигч':role==='member'?'Гишүүн':'';}

  function action(icon,title,detail,name){
    return `<button class="profileMenuAction" type="button" onclick="profileMenuAction('${name}')"><span class="profileMenuActionIcon">${icon}</span><span class="profileMenuActionText"><b>${title}</b><span>${detail}</span></span><svg class="profileMenuChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
  }

  function isNightMode(){return document.documentElement?.classList?.contains('nightMode')||false;}

  function themeControl(){
    const night=isNightMode();
    return `<button class="profileMenuTheme" type="button" onclick="profileMenuAction('theme')" aria-pressed="${night}"><span class="profileMenuActionIcon">${ICONS.moon}</span><span class="profileMenuActionText"><b>Night mode</b><span>${night?'Идэвхтэй':'Унтраалттай'}</span></span><span class="profileMenuThemeSwitch" aria-hidden="true"><span></span></span></button>`;
  }

  function upgradeControl(){
    return `<button class="profileMenuUpgrade" type="button" onclick="profileMenuAction('subscription')"><span class="profileMenuUpgradeIcon">${ICONS.crown}</span><span class="profileMenuUpgradeText"><b>Plus багц руу ахиулах</b><span>Илүү олон боломж нээх</span></span><svg class="profileMenuUpgradeChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
  }

  function menuHtml(){
    const p=profile();
    const user=window.__nayadUser||{};
    const phone=String(user.user_metadata?.login_phone||'').replace(/^\+976/,'');
    const email=user.email||'';
    const contact=phone?`Утас: ${esc(phone)}`:(email?esc(email):esc(p.provider||'Нэвтрэлт'));
    const store=activeStore();
    const storeName=esc(store?.name||'Дэлгүүр');
    const storeRole=roleLabel(store?.role);
    const avatar=p.avatar?`<img class="profileMenuAvatar" src="${esc(p.avatar)}" alt="">`:`<div class="profileMenuAvatar">${esc(initial(p.name))}</div>`;
    return `<div class="profileMenuLayout"><div class="profileMenuHeader"><b id="profileMenuTitle">Цэс</b><button class="profileMenuClose" type="button" onclick="closeProfileMenu()" aria-label="Цэс хаах"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="profileMenuUser">${avatar}<div class="profileMenuUserMeta"><b>${esc(p.name||'Нэр тодорхойгүй')}</b><span>${contact}</span></div></div><div class="profileMenuSectionTitle">ДЭЛГҮҮР</div><div class="profileMenuStore"><span class="profileMenuStoreIcon">${ICONS.store}</span><div class="profileMenuStoreMeta"><small>ИДЭВХТЭЙ ДЭЛГҮҮР</small><b data-profile-store-name>${storeName}</b>${storeRole?`<span>${storeRole}</span>`:''}</div></div><div class="profileMenuActions" style="margin-top:9px">${action(ICONS.switch,'Дэлгүүр солих','Өөрийн болон хуваалцсан дэлгүүрүүд','store')}${action(ICONS.share,'Дэлгүүр хуваалцах','Гишүүн урих, хамтран ажиллах','share')}</div><div class="profileMenuSectionTitle">ХАРАГДАЦ</div><div class="profileMenuActions">${themeControl()}</div><div style="margin-top:12px">${upgradeControl()}</div><div class="profileMenuSectionTitle">САНХҮҮ</div><div class="profileMenuActions">${action(ICONS.report,'Тайлан','Өглөг болон хугацааны тайлан','reports')}</div><div class="profileMenuSectionTitle">ПРОФАЙЛ</div><div class="profileMenuActions">${action(ICONS.settings,'Профайлын тохиргоо','Утасны дугаар болон бүртгэл','settings')}</div><div class="profileMenuSpacer"></div><button class="profileMenuLogout" type="button" onclick="profileMenuAction('logout')">${ICONS.logout}<span>Гарах</span></button></div>`;
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
