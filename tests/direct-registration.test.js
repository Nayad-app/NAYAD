const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/register-user/index.ts'),'utf8');
const config=fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8');

const registerStart=html.indexOf('async function registerUser(){');
const registerEnd=html.indexOf('async function googleLogin()',registerStart);
assert.ok(registerStart>=0&&registerEnd>registerStart,'registerUser must exist');
const registerBlock=html.slice(registerStart,registerEnd);

assert.match(registerBlock,/\/functions\/v1\/register-user/);
assert.match(registerBlock,/JSON\.stringify\(\{name,phone,email,password\}\)/,'account creation must send only person-level registration fields');
assert.match(registerBlock,/sb\.auth\.signInWithPassword\(\{email,password\}\)/);
assert.match(registerBlock,/await showAuthenticatedApp\(\)/,'successful account creation must continue into registration onboarding');
assert.doesNotMatch(registerBlock,/sb\.auth\.signUp/);
assert.doesNotMatch(registerBlock,/store_name|business_type/,'the first account form must not force a direction or activity');

assert.match(edge,/admin\.auth\.admin\.createUser/);
assert.match(edge,/email_confirm:\s*true/);
assert.match(edge,/login_phone:\s*phone/);
assert.match(edge,/PHONE_EXISTS/);
assert.match(edge,/EMAIL_EXISTS/);
assert.match(edge,/hasLegacyStoreFields/,'the endpoint must keep cached previous clients compatible during rollout');
assert.match(edge,/if \(hasLegacyStoreFields\)[\s\S]*userMetadata\.store_name/,'legacy metadata must be added only when the old client explicitly sends it');
assert.match(config,/\[functions\.register-user\][\s\S]*verify_jwt = false/);

for(const id of ['regName','regPhone','regEmail','regPassword','regPassword2'])assert.match(html,new RegExp('id="'+id+'"'));
for(const id of ['regStoreName','regBusinessType'])assert.doesNotMatch(html,new RegExp('id="'+id+'"'));

console.log('direct-registration: PASS — account registration is separate from the approved supplier/buyer onboarding');
