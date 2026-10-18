const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={console,Intl,Date,Math,URL,Promise,setTimeout:()=>1,clearTimeout(){},addEventListener(){},document:{head:{appendChild(){}},createElement:()=>({}),addEventListener(){},getElementById:()=>null},__nayadActiveStore:{id:'test',role:'owner'},__nayadActiveStoreId:'test'};
context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync('loans.js','utf8').replace('  function sb(){','  window.fixture=state;\n  function sb(){'),context);
const loan=(id,date)=>({id,status:'active',lender_name:id,installments:[{id:id+'-row',due_date:date,total_amount:100,paid_amount:0,status:'pending'}]});
context.fixture.storeId='test';context.fixture.loans=[loan('later','2099-12-01'),loan('soon','2099-01-01'),loan('overdue','2000-01-01')];
const html=context.loans();assert.ok(html.indexOf('data-loan="overdue"')<html.indexOf('data-loan="soon"'));assert.ok(html.indexOf('data-loan="soon"')<html.indexOf('data-loan="later"'));assert.ok(!html.includes('loanPeriod'));
console.log('PASS loans ordered by earliest unpaid due date, overdue first, without added date filters');
