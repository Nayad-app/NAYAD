const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const file of ['invoice-cloud.js','payment-center.js']){
 const source=fs.readFileSync(file,'utf8');
 const helpers=source.slice(source.indexOf('  function onTimeAmount('),source.indexOf('  function bindAmountPreview('));
 const c=vm.createContext({});vm.runInContext(helpers,c);
 test(file+': exact amount entry and legacy values',()=>{
  for(const [total,cash] of [[100000,96000],[427700,400001],[999999999999.99,123456789012.34],[333.33,321.12]]){
   const percent=c.amountDiscount(total,String(cash));
   assert.equal(c.onTimeAmount({amount:total,discount_percent:percent}),cash);
  }
  assert.equal(c.amountDiscount(100000,''),0);
  for(const raw of ['0','-1','100001','abc','1.234'])assert.ok(Number.isNaN(c.amountDiscount(100000,raw)));
  assert.equal(c.onTimeAmount({amount:100000,discount_percent:4}),96000);
 });
}
const source=fs.readFileSync('payment-center.js','utf8');
const fn=source.slice(source.indexOf('  function discountInfo('),source.indexOf('  function dueMeta('));
const c=vm.createContext({today:()=> '2026-10-31',balanceOf:i=>Math.max(i.amount-i.paid,0)});vm.runInContext(fn,c);
test('deadline inclusive, late, partial, settled, reversal',()=>{
 const i={amount:100000,paid:0,discount_percent:4,discount_deadline:'2026-10-31'};
 assert.equal(c.discountInfo(i,'2026-10-31').cash,96000);
 assert.equal(c.discountInfo(i,'2026-11-01').cash,100000);
 assert.equal(c.discountInfo({...i,paid:40000},'2026-10-31').cash,56000);
 assert.equal(c.discountInfo({...i,paid:40000},'2026-11-01').cash,60000);
 assert.equal(c.discountInfo({...i,paid:100000,discount_taken:4000},'2026-11-01').cash,0);
 assert.equal(c.discountInfo({...i,paid:0,discount_taken:0},'2026-11-01').cash,100000);
});
