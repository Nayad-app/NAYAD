const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.NAYAD_BROWSER_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 const index=fs.readFileSync('index.html','utf8');let css=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 css+='\n'+fs.readFileSync('night-mode.css','utf8');
 // Modules inject styles after the main stylesheet; exercise that ordering as well.
 for(const f of fs.readdirSync('.').filter(f=>f.endsWith('.js')&&f!=='sw.js')){
  const src=fs.readFileSync(f,'utf8');
  for(const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))if(!m[1].includes('${'))css+='\n'+m[1];
  for(const m of src.matchAll(/\.textContent\s*=\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')/g)){
   try{const val=vm.runInNewContext(m[1]);if(typeof val==='string'&&val.includes('{'))css+='\n'+val;}catch{}
  }
 }
 const samples=[
 ['Хуулга','<div class="statement"><div class="row"><button class="primary">Бүгд</button><button class="secondary">Төлбөр</button><button class="secondary">Падаан</button><button class="secondary">☷</button></div><div class="statementTotal statementTotal-payment"><b>467,639,204 ₮</b></div><div class="statementTotal statementTotal-invoice"><b>536,237,564 ₮</b></div></div>'],
 ['Шүүлтүүр','<div class="field"><label>Хайх</label><input value="Нийлүүлэгч"></div><div class="field"><input type="date" value="2026-11-15"></div><button class="primary">Хэрэглэх</button>'],
 ['Ажилтан, цалин','<div class="staffShell"><div class="staffTabs"><button class="active">Ажилтан</button><button>Цаг</button><button>Цалин</button><button>Чат</button></div><div class="staffCard">Ажилтан</div><div class="selfNotice">Мэдээллээ гүйцээнэ үү</div><div class="salaryPaid">Олгосон цалин<small>Өмнөх хугацаа</small></div><button class="staffSave">Хадгалах</button></div>'],
 ['Чат','<div class="hubMessage">Сайн байна уу?<small>09:00</small></div><div class="hubMessage mine">Сайн, ажилдаа ирлээ.<small>09:01</small></div>'],
 ['Дэлгүүр','<button class="storePickerItem active">Жишээ дэлгүүр</button><button class="storePickerItem">Өөр дэлгүүр</button><div class="shareMembers">Гишүүд <span class="shareRole">Менежер</span></div><div class="sharePermissionRow"><b>Эрх</b><select><option>Зөвхөн харах</option></select></div>'],
 ['Зээл, тайлан','<div class="loanSegment"><button class="active">Бүгд</button><button>Төлөх</button></div><div class="loanSummary">Зээлийн үлдэгдэл</div><div class="nrGreen">Орлого 100,000 ₮</div><div class="nrRed">Зарлага 50,000 ₮</div><div class="nrAmber">Нийт дүн</div>'],
 ['Мэдэгдэл, анкет','<div class="pushWheel"><button aria-selected="true">09:00</button></div><div class="appForm"><input value="Жишээ нэр"></div><div class="appNav"><button>Буцах</button><button class="next">Үргэлжлүүлэх</button></div>'],
 ['Plus, удирдлага','<button class="nayadSubscriptionPrimary">Plus авах</button><button class="nayadRegistrationPrimary">Үргэлжлүүлэх</button><div class="nayadSubscriptionBenefits">Plus багц</div><div class="nayadAdminCard">Удирдлага <span class="nayadAdminPill green">Идэвхтэй</span></div><button class="nayadAdminChip active">Бүгд</button>']
 ];
 const html=samples.map(([label,body])=>`<section class="fixture"><h2>${label}</h2>${body}</section>`).join('');
 await page.setContent(`<html class="nightMode"><head><style>${css}</style><style>.fixture{padding:18px;background:transparent;border:1px solid var(--line);border-radius:16px;min-width:0}.fixture h2{font-size:20px}.fixture .staffShell{padding:10px;min-height:0}.fixture input{max-width:100%}#fixtures{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;padding:16px}.fixture .pushWheel{height:42px;padding:0}.fixture button{margin:3px}.fixture .row{flex-wrap:wrap}</style></head><body><div id="fixtures">${html}</div></body></html>`);
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:1000});
  for(const bg of ['#1A1B1A','#19232D','#1B2820','#2A261C','#25202E','#2D2025']){
   await page.evaluate(bg=>document.body.style.background=bg,bg);
   const failures=await page.evaluate(()=>{
    const lum=c=>{const n=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return n[0]*.2126+n[1]*.7152+n[2]*.0722};
    return [...document.querySelectorAll('.fixture button,.fixture input,.fixture select,.fixture small,.fixture b,.selfNotice,.salaryPaid,.hubMessage,.nrGreen,.nrRed,.nrAmber,.shareRole,.nayadAdminPill,.nayadSubscriptionBenefits')].filter(e=>e.getBoundingClientRect().height).flatMap(e=>{let node=e,bg;while(node){bg=getComputedStyle(node).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;node=node.parentElement;}const fg=getComputedStyle(e).color,a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);return ratio<4.5?[{text:e.textContent.slice(0,40),class:e.className,fg,bg,ratio}]:[]});
   });assert.deepEqual(failures,[],JSON.stringify({width,bg,failures}));
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal viewport overflow');
  await page.screenshot({path:`/tmp/nayad-night-${width}.png`,fullPage:true});
 }
 await page.evaluate(()=>document.documentElement.classList.remove('nightMode'));
 assert.equal(await page.locator('.secondary').first().evaluate(e=>getComputedStyle(e).color),'rgb(23, 23, 23)');
 await browser.close();console.log('PASS: night controls contrast >=4.5 across 8 module fixtures, 3 widths, 6 canvases; light mode retained');
})().catch(e=>{console.error(e);process.exit(1)});
