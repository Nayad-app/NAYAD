const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
const dom=new JSDOM('<div id="modal"><div id="sheet"></div></div>',{url:'https://nayad.store',runScripts:'outside-only'}),w=dom.window;let writes=[],message='';
w.__nayadActiveStoreId='store';w.__nayadUser={id:'user'};w.matchMedia=()=>({matches:true});w.sheet=html=>w.document.getElementById('sheet').innerHTML=html;w.closeSheet=()=>{};w.toast=t=>message=t;
w.nayadSupabase={rpc:async()=>({data:'abc'}),from:table=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null}),upsert:async p=>{writes.push({table,p});return {};}})};
w.eval(fs.readFileSync(require('path').join(__dirname,'../notification-settings.js'),'utf8'));
await w.NayadPush.open();assert.equal(w.document.querySelectorAll('.pushToggle').length,6);assert.ok(w.document.querySelector('[hidden]'));
w.NayadPush.toggle('enabled',true);assert.equal(w.document.querySelector('[hidden]'),null);
assert.equal(w.document.querySelectorAll('.pushWheel button').length,144);
w.NayadPush.advance(3);assert.equal(w.document.querySelectorAll('.pushChoices button[aria-pressed=true]').length,3);
w.NayadPush.toggle('enabled',false);await w.NayadPush.save();assert.equal(writes.length,1);assert.equal(writes[0].p.enabled,false);assert.equal(writes[0].p.user_id,'user');
await w.NayadPush.open();w.__nayadActiveStoreId='other';await w.NayadPush.save();assert.equal(writes.length,1);assert.match(message,/өөрчлөгдсөн/);
assert.ok(w.document.getElementById('sheet').classList.contains('pushSettingsSheet'));w.closeSheet();assert.ok(!w.document.getElementById('sheet').classList.contains('pushSettingsSheet'));
dom.window.close();console.log('PASS: settings expansion, four types, multi-select, 24/60/60 picker, disable save, store-change guard, modal cleanup');
})();
