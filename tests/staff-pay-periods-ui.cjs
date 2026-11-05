const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
const dom=new JSDOM('<body></body>',{url:'https://nayad.store',runScripts:'outside-only'}),w=dom.window,calls=[],messages=[];
const periods=[{month_offset:0,start_day:1,end_day:15},{month_offset:-1,start_day:16,end_day:0}];
const employee={id:'one',name:'Synthetic',phone:'12345678',wage_type:'hourly',hourly_rate:8000,pay_days:[20,5],pay_periods:periods};
w.__nayadActiveStore={id:'store',name:'Test'};w.__nayadCan=()=>true;w.toast=s=>messages.push(s);
w.nayadSupabase={from(table){const q={select(){return q},eq(){return q},gte(){return q},order(){return q},then(resolve){return Promise.resolve({data:table==='staff_employees'?[employee]:[]}).then(resolve)}};return q},async rpc(name,args){calls.push({name,args});return {data:name==='staff_ensure_settings'?{}:{media:[]}}}};
for(const f of ['staff-time.js','staff-payroll.js'])w.eval(fs.readFileSync(f,'utf8'));
await w.NayadStaff.open();w.NayadStaff.edit('one');
assert.equal(w.document.querySelectorAll('.staffPayPeriod').length,2);
assert.match(w.document.getElementById('staffPaySummary').textContent,/20-нд → тухайн сарын 1–15/);
assert.match(w.document.getElementById('staffPaySummary').textContent,/5-нд → өмнөх сарын 16–сүүлийн өдөр/);
await w.NayadStaff.save();const call=calls.find(c=>c.name==='staff_save_employee_v5');assert.deepEqual(JSON.parse(JSON.stringify(call.args.p_employee.pay_periods)),periods);assert.equal(call.args.p_store_id,'store');
w.NayadStaff.edit('one');w.document.querySelector('.staffPeriodStart').value='2';w.NayadStaff.payCount(3);assert.equal(w.document.querySelector('.staffPeriodStart').value,'2');assert.equal(w.document.querySelectorAll('.staffPayDay').length,3);
w.NayadStaff.add();assert.equal(w.document.querySelectorAll('.staffPayPeriod').length,1);assert.equal(w.document.querySelector('.staffPeriodEnd').value,'0');
w.NayadStaff.close();w.close();console.log('staff-pay-periods-ui: PASS per-employee edit, period summary, saved payload, count edit preservation, new employee defaults');
})().catch(e=>{console.error(e);process.exit(1)});
