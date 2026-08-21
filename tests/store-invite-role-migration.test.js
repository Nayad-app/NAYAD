const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260822000100_fix_store_invite_roles.sql'),'utf8');

assert.match(sql,/set role = 'staff'\s+where role = 'member'/i,'legacy pending invites must be migrated');
assert.match(sql,/alter column role set default 'staff'/i,'new invites must use a valid membership role');
assert.match(sql,/check \(role in \('manager', 'staff'\)\)/i,'invite roles must be compatible with store_members');
assert.match(sql,/v_role := case when v_invite\.role = 'manager' then 'manager' else 'staff' end/i,'acceptance must defensively normalize legacy roles');
assert.match(sql,/when public\.store_members\.role = 'owner' then 'owner'/i,'acceptance must never demote a store owner');
assert.match(sql,/revoke all on function public\.accept_store_invite\(uuid\) from public, anon/i,'security-definer invite acceptance must not be public');
assert.match(sql,/grant execute on function public\.accept_store_invite\(uuid\) to authenticated/i);

console.log('store-invite-role-migration: PASS — invite roles and privileges are aligned');
