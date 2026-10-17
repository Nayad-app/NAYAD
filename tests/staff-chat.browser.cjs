const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.NAYAD_BROWSER_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/*',r=>r.abort());
 const source=fs.readFileSync('index.html','utf8');
 const app=source.match(/<div id="app"[\s\S]*?<\/div><\/div>/)[0].replace('class="app hide"','class="app"');
 await page.setContent('<style>'+source.match(/<style>([\s\S]*?)<\/style>/)[1]+'</style>'+app);
 await page.addStyleTag({content:fs.readFileSync('responsive-layout.css','utf8')});
 await page.evaluate(()=>{
 document.getElementById('app').classList.remove('hide');document.getElementById('content').innerHTML='<div style="height:3000px">Жишээ жагсаалт</div>';
 window.__nayadActiveStore={id:'synthetic',name:'Жишээ дэлгүүр'};
 window.nayadSupabase={from(){const q={select(){return q},eq(){return q},gte(){return q},order(){return q},then(fn){return Promise.resolve({data:[]}).then(fn)}};return q},async rpc(name){return {data:name==='staff_hub'?{participants:[],actor:'owner',threads:[]}: {}}}};
 });
 for(const file of ['staff-hub.js','staff-time.js','staff-payroll.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 const button=page.locator('#staffChatShortcut');
 for(const width of [320,390,430,768,1280]){
 await page.setViewportSize({width,height:844});await page.waitForTimeout(80);
 assert.ok(await button.isVisible());const before=await button.boundingBox();
 await page.evaluate(()=>scrollTo(0,1200));await page.waitForTimeout(80);const after=await button.boundingBox();assert.equal(before.y,after.y);assert.equal(before.x,after.x);
 const nav=await page.locator('#app > .bottom').boundingBox();if(nav.y>422)assert.ok(after.y+after.height+17<=nav.y);
 assert.ok(after.x>=0&&after.x+after.width<=width);console.log('PASS fixed chat position '+width);
 }
 await page.setViewportSize({width:390,height:844});await button.click();await page.locator('.hubSection').first().waitFor();assert.equal(await page.locator('.staffTabs .active').innerText(),'Чат');assert.equal(await button.isVisible(),false);
 await page.getByRole('button',{name:'Цаг',exact:true}).click();await page.locator('#staffTimeRows').waitFor();
 await page.getByRole('button',{name:'Цалин',exact:true}).click();assert.equal(await page.locator('.staffTabs .active').innerText(),'Цалин');
 await page.evaluate(()=>NayadStaff.close());assert.ok(await button.isVisible());
 await page.evaluate(()=>document.querySelector('.nav[data-page="home"]').classList.remove('active'));await page.waitForTimeout(50);assert.equal(await button.isVisible(),false);
 await page.evaluate(()=>{document.querySelector('.nav[data-page="home"]').classList.add('active');document.getElementById('app').classList.add('hide')});await page.waitForTimeout(50);assert.equal(await button.isVisible(),false);
 console.log('PASS chat opens directly; time/salary tabs; close, other section and signed-out visibility');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
