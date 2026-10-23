// NODE_PATH=<Playwright installation> node tests/landing-fit.browser.cjs
const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
  const html=fs.readFileSync('index.html','utf8');
  const styles=[...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m=>m[0]).join('\n');
  const landing=html.slice(html.indexOf('<div id="landing"'),html.indexOf('<div id="login"')).replace('class="landing hide"','class="landing"');
  const fit=html.slice(html.indexOf('// ResizeObserver also'),html.indexOf('function showLandingScreen'));
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.NAYAD_BROWSER_PATH?{executablePath:process.env.NAYAD_BROWSER_PATH}:{})});
  const page=await browser.newPage();
  await page.route('**/*',r=>r.abort());
  await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'</head><body>'+landing+'</body></html>');
  await page.addScriptTag({content:fit});
  for(const [width,height,top,bottom] of [[320,568,20,0],[375,667,20,0],[390,664,0,0],[390,844,47,34],[440,956,62,34],[600,800,0,0]]){
    await page.setViewportSize({width,height});
    await page.locator('#landing').evaluate((el,{top,bottom})=>{el.style.paddingTop=top+'px';el.style.paddingBottom=bottom+'px';},{top,bottom});
    await page.waitForTimeout(80);
    const result=await page.evaluate(()=>{
      const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
      return {height:innerHeight,width:innerWidth,bodyHeight:document.documentElement.scrollHeight,bodyWidth:document.documentElement.scrollWidth,stage:rect('.deviceShowcase'),phone:rect('.landingPhone'),footer:rect('.landingFooter'),items:[...document.querySelectorAll('.landingEyebrow,.landingCopy h1,.landingCopy>p,.landingActions button,.landingFeatureBox,.landingHeader')].map(el=>({rect:el.getBoundingClientRect().toJSON(),scroll:el.scrollWidth,client:el.clientWidth}))};
    });
    assert.ok(result.bodyHeight<=height+1&&result.bodyWidth<=width+1,JSON.stringify(result));
    for(const {rect,scroll,client} of result.items){assert.ok(rect.top>=top-1&&rect.bottom<=height-bottom+1&&rect.left>=-1&&rect.right<=width+1,JSON.stringify(rect));assert.ok(scroll<=client+1,'text must not overflow');}
    assert.ok(result.phone.top>=result.stage.top-1&&result.phone.bottom<=result.stage.bottom+1,'phone must fit stage');
    assert.ok(result.stage.height>30,'illustration must remain visible');
    assert.ok(result.footer.bottom<=height-bottom+1,'footer must fit safe area');
    await page.mouse.move(width/2,height/2);await page.mouse.wheel(0,600);
    assert.equal(await page.evaluate(()=>scrollY),0,'swipe must not move the page');
    console.log(`PASS full landing ${width}x${height}, safe areas ${top}/${bottom}`);
    if(width===440)await page.screenshot({path:'/tmp/nayad-landing-fit.png'});
  }
  // Hidden landing must release page scrolling for login and normal desktop layout.
  await page.locator('#landing').evaluate(el=>el.classList.add('hide'));
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');
  await page.locator('#landing').evaluate(el=>{el.classList.remove('hide');el.style.padding='';});
  await page.setViewportSize({width:1280,height:900});
  assert.equal(await page.locator('#landing').evaluate(el=>getComputedStyle(el).position),'relative');
  assert.equal(await page.locator('.landingDeviceArt').evaluate(el=>getComputedStyle(el).display),'contents');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
