const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const guard=fs.readFileSync(path.join(__dirname,'../auth-guard.js'),'utf8');
function setup(){
  const elements={};for(const id of ['app','login','modal']){const classes=new Set(id==='app'?[]:['hide']);elements[id]={classList:{contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x)}};}
  const handlers={},docHandlers={},state={opened:0,login:0,loginCalls:0,session:{user:{id:'owner'}}};
  const context=vm.createContext({console,Promise,setTimeout:()=>0,localStorage:{removeItem(){}},sessionStorage:{removeItem(){}},document:{visibilityState:'visible',getElementById:id=>elements[id],addEventListener:(n,f)=>docHandlers[n]=f},faceIdEnabled:()=>true,
    profileFromUser:user=>context.__nayadUser=user,
    showAuthenticatedApp:async()=>{state.opened++;elements.app.classList.remove('hide');return true},
    showLoginScreen:async()=>{state.login++;elements.app.classList.add('hide');elements.login.classList.remove('hide')},
    phoneLogin:async()=>{state.loginCalls++},
    addEventListener:(n,f)=>(handlers[n]??=[]).push(f),nayadSupabase:{auth:{getSession:async()=>({data:{session:state.session}})}}});
  context.window=context;
  vm.runInContext('let faceIdUnlockRequired=false,faceIdUnlocking=false,faceIdBackgrounded=false;window.__nayadFaceIdLocked=()=>faceIdUnlockRequired;',context);
  vm.runInContext(html.slice(html.indexOf('function requestFaceIdLock()'),html.indexOf('window.addEventListener("load",async()=>')),context);
  vm.runInContext(guard,context);
  return {context,state,elements,handlers,docHandlers};
}
test('background locks immediately and saved session cannot reopen through any guard',async()=>{
  const {context,state,elements,docHandlers}=setup();
  context.document.visibilityState='hidden';docHandlers.visibilitychange();
  assert.equal(context.__nayadFaceIdLocked(),true);
  context.document.visibilityState='visible';docHandlers.visibilitychange();
  await context.showLoginScreen();await context.showAuthenticatedApp();await context.__nayadAuthReconcile();
  assert.equal(state.opened,0);assert.equal(elements.app.classList.contains('hide'),true);
  // A successful explicit verification is the only path that clears the lock.
  vm.runInContext('faceIdUnlockRequired=false',context);
  await context.showAuthenticatedApp();assert.equal(state.opened,1);
});
test('a session read started before backgrounding cannot bypass a later lock',async()=>{
  const {context,state}=setup();let resolve;
  context.nayadSupabase.auth.getSession=()=>new Promise(r=>resolve=r);
  const pending=context.showAuthenticatedApp();context.requestFaceIdLock();
  resolve({data:{session:state.session}});await pending;assert.equal(state.opened,0);
});
test('pending biometric and canceled/failed verification stay locked',async()=>{
  const {context,state}=setup();context.requestFaceIdLock();
  vm.runInContext('faceIdUnlocking=true',context);
  await context.showAuthenticatedApp();assert.equal(state.opened,0);
  vm.runInContext('faceIdUnlocking=false',context);
  await context.showLoginScreen();assert.equal(state.opened,0);
});
test('pagehide locks; native passkey prompt lifecycle does not relock',async()=>{
  const {context,handlers}=setup();vm.runInContext('faceIdUnlocking=true',context);
  handlers.pagehide[0]();assert.equal(context.__nayadFaceIdLocked(),false);
  vm.runInContext('faceIdUnlocking=false',context);handlers.pagehide[0]();assert.equal(context.__nayadFaceIdLocked(),true);
});
test('phone login delegates to canonical passkey-aware login without demanding password',async()=>{
  const {context,state}=setup();await context.phoneLogin();assert.equal(state.loginCalls,1);
});
for(const succeeds of [false,true])test(`canonical Face ID ${succeeds?'success unlocks':'cancellation retains lock'} with live guard`,async()=>{
  const {context,state,elements}=setup();context.requestFaceIdLock();
  elements.faceIdLogin={checked:true};elements.rememberMe={checked:true};
  context.localStorage.setItem=()=>{};context.REMEMBER_KEY='remember';
  context.normalizeMongolianPhone=()=>'';context.setAuthBusy=()=>{};context.authMessage=()=>{};context.toast=()=>{};
  context.faceIdSupported=()=>true;context.passkeyCode=()=>'';context.faceIdFriendlyError=()=>'';
  context.console={...console,error:()=>{}};
  context.sb=context.nayadSupabase;
  let complete;context.sb.auth.signInWithPasskey=()=>new Promise(r=>complete=r);
  vm.runInContext(html.slice(html.indexOf('async function phoneLogin(){'),html.indexOf('\nasync function registerUser')),context);
  const attempt=context.phoneLogin();
  await context.showAuthenticatedApp();assert.equal(state.opened,0,'pending biometric must not expose app');
  complete(succeeds?{data:{session:state.session,user:state.session.user}}:{error:{name:'NotAllowedError'}});
  await attempt;
  assert.equal(context.__nayadFaceIdLocked(),!succeeds);assert.equal(state.opened,succeeds?1:0);
});
