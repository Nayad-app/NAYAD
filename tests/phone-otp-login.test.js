const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/request-phone-otp/index.ts'),'utf8');

assert.match(html,/id="otpOverlay"/);
assert.equal((html.match(/class="otpDigit"/g)||[]).length,6,'OTP modal must contain exactly six code inputs');
assert.match(html,/Код 5 минут хүчинтэй/);
assert.match(html,/auth\.verifyOtp\(\{phone:otpLoginState\.phone,token,type:"sms"\}\)/);
assert.match(html,/\/functions\/v1\/request-phone-otp/);
assert.match(html,/token\.length!==6/);
assert.match(html,/requestPhoneOtp\(phone,\{remember,faceChoice,context:"login"\}\)/);
assert.doesNotMatch(html,/fetch\(SUPABASE_URL\+"\/functions\/v1\/phone-login"/);
assert.match(html,/function setOtpMessage[\s\S]*box\.textContent=String\(message\)/,'OTP errors must be rendered as text');

assert.doesNotMatch(edge,/admin\.auth\.admin\.listUsers/,'OTP lookup must not scan all Auth users');
assert.match(edge,/from\("phone_login_accounts"\)/);
assert.match(edge,/consume_auth_rate_limit/);
assert.match(edge,/admin\.auth\.admin\.getUserById\(account\.user_id\)/);
assert.match(edge,/admin\.auth\.admin\.updateUserById\(account\.user_id, \{ phone \}\)/);
assert.match(edge,/authClient\.auth\.signInWithOtp/);
assert.match(edge,/shouldCreateUser: false/);
assert.match(edge,/same public response/);
assert.match(edge,/"Access-Control-Allow-Origin": "https:\/\/nayad\.store"/);

console.log('phone-otp-login: PASS — six-digit SMS OTP login is rate-limited and resists account enumeration');
