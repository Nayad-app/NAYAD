const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','subscription.js'),'utf8');
assert.match(source,/Plus багцаар нээгдэх боломжууд/);
assert.match(source,/Хязгааргүй харилцагч/);
assert.match(source,/Хязгааргүй төлбөрийн хуваарь/);
assert.match(source,/Давтагддаг төлбөр/);
assert.match(source,/Нарийвчилсан сануулга/);
assert.match(source,/Бүх түүх, дэлгэрэнгүй тайлан/);
assert.match(source,/9,900 ₮/);
assert.match(source,/99,000 ₮/);
assert.match(source,/5 харилцагч/);
assert.match(source,/QPay холболт хийгдээгүй байна/);
assert.match(source,/contactCount\(\)>=5/,'free users must stop at five contacts');
assert.match(source,/showQpayUnavailable/,'payment button must remain visibly unavailable until merchant integration');

function classes(){const values=new Set();return {add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value)};}
const elements={};
const body={classList:classes(),appendChild(element){elements[element.id]=element;}};
const document={
  body,
  head:{insertAdjacentHTML(){}},
  createElement(){return {id:'',className:'',innerHTML:'',attributes:{},classList:classes(),setAttribute(name,value){this.attributes[name]=String(value);}};},
  getElementById:id=>elements[id]||null
};
let addCalls=0;
const context={console,document,data:{companies:[{id:1},{id:2},{id:3},{id:4},{id:5}]},setTimeout};
context.window=context;
context.window.__nayadActiveStore={name:'Namka store'};
context.window.addCompany=()=>{addCalls++;};
vm.createContext(context);
vm.runInContext(source,context,{filename:'subscription.js'});
context.window.showNayadSubscription();
assert.match(elements.nayadSubscriptionRoot.innerHTML,/Багцаа сонгох/);
assert.match(elements.nayadSubscriptionRoot.innerHTML,/99,000 ₮/);
context.window.selectNayadPlan('month');
assert.match(elements.nayadSubscriptionRoot.innerHTML,/1 сараар үргэлжлүүлэх/);
context.window.continueNayadSubscription();
assert.match(elements.nayadSubscriptionRoot.innerHTML,/Төлбөр баталгаажуулах/);
assert.equal(typeof context.window.showQpayUnavailable,'function');
context.window.addCompany();
assert.equal(addCalls,0,'the sixth free contact must open the upgrade flow instead of saving');
console.log('subscription: PASS — approved plans, free limit, and transparent QPay placeholder are present');