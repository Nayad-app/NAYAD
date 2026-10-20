// Run with Playwright available; NAYAD_BROWSER_PATH optionally selects a local Chromium.
const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.NAYAD_BROWSER_PATH?{executablePath:process.env.NAYAD_BROWSER_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:{} )});
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/*',r=>r.abort());
 const style=fs.readFileSync('index.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+style+'</style></head><body></body></html>');
 await page.addStyleTag({content:fs.readFileSync('responsive-layout.css','utf8')});
 await page.evaluate(()=>{
  const employees=[{id:'monthly',name:'Жишээ ажилтан урт нэртэй',phone:'12345678',wage_type:'monthly',monthly_salary:1500000,pay_days:[],daily_hours:9},{id:'hourly',name:'Бат',phone:'87654321',wage_type:'hourly',hourly_rate:7000,pay_days:[10,25],daily_hours:9}];
  window.__nayadActiveStore={id:'synthetic',name:'Жишээ дэлгүүр'};
  window.nayadSupabase={from(table){const q={select(){return q},eq(){return q},gte(){return q},lt(){return q},order(){return q},maybeSingle(){return Promise.resolve({data:null})},then(fn){return Promise.resolve({data:table==='staff_employees'?employees:[]}).then(fn)}};return q},async rpc(){return {data:{}}}};
 });
 for(const file of ['staff-time.js','staff-payroll.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(()=>NayadStaff.open());
 for(const width of [320,390,430,768,1280]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>NayadStaff.tab('salary'));
  const cards=await page.locator('.staffSalaryCard').evaluateAll(els=>els.map(el=>{const card=el.getBoundingClientRect(),name=el.querySelector('.staffSalaryName').getBoundingClientRect(),amount=el.querySelector('.staffSalaryTotal').getBoundingClientRect(),text=el.querySelector('.staffSalaryStatus').getBoundingClientRect();return {width:card.width,scroll:el.scrollWidth,client:el.clientWidth,nameWidth:name.width,amountBelow:amount.top>=text.bottom,amountInside:amount.right<=card.right,headerHeight:name.height}}));
  for(const c of cards){assert.ok(c.nameWidth>100,JSON.stringify(c));assert.ok(c.amountBelow&&c.amountInside);assert.ok(c.scroll<=c.client+1);assert.ok(c.headerHeight<70);}
  await page.evaluate(()=>{NayadStaff.edit('monthly');document.getElementById('staffSalarySection').open=true;});
  const inputs=await page.locator('#staffStart,#staffEnd,#staffEffective').evaluateAll(els=>els.map(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return {inside:a.left>=b.left&&a.right<=b.right+1,width:a.width,appearance:getComputedStyle(el).webkitAppearance}}));
  for(const input of inputs){assert.ok(input.inside,JSON.stringify(input));assert.ok(input.width>100);assert.equal(input.appearance,'none');}
  const bounds=await page.locator('#staffStart,#staffEnd').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));assert.ok(bounds[0].right+8<=bounds[1].left,'time inputs must retain their gap');
  assert.equal(await page.locator('#staffStart').inputValue(),'09:00');assert.equal(await page.locator('#staffEnd').inputValue(),'18:00');
  console.log(`PASS staff layout ${width}px — monthly/hourly cards, long name, amount separation, time/date containment`);
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>NayadStaff.tab('salary'));await page.screenshot({path:'/tmp/nayad-salary-fixed.png'});
 await page.evaluate(()=>{NayadStaff.edit('monthly');document.getElementById('staffSalarySection').open=true;});await page.locator('#staffStart').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/nayad-time-fixed.png'});
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
