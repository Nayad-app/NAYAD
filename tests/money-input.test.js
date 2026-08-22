const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const context={
  console,Number,String,
  document:{addEventListener(){},querySelectorAll(){return[];}}
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','money-input.js'),'utf8'),context,{filename:'money-input.js'});

assert.equal(context.__nayadFormatMoneyInput('1000'),'1,000');
assert.equal(context.__nayadFormatMoneyInput('1000000'),'1,000,000');
assert.equal(context.__nayadFormatMoneyInput('1000000.00'),'1,000,000.00');
assert.equal(context.__nayadFormatMoneyInput('1,234,567.891'),'1,234,567.89');
assert.equal(context.__nayadParseMoneyInput('1,000,000.00'),1000000);
assert.equal(context.__nayadParseMoneyInput('1,234.50'),1234.5);

console.log('money-input: PASS — monetary fields group thousands and preserve two decimals');
