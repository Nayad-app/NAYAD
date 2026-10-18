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
 const picker=setup('https://nayad.store/?__nayad_route=/delguur_solih'),pw=picker.window;
 pw.showNayadStorePicker=()=>{pw.document.getElementById('modal').classList.remove('hide');pw.document.getElementById('modal').classList.add('storePickerModal');pw.__nayadRouter.openStorePicker();};
 pw.closeSheet=()=>{pw.__nayadRouter.closeStorePicker();pw.document.getElementById('modal').classList.remove('storePickerModal');pw.document.getElementById('modal').classList.add('hide');};
 pw.__nayadRouter.restoreStorePicker();assert.equal(pw.location.pathname,'/delguur_solih');assert(pw.document.getElementById('modal').classList.contains('storePickerModal'));
 pw.closeSheet();assert.equal(pw.location.pathname,'/nuur');
 pw.showNayadStorePicker();pw.render();assert.equal(pw.location.pathname,'/delguur_solih');
 pw.history.back();await tick();assert.equal(pw.location.pathname,'/nuur');assert(pw.document.getElementById('modal').classList.contains('hide'));
 pw.history.forward();await tick();assert.equal(pw.location.pathname,'/delguur_solih');assert(pw.document.getElementById('modal').classList.contains('storePickerModal'));picker.window.close();
 assert.ok(fs.readFileSync('delguur_solih/index.html','utf8').includes('/delguur_solih'));
 for(const [kind,slug] of Object.entries({picker:'hariltsagch_nemeh',person:'huvi_hun_burtgeh',organization:'baiguullaga_burtgeh'})){
  const c=setup('https://nayad.store/?__nayad_route=/'+slug),cw=c.window;let opened='';
  cw.showContactTypePicker=()=>{opened='picker';cw.document.getElementById('modal').classList.add('contactRegistrationModal');};
  cw.showContactForm=k=>{opened=k;cw.document.getElementById('modal').classList.add('contactRegistrationModal');};
  cw.__nayadRouter.restoreContact();assert.equal(opened,kind);assert.equal(cw.location.pathname,'/'+slug);assert.equal(cw.eval('page'),'companies');
  opened='';cw.__nayadRouter.restoreContact();assert.equal(opened,'','background render must preserve form');
  cw.__nayadRouter.closeContact();assert.equal(cw.location.pathname,'/hariltsagch');
  assert.ok(fs.readFileSync(slug+'/index.html','utf8').includes('/'+slug));await tick();cw.close();
 }
 const inv=setup('https://nayad.store/?__nayad_route=/padaan/test-invoice'),iw=inv.window;
 iw.showInvoiceDetails=async id=>{iw.opened=id;iw.document.getElementById('modal').classList.remove('hide');iw.document.getElementById('modal').classList.add('invoiceDetailModal');iw.__nayadRouter.openInvoice(id);};
 iw.closeSheet=()=>{iw.__nayadRouter.closeInvoice();iw.document.getElementById('modal').classList.remove('invoiceDetailModal');iw.document.getElementById('modal').classList.add('hide');};
 await tick();await iw.__nayadRouter.restoreInvoice();assert.equal(iw.opened,'test-invoice');assert.equal(iw.location.pathname,'/padaan/test-invoice');
 iw.closeSheet();assert.equal(iw.location.pathname,'/nuur');await iw.showInvoiceDetails('another');iw.history.back();await tick();assert.equal(iw.location.pathname,'/nuur');assert(iw.document.getElementById('modal').classList.contains('hide'));iw.history.forward();await tick();assert.equal(iw.opened,'another');
 iw.document.getElementById('modal').classList.remove('invoiceDetailModal');iw.document.getElementById('modal').innerHTML='<input value="draft">';iw.opened='';iw.render();await tick();assert.equal(iw.opened,'','refresh preserves invoice edit draft');iw.close();
 w.close();console.log('PASS: deep links, refresh, history, query preservation and open-dialog navigation guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
