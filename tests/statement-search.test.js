const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../statement-search.js'),'utf8'),ctx);
const {matches}=ctx.window.NayadSearch;
test('Latin and Mongolian supplier searches match substrings in both directions',()=>{
 for(const q of ['B','b','Б','б']){assert.ok(matches('Баясах Хүлж',q));assert.ok(matches('ABC supplier',q));}
 assert.ok(matches('Баясах','Bayasah'));assert.ok(matches('Bayasah','Баясах'));
 assert.ok(matches('Хонгороо','khongoroo'));assert.ok(matches('Хонгороо','hongoroo'));
 assert.ok(matches('Шаргалжуут','shargaljuut'));assert.ok(matches('Чойс','chois'));
 assert.ok(matches('Өглөө','ogloo'));assert.ok(matches('INV-103','inv-103'));
 assert.equal(matches('Номин','Баясах'),false);
});
