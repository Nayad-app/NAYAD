const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../loan-contract-schedule');
test('simple schedule preserves monthly day through February and ends on selected date',()=>{
 const s=S.simple('2026-01-31','2026-04-15','850,000');
 assert.deepEqual(s.rows.map(r=>r.due_date),['2026-01-31','2026-02-28','2026-03-31','2026-04-15']);
 assert.equal(s.draft.principal,null);assert.equal(S.validate(s.draft,s.rows),3400000);
 assert.ok(s.rows.every(r=>r.principal_amount===null&&r.interest_amount===null));
});
test('simple schedule supports one payment, leap day, rejects invalid dates and empty amounts',()=>{
 assert.equal(S.simple('2026-10-20','2026-10-20',100).rows.length,1);
 assert.equal(S.simple('2028-01-31','2028-03-31',100).rows[1].due_date,'2028-02-29');
 for(const args of [['2026-02-30','2026-04-01',100],['2026-10-20','2026-10-19',100],['2026-10-20','2026-11-20',''],['2026-10-20','2026-11-20',0],['2026-10-20','2080-11-20',100]])assert.throws(()=>S.simple(...args));
});
