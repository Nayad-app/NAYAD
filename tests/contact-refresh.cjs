const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const dom=new JSDOM('<div id="app"><div id="content"></div></div>',{url:'https://nayad.store/hariltsagch',runScripts:'outside-only'}),w=dom.window;
w.eval(`var page='companies',selected=null;var data={companies:[{id:1,name:'Туршилт',invoices:[],debt:0}],payments:[]};window.sync=()=>{};window.tel=()=>'';window.money=n=>n+' ₮';window.__nayadUser={id:'user-a'};window.__nayadActiveStoreId='store-a';`);
w.eval(fs.readFileSync('contact-types.js','utf8'));w.eval(fs.readFileSync('render.js','utf8'));
const html=fs.readFileSync('index.html','utf8');w.eval(html.match(/window\.__nayadApplyData=function\(next,renderNow=true\)\{[\s\S]*?\n\};/)[0]);
w.eval("page='home'");w.company(1);w.toggleContactQuickActions();w.document.querySelector('.contactDetails').open=true;w.document.getElementById('content').scrollTop=120;
w.__nayadApplyData({companies:[{id:1,name:'Шинэ нэр',debt:500,invoices:[]}],payments:[]});
assert.equal(w.document.getElementById('contactQuickMenu').hidden,false,'supplier actions stay open during refresh from home');assert.equal(w.document.querySelector('.contactQuickToggle').getAttribute('aria-expanded'),'true');
assert(w.document.querySelector('.contactDetails')?.open,'details stay expanded');assert(w.document.getElementById('content').textContent.includes('Шинэ нэр'));assert.equal(w.document.getElementById('content').scrollTop,120);assert(!w.document.querySelector('#contactUnifiedList'));
w.eval("page='companies'");w.render();assert(w.document.querySelector('#contactUnifiedList'),'explicit back/list render still works');
w.__nayadApplyData({companies:[{id:1,name:'Өөр нэр',invoices:[]}],payments:[]});assert(w.document.querySelector('#contactUnifiedList'),'background refresh must not reopen old details');
w.company(1);w.__nayadActiveStoreId='store-b';w.__nayadApplyData({companies:[{id:1,name:'Өөр дэлгүүр',invoices:[]}],payments:[]});assert(!w.document.querySelector('.contactDetails'),'store changes must not retain previous detail');
w.__nayadActiveStoreId='store-a';w.company(1);w.__nayadApplyData({companies:[],payments:[]});assert(!w.document.querySelector('.contactDetails'),'removed contacts return to list');
// Return navigation must preserve the actual source through background refreshes.
w.eval("data.companies=[{id:1,name:'Туршилт',invoices:[],debt:0}];page='home';window.home=()=>'<div id=homeOrigin>Нүүр</div>';");
w.render();w.document.getElementById('content').scrollTop=275;w.document.getElementById('app').scrollTop=90;
w.company(1);w.document.getElementById('content').scrollTop=0;w.__nayadRefreshContactView();
assert.equal(w.document.querySelector('.back').getAttribute('onclick'),'backFromContact()');
w.backFromContact();assert.equal(w.eval('page'),'home');assert(w.document.getElementById('homeOrigin'));
assert.equal(w.document.getElementById('content').scrollTop,275);assert.equal(w.document.getElementById('app').scrollTop,90);
w.eval("page='companies'");w.render();w.filter('Турш');w.document.getElementById('content').scrollTop=160;
w.company(1);w.__nayadRefreshContactView();w.backFromContact();assert.equal(w.eval('page'),'companies');
assert.equal(w.document.querySelector('.contactSearch input').value,'Турш');assert.equal(w.document.getElementById('content').scrollTop,160);
// Explicit tab changes establish a new origin, rather than restoring the old one.
w.company(1);w.eval("page='home'");w.render();w.company(1);w.backFromContact();assert.equal(w.eval('page'),'home');
w.company(1);w.__nayadActiveStoreId='store-other';w.backFromContact();assert.equal(w.eval('page'),'home');
w.close();console.log('PASS: background contact refresh, latest data, expanded details, scroll, explicit navigation and store isolation');
