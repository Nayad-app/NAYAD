const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function classList(initial=[]){
  const values=new Set(initial);
  return {
    add:value=>values.add(value),
    remove:value=>values.delete(value),
    toggle:(value,force)=>{
      const enabled=force===undefined?!values.has(value):Boolean(force);
      if(enabled)values.add(value);else values.delete(value);
      return enabled;
    },
    contains:value=>values.has(value)
  };
}

const listeners={};
const elements={};
const closeButton={focus(){closeButton.focused=true;},focused:false};
const drawer={innerHTML:''};
const root={
  id:'',className:'',classList:classList(),attributes:{},innerHTML:'',
  setAttribute(name,value){this.attributes[name]=String(value);},
  querySelector(selector){
    if(selector==='.profileMenuDrawer')return drawer;
    if(selector==='.profileMenuClose')return closeButton;
    return null;
  }
};
const menuButton={
  attributes:{},focused:false,
  setAttribute(name,value){this.attributes[name]=String(value);},
  focus(){this.focused=true;}
};
const app={classList:classList()};
const documentElement={classList:classList(),style:{}};
const body={
  classList:classList(),
  appendChild(element){elements[element.id]=element;}
};
let styles='';
let storePickerCalls=0;
let shareCalls=0;
let settingsCalls=0;
let logoutCalls=0;
const themeCalls=[];

const context={
  console,
  setTimeout:fn=>{fn();return 1;},
  clearTimeout(){},
  document:{
    activeElement:menuButton,
    documentElement,
    body,
    head:{insertAdjacentHTML:(_where,html)=>{styles=html;}},
    createElement:tag=>{assert.equal(tag,'div');return root;},
    getElementById:id=>id==='app'?app:id==='profileMenuButton'?menuButton:elements[id]||null,
    addEventListener:(type,handler)=>{listeners[type]=handler;}
  }
};
context.window=context;
context.window.__nayadUser={
  id:'user-1',email:'namka@example.com',
  user_metadata:{full_name:'Namka',login_phone:'+97699112233'}
};
context.window.__nayadActiveStore={id:'store-1',name:'Namka store',role:'owner'};
context.window.getCurrentUserProfile=()=>({name:'Namka',avatar:'',provider:'email'});
context.window.showNayadStorePicker=()=>{storePickerCalls++;};
context.window.showStoreShare=()=>{shareCalls++;};
context.window.showProfileDetails=()=>{settingsCalls++;};
context.window.confirmLogout=()=>{logoutCalls++;};
context.window.__nayadSetTheme=theme=>{
  documentElement.classList.toggle('nightMode',theme==='night');
  themeCalls.push(theme);
};

const projectRoot=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(projectRoot,'profile-menu.js'),'utf8');
vm.createContext(context);
vm.runInContext(source,context,{filename:'profile-menu.js'});

context.window.showProfileMenu();
assert.match(styles,/nayad-profile-menu-styles/,'drawer styles must be installed');
assert.equal(root.classList.contains('open'),true,'hamburger button must open the drawer');
assert.equal(root.attributes['aria-hidden'],'false');
assert.equal(menuButton.attributes['aria-expanded'],'true');
assert.equal(body.classList.contains('profileMenuOpen'),true);
assert.match(drawer.innerHTML,/Дэлгүүр солих/);
assert.match(drawer.innerHTML,/Дэлгүүр хуваалцах/);
assert.match(drawer.innerHTML,/Холбоо барих/);
assert.match(drawer.innerHTML,/7223 1380/);
assert.match(drawer.innerHTML,/profileMenuAction\('settings'\)/);
assert.doesNotMatch(drawer.innerHTML,/Профайлын тохиргоо.*profileMenuAction\('settings'\)/);
assert.match(drawer.innerHTML,/Night mode/);
assert.match(drawer.innerHTML,/Plus багц руу ахиулах/);
assert.match(drawer.innerHTML,/Тайлан/);
assert.doesNotMatch(drawer.innerHTML,/Унтраалттай/);
assert.ok(drawer.innerHTML.indexOf('Дэлгүүр солих')<drawer.innerHTML.indexOf('Дэлгүүр хуваалцах'));
assert.ok(drawer.innerHTML.indexOf('Дэлгүүр хуваалцах')<drawer.innerHTML.indexOf('Night mode'));
assert.ok(drawer.innerHTML.indexOf('Night mode')<drawer.innerHTML.indexOf('Plus багц руу ахиулах'));
assert.ok(drawer.innerHTML.indexOf('Plus багц руу ахиулах')<drawer.innerHTML.indexOf('Тайлан'));
assert.ok(drawer.innerHTML.indexOf('Тайлан')<drawer.innerHTML.indexOf('Холбоо барих'));
assert.ok(drawer.innerHTML.indexOf('Холбоо барих')<drawer.innerHTML.indexOf('Гарах'));
assert.ok(
  drawer.innerHTML.indexOf('profileMenuSpacer')<drawer.innerHTML.indexOf("profileMenuAction('logout')"),
  'logout must remain at the bottom of the drawer'
);

context.window.profileMenuAction('store');
assert.equal(storePickerCalls,1);
assert.equal(root.classList.contains('open'),false);
context.window.showProfileMenu();
context.window.profileMenuAction('share');
assert.equal(shareCalls,1);
context.window.showProfileMenu();
context.window.profileMenuAction('settings');
assert.equal(settingsCalls,1);
context.window.showProfileMenu();
context.window.profileMenuAction('theme');
assert.deepEqual(themeCalls,['night']);
assert.equal(root.classList.contains('open'),true,'theme toggle must keep the drawer open');
assert.match(drawer.innerHTML,/aria-pressed="true"/);
context.window.profileMenuAction('theme');
assert.deepEqual(themeCalls,['night','light']);
assert.match(drawer.innerHTML,/aria-pressed="false"/);
context.window.showProfileMenu();
context.window.profileMenuAction('logout');
assert.equal(logoutCalls,1);

context.window.showProfileMenu();
listeners.keydown({key:'Escape'});
assert.equal(root.classList.contains('open'),false,'Escape must close the drawer');
assert.equal(menuButton.attributes['aria-expanded'],'false');

const indexSource=fs.readFileSync(path.join(projectRoot,'index.html'),'utf8');
const storeSource=fs.readFileSync(path.join(projectRoot,'store-switcher.js'),'utf8');
const shareSource=fs.readFileSync(path.join(projectRoot,'share.js'),'utf8');
assert.match(indexSource,/id="profileMenuButton"[\s\S]*onclick="showProfileMenu\(\)"/,'header must use the hamburger menu');
assert.match(indexSource,/html\.nightMode \.headerMenuButton\{background:#2A2A27;color:#F3F3EE/,'Night mode hamburger icon must remain visible');
assert.match(indexSource,/class="homeActiveStore"/,'home must keep a compact active-store label');
assert.doesNotMatch(indexSource,/class="homeShareBtn"|class="logoutIconButton"/,'home/header must not keep the old standalone actions');
assert.doesNotMatch(storeSource,/storeSwitcherButton/,'large active-store switcher must be removed');
assert.doesNotMatch(shareSource,/function addShareButton/,'sharing must only be exposed through the profile drawer');
assert.match(indexSource,/\.\/profile-menu\.js\?v=4/,'profile drawer must include the minimal menu redesign');
assert.match(indexSource,/\.\/subscription\.js\?v=1/,'subscription flow must load after the app modules');

console.log('profile-menu: PASS — store/profile actions live in the right drawer with logout at the bottom');
