const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

let sheetHtml='';
let styles='';
const context={
  console,URL,URLSearchParams,setTimeout:fn=>{fn();return 1;},
  location:{origin:'https://nayad.store',pathname:'/',search:'',href:'https://nayad.store/'},
  history:{replaceState(){}},sessionStorage:{setItem(){}},navigator:{},
  document:{
    getElementById:()=>null,querySelector:()=>null,
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
  console.log('share-ui: PASS — approved mobile sharing layout is rendered');
})().catch(error=>{console.error(error);process.exitCode=1;});
