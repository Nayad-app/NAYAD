const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260822000200_throttle_store_invite_email.sql'),'utf8');

assert.match(sql,/created_at > now\(\) - interval '1 minute'/i,'same-recipient retries must be throttled');
assert.match(sql,/created_at > now\(\) - interval '1 hour'/i,'hourly email volume must be bounded');
assert.match(sql,/>= 20/,'hourly invite cap must be explicit');
assert.match(sql,/store_invites_inviter_created_idx/,'the throttle lookup must be indexed');
assert.match(sql,/store_invites_recipient_created_idx/,'the recipient cooldown lookup must be indexed');
assert.match(sql,/grant execute on function public\.create_store_invite\(uuid, text\) to authenticated/i);

console.log('store-invite-throttle-migration: PASS — invite email abuse is rate-limited');
