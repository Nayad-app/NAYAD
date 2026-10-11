const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function setup(){
  const elements={};
  for(const id of ['app','login','modal']){
    const classes=new Set(id==='app'?['hide']:[]);
    elements[id]={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}};
  }
  const state={prepares:0,renders:0,resets:0};
  const context=vm.createContext({window:{__nayadUser:{id:'a'}},document:{getElementById:id=>elements[id]},console,
    waitForStorePreparation:async()=>async()=>{state.prepares++;return true},
    switchUserData:()=>state.resets++,render:()=>state.renders++,updateProfileUI:()=>{},authMessage:()=>{}});
  vm.runInContext(source.slice(source.indexOf('let appOpenPromise='),source.indexOf('\nasync function showLoginScreen')),context);
  return {context,state,elements};
}
test('same-user session refresh keeps the open form, current page and data',async()=>{
  const {context,state,elements}=setup();
  await context.showAuthenticatedApp();
  assert.equal(state.resets,1);
  const draft={supplier:'supplier-1',amount:'509700',date:'2026-10-11',image:'selected.jpg'};
  elements.modal.draft=draft;
  for(let i=0;i<4;i++)await context.showAuthenticatedApp();
  assert.deepEqual(state,{prepares:1,renders:1,resets:1});
  assert.equal(elements.modal.draft,draft);
  assert.equal(elements.modal.classList.contains('hide'),false);
});
test('another user and a locked app still require app preparation',async()=>{
  const {context,state,elements}=setup();
  await context.showAuthenticatedApp();
  context.window.__nayadUser={id:'b'};
  await context.showAuthenticatedApp();
  assert.equal(state.prepares,2);
  elements.app.classList.add('hide');
  await context.showAuthenticatedApp();
  assert.equal(state.prepares,3);
});
test('service worker waits for both editing and saving before reloading',()=>{
  const timers=[];let reloads=0;
  const context=vm.createContext({swRefreshing:false,window:{__nayadCriticalOperation:false},document:{getElementById:()=>({classList:{contains:()=>context.closed}})},setTimeout:fn=>timers.push(fn),location:{reload:()=>reloads++},closed:false});
  const start=source.indexOf('const reloadWhenSafe=');
  const end=source.indexOf('});await registration.update()',start);
  vm.runInContext(source.slice(start,end),context);
  assert.equal(reloads,0);
  context.closed=true;context.window.__nayadCriticalOperation=true;
  timers.shift()();assert.equal(reloads,0);
  context.window.__nayadCriticalOperation=false;
  timers.shift()();assert.equal(reloads,1);
});
