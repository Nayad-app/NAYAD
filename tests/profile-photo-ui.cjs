const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
const d=new JSDOM('<div id="sheet"></div>',{url:'https://nayad.store',runScripts:'outside-only'}),w=d.window;
let uploads=[],deleted=[],failure=false,signs=0,decode=true;
w.__nayadUser={id:'user',user_metadata:{}};w.toast=()=>{};
w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
w.Image=class{constructor(){this.naturalWidth=800;this.naturalHeight=600;}set src(v){queueMicrotask(()=>decode?this.onload():this.onerror());}};
w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});w.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new w.Blob(['jpeg'],{type:'image/jpeg'}));};
const bucket={upload:async(path,blob,opts)=>{uploads.push({path,blob,opts});return {error:failure?new Error('Upload failed'):null};},createSignedUrl:async(path)=>{signs++;return {data:{signedUrl:'https://example.com/'+path}};},remove:async(paths)=>{deleted.push(...paths);return {};}};
w.nayadSupabase={storage:{from:()=>bucket},auth:{getUser:async()=>({data:{user:w.__nayadUser}}),updateUser:async({data})=>({data:{user:{...w.__nayadUser,user_metadata:{...w.__nayadUser.user_metadata,...data}}}})}};
w.getCurrentUserProfile=()=>({name:'Test',avatar:w.NayadProfilePhoto?.url(w.__nayadUser)||''});w.updateProfileUI=()=>w.NayadProfilePhoto.url(w.__nayadUser);
w.eval(fs.readFileSync('profile-menu.js','utf8'));const api=w.NayadProfilePhoto;
w.document.getElementById('sheet').innerHTML=api.fields();let connected=false,clicked=0;
w.HTMLInputElement.prototype.click=function(){connected=this.isConnected;clicked++;};api.choose();api.choose();assert(connected);assert.equal(clicked,2);assert.equal(w.document.querySelectorAll('#nayadProfilePhotoInput').length,1);
const file=new w.File(['photo'],'camera.jpg',{type:'image/jpeg'});await api.save(file);await new Promise(r=>setTimeout(r,0));assert.equal(uploads.length,1);assert.equal(uploads[0].opts.upsert,false);assert.equal(uploads[0].blob.type,'image/jpeg');assert.match(w.document.getElementById('profilePhotoPreview').innerHTML,/example.com/);const first=w.__nayadUser.user_metadata.avatar_path;
await api.save(new w.File(['new'],'camera.png',{type:'image/png'}));await new Promise(r=>setTimeout(r,0));assert.notEqual(w.__nayadUser.user_metadata.avatar_path,first);assert(deleted.includes(first));assert(signs>=2);
// Empty MIME from mobile file provider is accepted by image filename and decoded.
await api.save(new w.File(['new'],'IMG_1234.JPG',{type:''}));assert.equal(uploads.length,3);
const previous=w.__nayadUser.user_metadata.avatar_path;failure=true;await api.save(file);assert.equal(w.__nayadUser.user_metadata.avatar_path,previous);assert.match(w.document.getElementById('profilePhotoStatus').textContent,/Upload failed/);assert.equal(w.document.getElementById('profilePhotoChoose').disabled,false);failure=false;
decode=false;const n=uploads.length;await api.save(file);assert.equal(uploads.length,n);assert.match(w.document.getElementById('profilePhotoStatus').textContent,/JPG/);decode=true;
await api.save(new w.File(['x'],'bad.svg',{type:'image/svg+xml'}));assert.equal(uploads.length,n);
// No client yet must not permanently mark a signing request as pending.
const client=w.nayadSupabase;w.nayadSupabase=null;w.__nayadUser.user_metadata.avatar_path='user/late.jpg';api.url(w.__nayadUser);w.nayadSupabase=client;api.url(w.__nayadUser);await new Promise(r=>setTimeout(r,0));assert.match(api.url(w.__nayadUser),/late.jpg/);
w.close();console.log('profile-photo: PASS — connected reusable picker, first upload, replacement, JPEG normalization, empty MIME, signing retry, visible failure, old photo preserved');
})().catch(e=>{console.error(e);process.exit(1)});
