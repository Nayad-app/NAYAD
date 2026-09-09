const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const file=fs.readdirSync(path.join(__dirname,'..','supabase','migrations')).find(name=>name.endsWith('_qpay_billing.sql'));
assert.ok(file,'QPay billing migration must exist');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations',file),'utf8');
const allMigrations=fs.readdirSync(path.join(__dirname,'..','supabase','migrations'))
  .map(name=>fs.readFileSync(path.join(__dirname,'..','supabase','migrations',name),'utf8')).join('\n');
for(const table of ['subscription_plans','qpay_orders','store_subscriptions']){
  assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`,'i'),`${table} needs RLS`);
}
assert.match(sql,/\('month','1 сар',9900,1,true\)/);
assert.match(sql,/\('year','1 жил',99000,12,true\)/);
assert.match(sql,/duration_months integer not null/,'orders must snapshot the purchased duration');
assert.match(sql,/qpay_orders_qpay_payment_id_unique_idx/,'a QPay payment cannot activate two orders');
assert.match(sql,/vault\.decrypted_secrets/,'merchant credentials must be kept in Vault');
assert.match(sql,/revoke all on function public\.get_qpay_credentials_for_service\(\) from public,anon,authenticated/i);
assert.match(sql,/revoke all on function public\.finalize_qpay_order\(uuid,text,numeric\) from public,anon,authenticated/i);
assert.match(sql,/for update/,'activation must lock the order');
assert.match(allMigrations,/grant select on table public\.store_members to service_role/i,'the billing backend must be able to verify store ownership');
console.log('qpay-billing-migration: PASS — prices, RLS, Vault isolation, snapshots, and idempotent activation are present');
