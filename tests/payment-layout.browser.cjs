const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.NAYAD_BROWSER_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/*',r=>r.abort());
 const source=fs.readFileSync('index.html','utf8');await page.setContent('<style>'+source.match(/<style>([\s\S]*?)<\/style>/)[1]+'</style><div id="modal"><div id="sheet" class="sheet"></div></div>');
 await page.addStyleTag({content:fs.readFileSync('responsive-layout.css','utf8')});
 await page.evaluate(()=>{
  window.payment=()=>{};window.payments=()=>{};window.reports=()=>{};window.company=()=>{};window.sync=()=>{};
  window.__nayadActiveStoreId='synthetic';window.__nayadState={read:()=>({companies:[{id:1,name:'Жишээ нийлүүлэгч',bankAccount:'00123456789',paymentReference:'Жишээ гүйлгээний утга',bankIban:'MN001234567890123456',invoices:[{id:'old',no:'001',date:'2026-09-20',amount:500000},{id:'new',no:'002',date:'2026-10-05',amount:1000000}]}],payments:[]})};
  window.sheet=html=>{document.getElementById('sheet').innerHTML=html;document.getElementById('modal').className='modal show';};
 });
 await page.addScriptTag({content:fs.readFileSync('payment-center.js','utf8')});await page.evaluate(()=>payment(1));
 for(const width of [320,390,430,768,1280]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>{payment(1);document.getElementById('pcAmount').value='800000';recalculatePaymentTotal()});
  const out=await page.locator('#sheet input,#sheet .pcCopy,#sheet .pcAllocation').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {id:el.id,left:r.left,right:r.right,width:innerWidth}}).filter(r=>r.left<0||r.right>r.width+1));assert.deepEqual(out,[]);
  await page.evaluate(()=>reviewPaymentCenter(1));
  const overflow=await page.locator('.pcTransferDetails,.pcTransferDetails .pcCopy').evaluateAll(els=>els.some(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}));assert.equal(overflow,false);assert.equal(await page.locator('.pcTransferDetails .pcCopy').count(),4);
  console.log('PASS payment entry and confirmation layout '+width);
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/nayad-payment-preview.png',fullPage:true});await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
