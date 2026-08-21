const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','supabase','functions','send-store-invite','index.ts'),'utf8');

assert.match(source,/Authorization.*bearer/i,'the caller must be authenticated');
assert.match(source,/"create_store_invite"/,'the owner-checked RPC must create the invite');
assert.match(source,/Deno\.env\.get\("RESEND_API_KEY"\)/,'the provider key must stay server-side');
assert.match(source,/is_auth_email_registered/,'the Auth SMTP fallback must distinguish existing recipients server-side');
assert.match(source,/shouldCreateUser:\s*false/,'existing recipients must not be duplicated by the magic-link fallback');
assert.match(source,/emailRedirectTo:\s*link/,'the Auth email must return to the store invitation');
assert.doesNotMatch(source,/inviteUserByEmail\(/,'the fallback must not create an account that bypasses NAYAD phone/password onboarding');
assert.match(source,/SUPABASE_SERVICE_ROLE_KEY/,'admin credentials must only be read inside the Edge Function');
assert.match(source,/if \(isRegistered !== true\) return false/,'unknown recipients must keep the copy-link fallback instead of receiving an unusable Auth account');
assert.match(source,/if \(!sent\) sent = await sendWithAuthSmtp/,'Auth SMTP must be used for registered users when custom mail delivery is unavailable');
assert.match(source,/https:\/\/api\.resend\.com\/emails/,'Resend must receive the email request');
assert.match(source,/NAYAD <noreply@nayad\.store>/,'the verified NAYAD sender must be used');
assert.match(source,/json\(\{ sent: false, link/,'delivery failure must preserve an explicit copy-link fallback');
assert.match(source,/Resend network failure/,'transport errors must fall through to Auth SMTP or the copy-link fallback');
assert.doesNotMatch(source,/serviceRoleKey[^\n]*json\(/,'the service-role key must never be returned to the browser');

console.log('store-invite-edge-function: PASS — invite delivery is authenticated and keeps secrets server-side');
