const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const onboarding=fs.readFileSync(path.join(root,'registration-onboarding.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260911103000_add_registration_directions.sql'),'utf8');

assert.match(index,/id="profileFullName"/,'Profile settings must edit the account name');
assert.match(index,/id="profilePhone"/,'Profile settings must edit the login phone');
assert.match(index,/id="profileStoreName"/,'owners must be able to edit the active registration name');
assert.match(index,/id="profileBusinessType"/,'buyer owners must be able to edit their activity type');
assert.match(index,/id="profileEntityType"/,'supplier owners must be able to edit person or organization type');
assert.match(index,/operation_role,business_type,entity_type/,'profile settings must load the persisted workflow metadata');
assert.match(index,/const changes=\{name:storeName,business_type:businessType,entity_type:entityType\}/,'profile save must preserve role-specific registration details');

assert.match(onboarding,/Нийлүүлэгчийн нэр/);
assert.match(onboarding,/Үйл ажиллагааны нэр/);
assert.match(migration,/add column if not exists operation_role text not null default 'buyer'/,'legacy stores must remain on the existing buyer workflow');
assert.match(migration,/add column if not exists entity_type text/);
assert.match(migration,/operation_role = any \(array\['supplier', 'buyer'\]/);

const oldPolicyMigration=fs.readFileSync(path.join(root,'supabase','migrations','20260822113100_inline_store_owner_update_policy.sql'),'utf8');
assert.match(oldPolicyMigration,/sm\.role = 'owner'/,'owner check must remain enforced in RLS');

console.log('business-profile-settings: PASS — role-specific registration details remain owner-editable');
