const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260822000300_auth_email_invite_fallback.sql'),'utf8');

test('Auth recipient lookup is service-role-only and does not expose auth.users',()=>{
  assert.match(sql,/security definer/i);
  assert.match(sql,/set search_path\s*=\s*''/i);
  assert.match(sql,/from auth\.users/i);
  assert.match(sql,/revoke all on function public\.is_auth_email_registered\(text\) from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.is_auth_email_registered\(text\) to service_role/i);
});
