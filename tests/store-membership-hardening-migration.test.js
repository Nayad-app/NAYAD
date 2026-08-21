const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(
  path.join(__dirname,'..','supabase','migrations','20260822000400_harden_store_memberships.sql'),
  'utf8'
);

function functionBody(name){
  const match=sql.match(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\([^)]*\\)[\\s\\S]*?as\\s+\\$\\$([\\s\\S]*?)\\$\\$;`,
    'i'
  ));
  assert.ok(match,`${name} must be defined in the hardening migration`);
  return match[1];
}

test('ensure_my_store ignores shared memberships and creates an owner store',()=>{
  const body=functionBody('ensure_my_store');

  assert.match(body,/where\s+sm\.user_id\s*=\s*v_user_id\s+and\s+sm\.role\s*=\s*'owner'/i);
  assert.match(body,/pg_advisory_xact_lock/i,'concurrent startup calls must be serialized per user');
  assert.match(body,/insert\s+into\s+public\.store_members\s*\(store_id,\s*user_id,\s*role\)\s*values\s*\(v_store_id,\s*v_user_id,\s*'owner'\)/i);
});

test('invite acceptance creates only the one-way invitee membership',()=>{
  const body=functionBody('accept_store_invite');
  const membershipInserts=body.match(/insert\s+into\s+public\.store_members/gi)||[];

  assert.equal(membershipInserts.length,1,'acceptance must create exactly one membership edge');
  assert.match(body,/values\s*\(v_invite\.store_id,\s*v_user_id,\s*v_role\)/i);
  assert.doesNotMatch(body,/values\s*\([^)]*v_invite\.inviter_id/i,'the inviter must not be added to an invitee-owned store');
  assert.match(body,/when\s+v_invite\.role\s*=\s*'manager'\s+then\s+'manager'\s+else\s+'staff'/i);
  assert.match(body,/when\s+public\.store_members\.role\s*=\s*'owner'\s+then\s+'owner'/i);
});

test('authenticated clients cannot self-add or self-promote store membership',()=>{
  assert.match(sql,/drop\s+policy\s+if\s+exists\s+"Users can create their membership"/i);
  assert.match(sql,/drop\s+policy\s+if\s+exists\s+"Users can update their membership"/i);
  assert.match(sql,/revoke\s+all\s+privileges\s+on\s+table\s+public\.store_members\s+from\s+anon,\s*authenticated/i);
  assert.match(sql,/grant\s+select\s+on\s+table\s+public\.store_members\s+to\s+authenticated/i);
  assert.doesNotMatch(sql,/grant\s+(?:insert|update|delete|truncate)[^;]*store_members[^;]*authenticated/i);
});

test('trusted membership RPCs have explicit execute ACLs',()=>{
  for(const signature of ['ensure_my_store\\(\\)','accept_store_invite\\(uuid\\)']){
    assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${signature}\\s+from\\s+public,\\s*anon,\\s*authenticated`,'i'));
    assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${signature}\\s+to\\s+authenticated`,'i'));
  }

  for(const signature of [
    'create_store_invite\\(uuid,\\s*text\\)',
    'get_my_store\\(\\)',
    'get_my_stores\\(\\)',
    'get_store_members\\(uuid\\)',
    'is_store_member\\(uuid\\)'
  ]){
    assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${signature}\\s+from\\s+public,\\s*anon`,'i'));
    assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${signature}\\s+to\\s+authenticated`,'i'));
  }
});
