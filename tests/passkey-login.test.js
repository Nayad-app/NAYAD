const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const login=source.match(/async function phoneLogin\(\)\{[\s\S]*?\n\}\nasync function registerUser/)?.[0]||'';

assert.match(source,/@supabase\/supabase-js@2\.105\.0\/dist\/umd\/supabase\.js/,'the passkey-capable Supabase client must be pinned');
assert.match(source,/experimental:\{passkey:true\}/,'the experimental passkey API must be explicitly enabled');
assert.match(source,/id="faceIdLogin" type="checkbox"/,'the approved Face ID checkbox must be present');
assert.match(source,/Цаашид Face ID-аар нэвтрэх/,'the approved checkbox label must remain exact');
assert.doesNotMatch(source,/FACE ID-ААР НЭВТРЭХ/,'a second Face ID login button must not be added');
assert.match(source,/async function registerRequestedFaceId\(\)[\s\S]*sb\.auth\.registerPasskey\(\)/,'password login must be able to enroll the passkey');
assert.match(login,/faceChoice&&faceIdEnabled\(\)/,'only a previously enrolled checked device may skip password entry');
assert.match(login,/sb\.auth\.signInWithPasskey\(\)/,'the existing yellow login button must invoke Face ID for enrolled devices');
assert.match(login,/if\(!usingFaceId\)[\s\S]*!username\|\|!password/,'first enrollment must still require the existing password login');
assert.match(login,/if\(faceChoice\)enrollment=await registerRequestedFaceId\(\)/,'Face ID enrollment must happen only after password authentication succeeds');
assert.match(source,/showAuthMode\("login"\);syncFaceIdChoice\(\)/,'the checkbox must restore the local Face ID preference on logout');
assert.doesNotMatch(source,/service_role|secret[_-]?key/i,'the browser must not contain privileged Supabase credentials');

console.log('passkey-login: PASS — the approved checkbox enrolls once and reuses the yellow login button');
