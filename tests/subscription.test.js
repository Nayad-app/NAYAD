const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','subscription.js'),'utf8');
assert.match(source,/Plus багцаар нээгдэх боломжууд/);
assert.match(source,/Хязгааргүй харилцагч/);
assert.match(source,/9,900 ₮/);
assert.match(source,/99,000 ₮/);
assert.match(source,/5 харилцагч/);
assert.match(source,/from\('subscription_plans'\)/,'prices must load from the database');
assert.match(source,/from\('store_subscriptions'\)/,'the free limit must respect an active Plus subscription');
assert.match(source,/String\(subscriptionStoreId\|\|''\)===String\(activeStoreId\(\)\|\|''\)/,'Plus access must belong to the active store');
assert.match(source,/__nayadApplyStoreSubscription/,'a paid or refreshed subscription must update the active store badge');
assert.match(source,/functions\.invoke\('qpay-billing'/,'payment must go through the server-side QPay function');
assert.match(source,/action,\.\.\.payload/);
assert.match(source,/Төлбөр шалгах/);
assert.match(source,/Банкны апп сонгох/);
assert.match(source,/nayadSubscriptionBankLogo/,'QPay-provided bank logos must be rendered');
assert.match(source,/function safeLogoUrl/,'external logo URLs must be validated');
assert.doesNotMatch(source,/QPay холболт хийгдээгүй байна/,'the old placeholder must be removed');

function classes(){const values=new Set();return {add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value)};}
const elements={};
const body={classList:classes(),appendChild(element){elements[element.id]=element;}};
const document={
  body,
  head:{insertAdjacentHTML(){}},
  createElement(){return {id:'',className:'',innerHTML:'',attributes:{},classList:classes(),setAttribute(name,value){this.attributes[name]=String(value);}};},
  getElementById:id=>elements[id]||null
};
let addCalls=0,loanCalls=0,timerCallback=null;
const invocations=[];
const context={console,document,data:{companies:[{id:1},{id:2},{id:3},{id:4},{id:5}]},setTimeout,
  setInterval(callback){timerCallback=callback;return 1;},clearInterval(){timerCallback=null;}};
context.window=context;
context.window.location={href:'https://nayad.store'};
context.window.__nayadActiveStore={id:'33333333-3333-4333-8333-333333333333',name:'Namka store',role:'owner'};
context.window.__nayadActiveStoreId=context.window.__nayadActiveStore.id;
context.window.addCompany=()=>{addCalls++;};
context.window.showLoanCreate=()=>{loanCalls++;};
context.window.__nayadSyncLoans=async()=>true;
context.window.__nayadLoanCount=()=>1;
context.window.nayadSupabase={functions:{invoke:async(name,{body})=>{
  invocations.push({name,body});
  if(body.action==='create')return {data:{order_id:'44444444-4444-4444-8444-444444444444',amount:9900,status:'pending',qr_image:'abc',urls:[{name:'Test bank',link:'testbank://pay',logo:'https://qpay.mn/q/logo/test.png'},{name:'Unsafe bank',link:'unsafe://pay',logo:'javascript:alert(1)'}]},error:null};
  return {data:{paid:true,status:'paid',subscription:{current_period_end:'2027-09-09T00:00:00Z'}},error:null};
}}};
vm.createContext(context);
vm.runInContext(source,context,{filename:'subscription.js'});

(async()=>{
  context.window.showNayadSubscription();
  assert.match(elements.nayadSubscriptionRoot.innerHTML,/Багцаа сонгох/);
  assert.match(elements.nayadSubscriptionRoot.innerHTML,/99,000 ₮/);
  context.window.closeNayadSubscription();
  await context.window.addCompany();
  assert.equal(addCalls,0,'the sixth free contact must open the upgrade flow instead of saving');
  assert.match(elements.nayadPlanLimitRoot.innerHTML,/Харилцагчийн хязгаар хүрлээ/);
  assert.match(elements.nayadPlanLimitRoot.innerHTML,/Plus багц идэвхжүүлэх/);
  assert.match(elements.nayadPlanLimitRoot.innerHTML,/nayadPlanLimitUpgrade[^>]*>[\s\S]*?<svg/,'the approved Plus button must include the crown icon');
  context.window.closeNayadPlanLimit();
  await context.window.showLoanCreate();
  assert.equal(loanCalls,0,'the second free loan must open the upgrade flow instead of the form');
  assert.match(elements.nayadPlanLimitRoot.innerHTML,/Зээлийн хязгаар хүрлээ/);
  context.window.openNayadLimitUpgrade();
  assert.match(elements.nayadSubscriptionRoot.innerHTML,/Багцаа сонгох/);
  context.window.selectNayadPlan('month');
  context.window.continueNayadSubscription();
  assert.match(elements.nayadSubscriptionRoot.innerHTML,/Төлбөр баталгаажуулах/);
  await context.window.startNayadQpayCheckout();
  assert.equal(invocations[0].name,'qpay-billing');
  assert.equal(invocations[0].body.action,'create');
  assert.equal(invocations[0].body.store_id,'33333333-3333-4333-8333-333333333333');
  assert.equal(invocations[0].body.plan_code,'month');
  assert.match(elements.nayadSubscriptionRoot.innerHTML,/QPay төлбөр/);
  assert.match(elements.nayadSubscriptionRoot.innerHTML,/Test bank/);
  assert.match(elements.nayadSubscriptionRoot.innerHTML,/class="nayadSubscriptionBankLogo" src="https:\/\/qpay\.mn\/q\/logo\/test\.png"/);
  assert.doesNotMatch(elements.nayadSubscriptionRoot.innerHTML,/src="javascript:/,'unsafe logo protocols must not be rendered');
  assert.ok(timerCallback,'payment status polling must start');
  await context.window.checkNayadQpayPayment(true);
  assert.equal(invocations[1].body.action,'check');
  assert.match(elements.nayadSubscriptionRoot.innerHTML,/Төлбөр амжилттай/);
  console.log('subscription: PASS — approved plans, live QPay checkout, polling, and contact/loan limit dialogs are present');
})().catch(error=>{console.error(error);process.exitCode=1;});
