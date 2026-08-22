const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260822113000_add_business_profile_settings.sql'),'utf8');

assert.match(index,/id="regStoreName"/,'sign-up must collect the exact store name');
assert.match(index,/id="regBusinessType"/,'sign-up must collect a business type once');
assert.match(index,/store_name:storeName,business_type:businessType/,'sign-up metadata must preserve store information until the owned store is created');
assert.match(index,/id="profileFullName"/,'Profile settings must edit the account name');
assert.match(index,/id="profilePhone"/,'Profile settings must edit the login phone');
assert.match(index,/id="profileStoreName"/,'Store owners must be able to edit their store name');
assert.match(index,/id="profileBusinessType"/,'Store owners must be able to edit their business type');
assert.match(index,/update\(\{name:storeName,business_type:businessType\}\)/,'Profile save must persist business information');
assert.match(migration,/add column if not exists business_type text/,'stores must persist the business type');
assert.match(migration,/raw_user_meta_data ->> 'store_name'/,'new stores must use the user-entered store name');
assert.doesNotMatch(migration,/\|\| ' store'/,'new stores must not append “store” automatically');
assert.match(migration,/Owners can update their stores/,'only the store owner may update business information');
const policyMigration=fs.readFileSync(path.join(root,'supabase','migrations','20260822113100_inline_store_owner_update_policy.sql'),'utf8');
assert.match(policyMigration,/sm\.role = 'owner'/,'owner check must be enforced in RLS');
assert.match(policyMigration,/drop function if exists public\.is_store_owner/,'the helper must not remain callable as an RPC');

console.log('business-profile-settings: PASS — sign-up and Profile preserve editable business details');
