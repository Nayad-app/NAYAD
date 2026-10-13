const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const source=fs.readFileSync('section-router.js','utf8');
 function setup(url){
  const dom=new JSDOM('<div id="app"><main id="content"></main><button class="nav" data-page="loans">Зээл</button></div><div id="modal" class="hide"><section role="dialog"></section></div>',{url,runScripts:'outside-only'}),w=dom.window;
  w.eval('let page="home",selected=null;');w.eval(source);w.eval('page=window.__nayadRouter.initialPage();window.render=()=>window.__nayadRouter.sync(page);');w.render();return dom;
 }
 const d=setup('https://nayad.store/?__nayad_route=/zeel&keep=1#anchor'),w=d.window;
 assert.equal(w.location.pathname,'/zeel');assert.equal(w.location.search,'?keep=1');assert.equal(w.location.hash,'#anchor');assert.equal(w.eval('page'),'loans');
 assert.equal(w.__nayadHasOpenDialog(),false,'hidden ancestor is not an open dialog');
 w.eval('page="companies"');w.render();assert.equal(w.location.pathname,'/hariltsagch');
 const length=w.history.length;w.render();assert.equal(w.history.length,length,'background render adds no history');
 const tick=()=>new Promise(r=>setTimeout(r,40));w.history.back();await tick();assert.equal(w.eval('page'),'loans');w.history.forward();await tick();assert.equal(w.eval('page'),'companies');
 const overlay=w.document.createElement('div');overlay.className='loanContractOverlay';overlay.innerHTML='<input value="draft">';w.document.body.appendChild(overlay);
 let clicks=0;w.document.querySelector('.nav').onclick=()=>clicks++;w.document.querySelector('.nav').click();assert.equal(clicks,0);
 w.history.back();await tick();await tick();assert.equal(w.location.pathname,'/hariltsagch');assert.equal(overlay.querySelector('input').value,'draft');assert.equal(w.eval('page'),'companies');overlay.remove();
 w.__nayadCriticalOperation=true;assert.equal(w.__nayadHasOpenDialog(),true);w.__nayadCriticalOperation=false;
 for(const [slug,page] of Object.entries({nuur:'home',hariltsagch:'companies',tulbur:'payments',zeel:'loans'})){
  const direct=setup('https://nayad.store/'+slug+'/');assert.equal(direct.window.eval('page'),page);assert.equal(direct.window.location.pathname,'/'+slug);direct.window.close();
  assert.ok(fs.readFileSync(slug+'/index.html','utf8').includes('"/'+slug+'"'),'Pages deep link exists');
 }
 const auth=setup('https://nayad.store/?code=auth-code#access_token=test');assert.equal(auth.window.location.search,'?code=auth-code');assert.equal(auth.window.location.hash,'#access_token=test');auth.window.close();
 w.close();console.log('PASS: deep links, refresh, history, query preservation and open-dialog navigation guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
