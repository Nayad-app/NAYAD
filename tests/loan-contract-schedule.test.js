const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../loan-contract-schedule');
const examples=[
 ['Инвескор',45000000,'2026-03-06','2026-04-09',9,36,2133000,2088357.67,76743357.67],
 ['Ричкапитал',10000000,'2025-01-13','2025-02-13',13,24,590110.92,586665.71,14159216.87],
 ['36.8 сая',36800000,'2026-01-20','2026-02-05',5,18,2369500,2369437.37,42650937.37],
 // The photographed Golomt schedule omits disbursement date: use a synthetic date only for this fixture.
 ['Голомт',70000000,'2026-09-25','2026-10-10',10,24,3593900,3412638.77,86072338.77]
];
for(const [name,principal,startDate,firstDate,paymentDay,term,regular,last,total] of examples)test(name+' contract amounts match supplied schedule',()=>{
 const d={principal,startDate,firstDate,paymentDay,term,regular,last},rows=S.generate(d);
 assert.equal(S.validate(d,rows),total);assert.equal(rows[0].due_date,firstDate);assert.equal(rows.at(-1).total_amount,last);assert.ok(rows.every(r=>r.status==='pending'&&r.principal_amount===null&&r.interest_amount===null));
});
test('first date independent, leap day clamp and return to 31st',()=>{
 const d={principal:100,startDate:'2028-01-01',firstDate:'2028-01-15',paymentDay:31,term:3,regular:40,last:40};
 assert.deepEqual(S.generate(d).map(r=>r.due_date),['2028-01-15','2028-02-29','2028-03-31']);
});
test('reject invalid money, dates and mismatched breakdown',()=>{
 for(const v of ['NaN','Infinity','-1','1.001','',null])assert.throws(()=>S.money(v));
 const d={principal:100,startDate:'2026-01-01',firstDate:'2026-02-05',paymentDay:5,term:2,regular:60,last:60},rows=S.generate(d);
 rows[0].principal_amount=50;rows[0].interest_amount=5;assert.throws(()=>S.validate(d,rows),/нийт дүн/);
 rows[0].interest_amount=10;rows[1].principal_amount=50;rows[1].interest_amount=10;assert.equal(S.validate(d,rows),120);
 rows[1].due_date=rows[0].due_date;assert.throws(()=>S.validate(d,rows),/огноо/);
 assert.throws(()=>S.generate({...d,firstDate:'2026-02-30'}));
});
