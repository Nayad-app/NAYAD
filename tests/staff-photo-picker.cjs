const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const dom=new JSDOM('<div id="staffRoot"></div>',{url:'https://nayad.store/?tsag=token',runScripts:'outside-only'}),w=dom.window;
 let picker,gesture=false,saveFailure=false,uploadFailure=false,saves=0,uploads=0;
 let form={name:'Test',phone:'12345678',address:'Original'};
 const data=()=>({form:{...form},missing:[],media:[],admin:false,updated_at:null});
 w.toast=()=>{};w.alert=m=>{throw Error(m)};
 w.HTMLInputElement.prototype.click=function(){assert(gesture,'native picker must open synchronously in user gesture');assert(this.isConnected);picker=this;};
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.Image=class{constructor(){this.width=100;this.height=100;}set src(v){queueMicrotask(()=>this.onload());}};
 w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});
 w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,eA==';
 w.nayadSupabase={rpc:async(name,a)=>{
  if(name==='staff_bank_details')return {data:{}};
  if(a.p_action==='save'){saves++;if(saveFailure)return {error:{message:'Save failed'}};form={...a.p_data.form};}
  if(a.p_action==='upload'){uploads++;if(uploadFailure)return {error:{message:'Upload failed'}};return {data:{id:'photo'}};}
  return {data:data()};
 }};
 for(const f of ['staff-hub.js','staff-self-service.js'])w.eval(fs.readFileSync(f,'utf8'));
 await w.NayadSelf.profile();
 function open(camera=false){gesture=true;w.NayadSelf.pick('avatar',camera);gesture=false;assert(picker);}
 async function select(){Object.defineProperty(picker,'files',{value:[{size:10}]});await picker.onchange();}
 w.document.getElementById('self_address').value='Unsaved address';
 open();assert.equal(saves,0);picker.oncancel();assert(!picker.isConnected);assert.equal(w.document.getElementById('self_address').value,'Unsaved address');
 open(true);assert.equal(picker.capture,'user');await select();assert.equal(saves,1);assert.equal(uploads,1);assert.equal(form.address,'Unsaved address');assert.equal(w.document.getElementById('self_address').value,'Unsaved address');
 saveFailure=true;w.document.getElementById('self_address').value='Keep draft';open();await select();assert.equal(uploads,1);assert.match(w.document.getElementById('selfError').textContent,/Save failed/);assert.equal(w.document.getElementById('self_address').value,'Keep draft');assert(!w.document.querySelector('.hubPhotoActions button').disabled);
 saveFailure=false;uploadFailure=true;open();await select();assert.match(w.document.getElementById('selfError').textContent,/Upload failed/);assert.equal(w.document.getElementById('self_address').value,'Keep draft');assert(!w.document.querySelector('.hubPhotoActions button').disabled);
 open();const before=uploads;w.NayadHub.stop();await select();assert.equal(uploads,before);
 dom.window.close();console.log('staff-photo-picker: PASS synchronous connected picker, camera, cancel, draft preservation, save/upload failures, navigation isolation');
})().catch(e=>{console.error(e);process.exit(1)});
