const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.NAYAD_BROWSER_PATH?{executablePath:process.env.NAYAD_BROWSER_PATH}:{})});
 const page=await browser.newPage({viewport:{width:440,height:956}});
 const source=fs.readFileSync('index.html','utf8');
 const styles=[...source.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m=>m[0]).join('');
 const header=source.match(/<div id="app"[^>]*>(<header>[\s\S]*?<\/header>)/)[1];
 const html=`<html><head><meta charset="utf-8">${styles}</head><body><div id="app" class="app">${header}<main id="content"><div class="stat warn">Өглөгтэй харилцагч</div><button class="primary">+</button></main></div><div id="modal" class="modal hide"><div id="sheet" class="sheet"></div></div></body></html>`;
 await page.route('https://nayad.test/**',r=>r.fulfill({body:html,contentType:'text/html'}));
 async function setup(){await page.goto('https://nayad.test/');await page.evaluate(()=>{window.__nayadUser={id:'user-a'};window.__nayadStoresUserId='user-a';window.__nayadActiveStore={id:'store-a',name:'NAYAD market'};window.sheet=s=>{document.getElementById('sheet').innerHTML=s;document.getElementById('modal').classList.remove('hide')};window.closeSheet=()=>document.getElementById('modal').classList.add('hide')});await page.addScriptTag({content:fs.readFileSync('store-background.js','utf8')});}
 await setup();
 const bg=()=>page.locator('#app').evaluate(el=>getComputedStyle(el).backgroundColor);
 const controls=()=>page.locator('#content .stat.warn,#content .primary').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor));
 const original=await controls();
 const positions=await page.locator('#storeBackgroundButton,#profileMenuButton').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));assert.ok(positions[0].right<=positions[1].left+1,'picker must be left of hamburger');
 await page.click('#storeBackgroundButton');await page.click('[data-color=blue]');await page.click('.storeBackgroundClose');assert.equal(await bg(),'rgb(246, 246, 243)','cancel does not apply');
 await page.click('#storeBackgroundButton');await page.click('[data-color=blue]');await page.click('.storeBackgroundSave');assert.equal(await bg(),'rgb(238, 244, 250)');assert.deepEqual(await controls(),original,'semantic and button colors unchanged');
 await setup();assert.equal(await bg(),'rgb(238, 244, 250)','reload remembers choice');
 await page.evaluate(()=>{window.__nayadActiveStore={id:'store-b',name:'Second'};window.__nayadRefreshStoreBackground()});assert.equal(await bg(),'rgb(246, 246, 243)','other store starts default');
 await page.click('#storeBackgroundButton');await page.click('[data-color=green]');await page.click('.storeBackgroundSave');assert.equal(await bg(),'rgb(238, 246, 240)');
 await page.evaluate(()=>{window.__nayadActiveStore={id:'store-a',name:'NAYAD market'};window.__nayadRefreshStoreBackground()});assert.equal(await bg(),'rgb(238, 244, 250)');
 await page.click('#storeBackgroundButton');await page.click('[data-color=pink]');await page.evaluate(()=>{window.__nayadActiveStore={id:'store-b',name:'Second'};window.__nayadRefreshStoreBackground()});await page.click('.storeBackgroundSave');assert.ok(await page.locator('.storeBackgroundError').textContent());assert.equal(await bg(),'rgb(238, 246, 240)','stale dialog cannot write another store');
 await page.evaluate(()=>{closeSheet();window.__nayadUser={id:'user-b'};window.__nayadStoresUserId='user-b';window.__nayadRefreshStoreBackground()});assert.equal(await bg(),'rgb(246, 246, 243)','accounts isolated');
 await page.evaluate(()=>{window.__nayadUser={id:'user-a'};window.__nayadStoresUserId='user-a';window.__nayadRefreshStoreBackground();document.documentElement.classList.add('nightMode')});await page.waitForTimeout(30);assert.equal(await bg(),'rgb(27, 40, 32)','night mode stays dark');
 await page.evaluate(()=>document.documentElement.classList.remove('nightMode'));
 for(const width of [320,440,1280]){await page.setViewportSize({width,height:800});await page.click('#storeBackgroundButton');if(width===440)await page.screenshot({path:'/tmp/nayad-background-picker.png'});const r=await page.locator('#sheet').boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width+1&&r.y>=0&&r.y+r.height<=800);await page.click('.storeBackgroundClose');}
 console.log('PASS picker location, cancel/save, reload, store/account isolation, stale dialog, night mode, modal bounds');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
