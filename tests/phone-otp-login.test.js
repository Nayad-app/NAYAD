const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const login=html.slice(html.indexOf('async function phoneLogin(){'),html.indexOf('async function registerUser(){'));

assert.doesNotMatch(html,/id="otpOverlay"|class="otpDigit"|auth\.verifyOtp\(|\/functions\/v1\/request-phone-otp/,'the active frontend must not contain the SMS OTP flow');
assert.match(html,/id="loginPasswordField" class="field"/,'the password field must be visible for phone login');
assert.match(html,/id="loginBtn"[\s\S]*?>НЭВТРЭХ</,'the login action must remain password-based');
assert.match(login,/\/functions\/v1\/phone-login/,'phone login must resolve the private Auth email through the hardened endpoint');
assert.match(login,/JSON\.stringify\(\{phone,password\}\)/);
assert.match(login,/typeof result\.email!=="string"[\s\S]*typeof result\.user_id!=="string"/,'the resolver response must contain both identity fields');
assert.match(login,/sb\.auth\.signInWithPassword\(\{email:result\.email,password\}\)/,'the browser must create its own Supabase session');
assert.match(login,/String\(login\.data\?\.user\?\.id\|\|""\)!==String\(result\.user_id\)/,'the signed-in user must match the resolved phone account');
assert.doesNotMatch(login,/result\.access_token|result\.refresh_token|setSession|requestPhoneOtp|verifyOtp/,'raw tokens and OTP must not be used');

console.log('phone-otp-login: PASS — OTP is cancelled and secure phone plus password login is restored');
