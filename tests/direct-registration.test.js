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
assert.match(registerBlock,/sb\.auth\.signInWithPassword\(\{email,password\}\)/,'successful account creation must sign in with the new password');
assert.match(registerBlock,/await showAuthenticatedApp\(\)/,'registration must prepare the new user store before opening the app');
assert.doesNotMatch(registerBlock,/requestPhoneOtp|verifyOtp|request-phone-otp/,'registration must not require SMS OTP');
assert.doesNotMatch(registerBlock,/sb\.auth\.signUp/);
assert.doesNotMatch(registerBlock,/store_name|business_type/,'the first account form must not force a direction or activity');

assert.match(edge,/admin\.auth\.admin\.createUser/);
assert.match(edge,/email_confirm:\s*true/);
assert.match(edge,/login_phone:\s*phone/);
assert.doesNotMatch(edge,/admin\.auth\.admin\.listUsers/);
assert.match(edge,/from\("phone_login_accounts"\)/);
assert.match(edge,/consume_auth_rate_limit/);
assert.match(edge,/REGISTRATION_UNAVAILABLE/);
assert.doesNotMatch(edge,/code:\s*"PHONE_EXISTS"|code:\s*"EMAIL_EXISTS"/);
assert.match(edge,/hasLegacyStoreFields/,'the endpoint must keep cached previous clients compatible during rollout');
assert.match(edge,/if \(hasLegacyStoreFields\)[\s\S]*userMetadata\.store_name/,'legacy metadata must be added only when the old client explicitly sends it');
assert.match(config,/\[functions\.register-user\][\s\S]*verify_jwt = false/);

for(const id of ['regName','regPhone','regEmail','regPassword','regPassword2'])assert.match(html,new RegExp('id="'+id+'"'));
for(const id of ['regStoreName','regBusinessType'])assert.doesNotMatch(html,new RegExp('id="'+id+'"'));

console.log('direct-registration: PASS — account registration signs in securely without SMS OTP');
