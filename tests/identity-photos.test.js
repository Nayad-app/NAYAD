const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','identity-photos.js'),'utf8');
const USER='11111111-1111-4111-8111-111111111111',STORE='22222222-2222-4222-8222-222222222222',FILE='33333333-3333-4333-8333-333333333333';
function fixture(options={}){
 const calls={uploads:[],removed:[],auth:[],stores:[],signed:[],toasts:[],revoked:[]},elements=new Map();
 for(const kind of ['profile','store']){elements.set(kind+'PhotoEditor',{innerHTML:''});elements.set(kind+'PhotoInput',{addEventListener(){},click(){}});}
 const storage={async createSignedUrl(path){calls.signed.push(path);return options.signFail?{error:Error('offline')}:{data:{signedUrl:'https://photos.test/'+path}};},async upload(path,bytes,opts){calls.uploads.push({path,bytes,opts});await options.onUpload?.();return options.uploadFail?{error:Error('upload failed')}:{data:{path}};},async remove(paths){calls.removed.push(...paths);return {};}};
 const window={__nayadUser:{id:USER,user_metadata:options.metadata||{}},__nayadActiveStore:{id:STORE,role:options.role||'owner',photo_path:options.storePath||null},getCurrentUserProfile:()=>({avatar:options.legacy||''}),toast:text=>calls.toasts.push(text),addEventListener(){}};
 window.nayadSupabase={storage:{from:()=>storage},auth:{async updateUser({data}){calls.auth.push(data);await options.onAuth?.();return options.authFail?{error:Error('auth failed')}:{data:{user:{id:USER,user_metadata:{...window.__nayadUser.user_metadata,...data}}}};}},from(){return {update(data){calls.stores.push(data);return {eq(){return {select(){return {async single(){await options.onStore?.();return options.storeFail?{error:Error('store failed')}:{data:{id:STORE,...data}};}};}};}};},select(){return {async in(){return {data:[{id:STORE,photo_path:options.storePath||null}]};}};}};}};
 window.profileFromUser=user=>window.__nayadUser=user;
 let object=0;
 const context={window,document:{head:{insertAdjacentHTML(){}},getElementById:id=>elements.get(id),createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:fn=>fn(new Blob(['image'],{type:'image/png'}))})},console:{warn(){},error(){}},crypto:{randomUUID:()=>FILE},URL:{createObjectURL:()=>`blob:test/${++object}`,revokeObjectURL:value=>calls.revoked.push(value)},Image:class{naturalWidth=1000;naturalHeight=800;set src(value){queueMicrotask(()=>this.onload());}},Date,Map,Blob};
 vm.runInNewContext(source,context);return {window,context,api:window.__nayadPhotos,calls,elements};
}
const image=()=>new Blob(['photo'],{type:'image/png'});
test('empty avatars have matching icons/camera; selection/removal and cancel never write',async()=>{
 const f=fixture();await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);
 assert.match(f.elements.get('profilePhotoEditor').innerHTML,/identityPhotoCamera/);assert.match(f.elements.get('storePhotoEditor').innerHTML,/identityPhotoCamera/);
 await f.api.select('profile',image());assert.match(f.elements.get('profilePhotoEditor').innerHTML,/identityPhotoRemove/);assert.doesNotMatch(f.elements.get('profilePhotoEditor').innerHTML,/identityPhotoCamera/);
 f.api.remove('profile');assert.match(f.elements.get('profilePhotoEditor').innerHTML,/identityPhotoCamera/);f.api.dispose();assert.equal(f.calls.uploads.length,0);assert.equal(f.calls.auth.length,0);assert.equal(f.calls.removed.length,0);
});
test('profile replacement uploads fresh private path; clears old only after auth success',async()=>{
 const old=`profiles/${USER}/44444444-4444-4444-8444-444444444444.png`,f=fixture({metadata:{avatar_path:old}});await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);await f.api.select('profile',image());await f.api.saveProfile({full_name:'Test'});
 assert.equal(f.calls.uploads[0].path,`profiles/${USER}/${FILE}.png`);assert.equal(f.calls.uploads[0].opts.upsert,false);assert.equal(f.calls.auth[0].avatar_custom,true);assert.equal(f.calls.auth[0].avatar_path,f.calls.uploads[0].path);assert.deepEqual(f.calls.removed,[old]);
});
test('auth failure rolls back new upload and preserves previous image; retry succeeds',async()=>{
 const config={metadata:{avatar_path:`profiles/${USER}/44444444-4444-4444-8444-444444444444.png`},authFail:true},f=fixture(config);await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);await f.api.select('profile',image());await assert.rejects(f.api.saveProfile({}),/auth failed/);assert.deepEqual(f.calls.removed,[`profiles/${USER}/${FILE}.png`]);config.authFail=false;await f.api.saveProfile({});assert.equal(f.calls.auth.length,2);
});
test('removal persists explicit empty custom avatar and suppresses legacy provider photo',async()=>{
 const f=fixture({legacy:'https://provider.test/avatar'});await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);f.api.remove('profile');await f.api.saveProfile({});assert.equal(f.calls.auth[0].avatar_path,null);assert.equal(f.api.profileUrl(f.window.__nayadUser,'https://provider.test/avatar'),'');assert.equal(f.calls.uploads.length,0);
});
test('member has no store editor and cannot save store picture',async()=>{
 const f=fixture({role:'member'});await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);assert.equal(f.elements.get('storePhotoEditor').innerHTML,'');await assert.rejects(f.api.saveStore(f.window.__nayadActiveStore,{}),/эзэмшигч/);assert.equal(f.calls.stores.length,0);
});
test('store save failure rolls back upload without deleting original',async()=>{
 const old=`stores/${STORE}/44444444-4444-4444-8444-444444444444.png`,f=fixture({storePath:old,storeFail:true});await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);await f.api.select('store',image());await assert.rejects(f.api.saveStore(f.window.__nayadActiveStore,{name:'Test'}),/store failed/);assert.deepEqual(f.calls.removed,[`stores/${STORE}/${FILE}.png`]);
});
test('changing active store/account invalidates draft instead of saving it to another identity',async()=>{
 const f=fixture();await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);f.window.__nayadActiveStore={id:'other',role:'owner'};await assert.rejects(f.api.saveProfile({}),/Бүртгэл өөрчлөгдсөн/);assert.equal(f.calls.auth.length,0);
 const g=fixture();await g.api.mount(g.window.__nayadUser,g.window.__nayadActiveStore);g.window.__nayadUser={id:'other'};assert.equal(g.api.profileUrl(g.window.__nayadUser,'https://legacy.test'),'https://legacy.test');await assert.rejects(g.api.saveProfile({}),/Бүртгэл өөрчлөгдсөн/);
});
test('successful server commit is never deleted when identity changes during response',async()=>{
 const config={},f=fixture(config);config.onAuth=()=>{f.window.__nayadUser={id:'other'};};await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);await f.api.select('profile',image());await assert.rejects(f.api.saveProfile({}),/бүртгэл өөрчлөгдлөө/);assert.equal(f.calls.removed.length,0);
});
test('failed signed URL resolution does not recurse; malformed foreign path is ignored',async()=>{
 const f=fixture({metadata:{avatar_path:`profiles/${USER}/${FILE}.png`},signFail:true});let refreshes=0;f.window.updateProfileUI=()=>{refreshes++;f.api.refresh();};await f.api.refresh();assert.equal(refreshes,0);assert.equal(f.calls.signed.length,1);
 const g=fixture({metadata:{avatar_path:`profiles/other/${FILE}.png`}});await g.api.refresh();assert.equal(g.calls.signed.length,0);
});
test('unsupported images are rejected without upload',async()=>{const f=fixture();await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);await f.api.select('profile',new Blob(['x'],{type:'image/svg+xml'}));assert.match(f.calls.toasts[0],/JPG/);assert.equal(f.calls.uploads.length,0);});

function settings(f){
 const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');const code=html.split('async function saveProfileDetails(){')[1].split('\n</script>')[0];
 Object.assign(f.context,{sb:f.window.nayadSupabase,v:id=>({profileFullName:'Test',profilePhone:'99001122',profileStoreName:'Test store',profileBusinessType:'Хүнсний дэлгүүр, супермаркет'})[id]||'',normalizeMongolianPhone:value=>'+976'+value,toast:f.window.toast,setAuthBusy(){},profileFromUser:f.window.profileFromUser,closeSheet:()=>f.api.dispose(),render(){}});
 vm.runInNewContext('async function saveProfileDetails(){'+code,f.context);return f.context.saveProfileDetails;
}
test('settings Save persists both photos and releases critical operation; duplicate click cannot write twice',async()=>{
 const f=fixture();await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);await f.api.select('profile',image());await f.api.select('store',image());const save=settings(f);await Promise.all([save(),save()]);assert.equal(f.calls.uploads.length,2);assert.equal(f.calls.auth.length,1);assert.equal(f.calls.stores.length,1);assert.equal(f.calls.stores[0].photo_path,`stores/${STORE}/${FILE}.png`);assert.equal(f.window.__nayadPhotoSaving,false);assert.equal(f.window.__nayadCriticalOperation,undefined);assert.match(f.calls.toasts[0],/хадгалагдлаа/);
});
test('partial store failure reports saved profile accurately and retry does not reupload profile',async()=>{
 const config={storeFail:true},f=fixture(config);await f.api.mount(f.window.__nayadUser,f.window.__nayadActiveStore);await f.api.select('profile',image());await f.api.select('store',image());const save=settings(f);await save();assert.match(f.calls.toasts[0],/Профайл хадгалагдсан.*Дэлгүүрийн/);assert.equal(f.window.__nayadPhotoSaving,false);config.storeFail=false;await save();assert.equal(f.calls.uploads.length,3);assert.equal(f.calls.auth.length,2);
});
