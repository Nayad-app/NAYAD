const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

let sheetHtml='';
let styles='';
let inviteResponse={data:{sent:true,link:'https://nayad.store/?invite=invite-token'},error:null};
const inviteCalls=[];
let buttonLabel='Урилга илгээх';
const elements={
  shareInviteEmail:{value:'member@example.com'},
  shareInviteButton:{
    disabled:false,isConnected:true,
    querySelector:selector=>selector==='span'?{replaceChildren:value=>{buttonLabel=value;}}:null
  }
};
const context={
  console,URL,URLSearchParams,setTimeout:fn=>{fn();return 1;},
  location:{origin:'https://nayad.store',pathname:'/',search:'',href:'https://nayad.store/'},
  history:{replaceState(){}},sessionStorage:{setItem(){}},navigator:{},
  document:{
    getElementById:id=>elements[id]||null,querySelector:()=>null,
    head:{insertAdjacentHTML:(_where,html)=>{styles=html;}},
    body:{},createElement:()=>({})
  },
  MutationObserver:function(){this.observe=()=>{};}
};
context.window=context;
context.window.addEventListener=()=>{};
context.window.sheet=html=>{sheetHtml=html;};
context.window.closeSheet=()=>{};
context.window.nayadSupabase={
  auth:{
    getSession:async()=>({data:{session:{user:{id:'user-1'}}}}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
  },
  functions:{
    invoke:async(name,options)=>{inviteCalls.push({name,options});return inviteResponse;}
  },
  rpc:async(name)=>{
    if(name==='get_my_store')return {data:[{id:'store-1',name:'tsendun store'}],error:null};
    if(name==='get_store_members')return {data:[{user_id:'user-1',full_name:'tsendun',email:'tsendun@gmail.com',role:'owner'}],error:null};
    throw new Error('Unexpected RPC: '+name);
  }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','share.js'),'utf8'),context,{filename:'share.js'});

(async()=>{
  await context.window.showStoreShare();
  assert.match(styles,/nayad-share-styles/,'share styles must be installed');
  assert.match(sheetHtml,/class="shareHeader"/);
  assert.match(sheetHtml,/class="shareCloseIcon"/);
  assert.match(sheetHtml,/tsendun store/);
  assert.match(sheetHtml,/Гишүүд · 1/);
  assert.match(sheetHtml,/tsendun@gmail\.com/);
  assert.match(sheetHtml,/Эзэмшигч/);
  assert.match(sheetHtml,/Шинэ гишүүн урих/);
  assert.match(sheetHtml,/placeholder="И-мэйл хаяг"/);
  assert.match(sheetHtml,/Урилга илгээх/);
  assert.doesNotMatch(sheetHtml,/name@gmail\.com|＋ Гишүүн урих/,'old invite UI must be gone');

  await context.window.createStoreInvite();
  assert.equal(inviteCalls.length,1,'share must invoke the email delivery function exactly once');
  assert.equal(inviteCalls[0].name,'send-store-invite');
  assert.equal(inviteCalls[0].options.body.store_id,'store-1');
  assert.equal(inviteCalls[0].options.body.email,'member@example.com');
  assert.match(sheetHtml,/Урилга илгээгдлээ/);
  assert.match(sheetHtml,/member@example\.com/);
  assert.match(sheetHtml,/invite-token/);
  assert.equal(buttonLabel,'Урилга илгээх','invite button must leave its busy state');

  inviteResponse={data:{sent:false,link:'https://nayad.store/?invite=fallback-token'},error:null};
  await context.window.createStoreInvite();
  assert.equal(inviteCalls.length,2);
  assert.match(sheetHtml,/И-мэйл илгээгдсэнгүй/,'provider failure must not be presented as email success');
  assert.match(sheetHtml,/Холбоос хуулах/,'provider failure must keep a usable invite link');
  assert.match(sheetHtml,/fallback-token/);
  console.log('share-ui: PASS — sharing renders and reports real email delivery status');
})().catch(error=>{console.error(error);process.exitCode=1;});
