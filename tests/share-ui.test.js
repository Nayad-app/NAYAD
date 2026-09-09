const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

let sheetHtml='';
let styles='';
let inviteResponse={data:{sent:true,link:'https://nayad.store/?invite=invite-token'},error:null};
const inviteCalls=[];
const rpcCalls=[];
const notices=[];
let buttonLabel='Урилга илгээх';
const elements={
  shareInviteEmail:{value:'member@example.com'},
  shareInvitePermcustomers:{value:'edit'},
  shareInvitePerminvoices:{value:'view'},
  shareInvitePermpayments:{value:'none'},
  shareInvitePermloans:{value:'view'},
  shareMemberPermcustomers:{value:'view'},
  shareMemberPerminvoices:{value:'edit'},
  shareMemberPermpayments:{value:'none'},
  shareMemberPermloans:{value:'none'},
  saveMemberPermissionButton:{disabled:false,textContent:'Хадгалах'},
  removeStoreMemberButton:{disabled:false,textContent:'Хасах'},
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
context.window.toast=message=>notices.push(message);
context.window.nayadSupabase={
  auth:{
    getSession:async()=>({data:{session:{user:{id:'user-1'}}}}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
  },
  functions:{
    invoke:async(name,options)=>{inviteCalls.push({name,options});return inviteResponse;}
  },
  rpc:async(name,args)=>{
    rpcCalls.push({name,args});
    if(name==='get_my_store')return {data:[{id:'store-1',name:'tsendun store'}],error:null};
    if(name==='get_store_members_with_permissions')return {data:[
      {user_id:'user-1',full_name:'tsendun',email:'tsendun@gmail.com',role:'owner',permissions:{customers:'edit',invoices:'edit',payments:'edit',loans:'edit'}},
      {user_id:'member-1',full_name:'Naraa',email:'naraa@example.com',role:'staff',permissions:{customers:'view',invoices:'view',payments:'none',loans:'none'}}
    ],error:null};
    if(name==='update_store_member_permissions')return {data:{user_id:'member-1'},error:null};
    if(name==='remove_store_member')return {data:true,error:null};
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
  assert.match(sheetHtml,/Гишүүд · 2/);
  assert.match(sheetHtml,/tsendun@gmail\.com/);
  assert.match(sheetHtml,/Эзэмшигч/);
  assert.match(sheetHtml,/Шинэ гишүүн урих/);
  assert.match(sheetHtml,/placeholder="И-мэйл хаяг"/);
  assert.match(sheetHtml,/Урилга илгээх/);
  assert.match(sheetHtml,/Харилцагч/);
  assert.match(sheetHtml,/Нэмэх, засах/);
  assert.match(sheetHtml,/Эрх засах/);
  assert.match(sheetHtml,/Хасах/);
  assert.doesNotMatch(sheetHtml,/name@gmail\.com|＋ Гишүүн урих/,'old invite UI must be gone');

  await context.window.createStoreInvite();
  assert.equal(inviteCalls.length,1,'share must invoke the email delivery function exactly once');
  assert.equal(inviteCalls[0].name,'send-store-invite');
  assert.equal(inviteCalls[0].options.body.store_id,'store-1');
  assert.equal(inviteCalls[0].options.body.email,'member@example.com');
  assert.deepEqual(JSON.parse(JSON.stringify(inviteCalls[0].options.body.permissions)),{customers:'edit',invoices:'view',payments:'none',loans:'view'});
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

  context.window.showStoreMemberPermissions('member-1');
  assert.match(sheetHtml,/Гишүүний эрх/);
  assert.match(sheetHtml,/Naraa/);
  await context.window.saveStoreMemberPermissions('member-1');
  const updateCall=rpcCalls.find(call=>call.name==='update_store_member_permissions');
  assert.equal(updateCall.args.p_store_id,'store-1');
  assert.equal(updateCall.args.p_user_id,'member-1');
  assert.deepEqual(JSON.parse(JSON.stringify(updateCall.args.p_permissions)),{customers:'view',invoices:'edit',payments:'none',loans:'none'});

  context.window.confirmRemoveStoreMember('member-1');
  assert.match(sheetHtml,/Гишүүн хасах/);
  await context.window.removeStoreMember('member-1');
  const removeCall=rpcCalls.find(call=>call.name==='remove_store_member');
  assert.equal(removeCall.args.p_store_id,'store-1');
  assert.equal(removeCall.args.p_user_id,'member-1');
  console.log('share-ui: PASS — sharing renders and reports real email delivery status');
})().catch(error=>{console.error(error);process.exitCode=1;});
