// Run with: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node tests/statement-activity.sql-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema private;
grant usage on schema private to authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.stores(id uuid primary key);
create table public.store_members(store_id uuid,user_id uuid,role text,permissions jsonb);
create table public.profiles(id uuid,full_name text);
create table public.suppliers(id uuid primary key,store_id uuid,name text);
create table public.invoices(id uuid primary key,store_id uuid,supplier_id uuid,amount numeric,invoice_no text,invoice_date date,due_date date,note text,status text,discount_percent numeric,discount_deadline date,image_url text,created_at timestamptz default now(),created_by uuid,paid numeric default 0);
create table public.payments(id uuid,store_id uuid,supplier_id uuid,payment_date date,created_at timestamptz,created_by uuid,status text,amount numeric,reversed_at timestamptz,reversed_by uuid,reversal_reason text);
create table public.finance_audit_events(id bigint generated always as identity,store_id uuid references public.stores(id) on delete cascade,entity_type text,entity_id uuid,action text,actor_id uuid,details jsonb,created_at timestamptz default now());
`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261011042840_statement_activity_history.sql',import.meta.url),'utf8'));
const permissions=fs.readFileSync(new URL('../supabase/migrations/20260909113406_granular_store_member_permissions.sql',import.meta.url),'utf8');
for(const name of ['normalize_store_permissions','has_store_permission']){
  const start=permissions.indexOf('create or replace function private.'+name);
  const end=permissions.indexOf('grant execute on function private.'+name,start);
  await db.exec(permissions.slice(start,permissions.indexOf(';',end)+1));
}
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261018110810_statement_member_activity_permissions.sql',import.meta.url),'utf8'));
const owner='00000000-0000-0000-0000-000000000001',store='00000000-0000-0000-0000-000000000002',supplier='00000000-0000-0000-0000-000000000003',invoice='00000000-0000-0000-0000-000000000004',other='00000000-0000-0000-0000-000000000005';
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);
insert into stores values('${store}'),('${other}');
insert into store_members values('${store}','${owner}','owner','{}');
insert into profiles values('${owner}','Test Owner');
insert into suppliers values('${supplier}','${store}','Test Supplier');
insert into invoices(id,store_id,supplier_id,amount,invoice_no,status,created_by) values('${invoice}','${store}','${supplier}',500,'INV-1','confirmed','${owner}');
update invoices set amount=450 where id='${invoice}';
update invoices set paid=100 where id='${invoice}';
`);
const read=async(s=store)=>(await db.query(`select * from public.statement_activity('${s}','2000-01-01','2100-01-01')`)).rows.map(r=>r.statement_activity);
let rows=await read();assert.equal(rows.length,2,'paid-only update must not pretend user edited invoice');
assert.equal(rows.find(r=>r.action==='update').before.amount,500);
assert.equal(rows.find(r=>r.action==='update').amount,450);
assert.equal(rows[0].actor_name,'Test Owner');
assert.equal((await read(other)).length,0,'owner must not read another store');
await db.exec(`delete from invoices where id='${invoice}'`);
rows=await read();assert.equal(rows.length,3);assert.equal(rows.find(r=>r.action==='delete').supplier_name,'Test Supplier');assert.equal(rows.find(r=>r.action==='delete').amount,450);
await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
assert.equal((await read()).length,0,'non-member denied');
await db.exec(`select set_config('request.jwt.claim.sub','',false);`);
assert.equal((await read()).length,0,'unauthenticated denied');
await db.exec(`set role authenticated`);
assert.equal((await read()).length,0,'public invoker wrapper enforces access');
await db.exec(`reset role; select set_config('request.jwt.claim.sub','${owner}',false); set role authenticated;`);
assert.equal((await read()).length,3,'authenticated owner can use invoker wrapper');
await db.exec('reset role;');
const member='00000000-0000-0000-0000-000000000006';
await db.exec(`insert into store_members values('${store}','${member}','member','{"invoices":"edit","payments":"edit"}');
insert into payments(id,store_id,supplier_id,payment_date,created_at,created_by,status,amount,reversed_at,reversed_by) values('${invoice}','${store}','${supplier}',current_date,now(),'${owner}','reversed',100,now(),'${owner}');
select set_config('request.jwt.claim.sub','${member}',false); set role authenticated;`);
rows=await read();
assert.equal(rows.length,5,'full member sees invoice snapshots, payment actor and reversal');
assert.ok(rows.every(r=>r.actor_name==='Test Owner'),'member resolves same actor as owner');
assert.equal((await read(other)).length,0,'member cannot read other store');
for(const [permissions,kinds,count] of [
  [{invoices:'view'},['invoice','change'],3],
  [{payments:'view'},['payment_actor','change'],2],
  [{customers:'edit',loans:'edit'},[],0],
  [{payments:'edit'},['invoice','change','payment_actor'],5]
]){
  await db.exec(`reset role; update store_members set permissions='${JSON.stringify(permissions)}' where user_id='${member}'; set role authenticated;`);
  rows=await read(); assert.equal(rows.length,count);
  assert.ok(rows.every(r=>kinds.includes(r.kind)));
  if(permissions.payments==='view') assert.ok(rows.every(r=>r.kind==='payment_actor'||r.action==='payment_reversed'),'payment viewer cannot read invoice snapshots');
}
await db.exec('reset role;');

await db.exec(`delete from stores where id='${store}';`);
assert.equal((await db.query('select * from finance_audit_events')).rows.length,0,'store deletion cascades audit');
await db.close();console.log('statement activity SQL: PASS — snapshots, deletion, owner/member isolation, module permissions, actor names, invoker wrapper');
