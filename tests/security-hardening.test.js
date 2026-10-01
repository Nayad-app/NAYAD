const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260924120000_harden_auth_and_invoice_permissions.sql'),'utf8');
const coalesceFix=fs.readFileSync(path.join(root,'supabase/migrations/20260930042000_fix_store_permission_coalesce.sql'),'utf8');

assert.match(html,/const base=\{companies:\[\],payments:\[\]\}/,'the public shell must start with no business data');
const baseStart=html.indexOf('const base=');
const baseEnd=html.indexOf('const BANKS=',baseStart);
const baseBlock=html.slice(baseStart,baseEnd);
for(const leaked of ['Хонгороо','MCS ундаа','4250000','6845960'])assert.doesNotMatch(baseBlock,new RegExp(leaked));

const authMessage=html.slice(html.indexOf('function authMessage('),html.indexOf('function togglePassword('));
assert.match(authMessage,/\.textContent=/);
assert.match(authMessage,/replaceChildren/);
assert.doesNotMatch(authMessage,/innerHTML/);

const phoneLogin=html.slice(html.indexOf('async function phoneLogin(){'),html.indexOf('async function registerUser(){'));
assert.match(phoneLogin,/\/functions\/v1\/phone-login/);
assert.match(phoneLogin,/sb\.auth\.signInWithPassword\(\{email:result\.email,password\}\)/);
assert.match(phoneLogin,/result\.user_id/);
assert.doesNotMatch(phoneLogin,/result\.access_token|result\.refresh_token|setSession/);

assert.match(migration,/create table if not exists public\.auth_rate_limits/);
assert.match(migration,/enable row level security/);
assert.match(migration,/revoke all on table public\.auth_rate_limits from public, anon, authenticated/);
assert.match(migration,/grant execute on function public\.consume_auth_rate_limit[\s\S]*to service_role/);
assert.match(migration,/revoke all on function public\.handle_new_user_profile\(\)[\s\S]*from public, anon, authenticated/);
assert.match(migration,/to_jsonb\(new\)-'paid'-'updated_at'/);
assert.match(migration,/to_jsonb\(old\)-'paid'-'updated_at'/);
assert.match(coalesceFix,/create or replace function private\.enforce_store_module_permission\(\)/);
assert.match(coalesceFix,/if not coalesce\(v_allowed,false\) then/);
assert.doesNotMatch(coalesceFix,/pg_catalog\.coalesce/);

console.log('security-hardening: PASS — seed data, auth, XSS and invoice permissions are guarded');
