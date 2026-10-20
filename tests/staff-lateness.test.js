const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../staff-time');
const rule={enabled:true,grace:5,interval:5,amount:2000,basis:'excess',rounding:'floor',cap:null};
test('lateness applies configurable grace, intervals, rounding and daily limits',()=>{
 assert.equal(T.lateAmount(rule,5),0);assert.equal(T.lateAmount(rule,9),0);assert.equal(T.lateAmount(rule,17),4000);
 assert.equal(T.lateAmount({...rule,rounding:'ceil'},17),6000);assert.equal(T.lateAmount({...rule,basis:'all'},17),6000);
 assert.equal(T.lateAmount({...rule,cap:3000},17),3000);assert.equal(T.lateAmount({...rule,enabled:false},50),0);
 assert.equal(T.lateAmount({...rule,interval:10},25),4000);
});
test('only approved deductions contribute to salary',()=>{
 assert.equal(T.deduction({approval_status:'pending',wage_snapshot:{late_deduction:4000}}),0);
 assert.equal(T.deduction({approval_status:'approved',wage_snapshot:{late_deduction:4000}}),4000);
 assert.equal(T.deduction({approval_status:'approved',wage_snapshot:{late_deduction:0,late_reason:'Чөлөөлсөн'}}),0);
});
