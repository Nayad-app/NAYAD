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


// Paged reader: all-time totals without downloading all rows or actor metadata.
await db.exec(`alter table payments add column note text,add column reference text,add column method text,add column invoice_id uuid;
create table payment_allocations(payment_id uuid,invoice_id uuid,cash_amount numeric,discount_amount numeric);
select set_config('request.jwt.claim.sub','${owner}',false);`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261018125158_statement_paged_read.sql',import.meta.url),'utf8'));
await db.exec(`insert into payments(id,store_id,supplier_id,payment_date,created_at,created_by,status,amount,note) select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${store}','${supplier}','2026-10-01','2026-10-01T10:00:00Z'::timestamptz+n*interval '1 second','${owner}','posted',100,'Барааны төлбөр' from generate_series(1,121) n;`);
const page=async(filters={},offset=0,asof=null,s=store)=>(await db.query('select public.statement_page($1,$2,$3,$4) as data',[s,JSON.stringify(filters),offset,asof])).rows[0].data;
const detail=async(id,s=store)=>(await db.query('select public.statement_detail($1,$2) as data',[s,id])).rows[0].data;
let first=await page();assert.equal(first.rows.length,50);assert.equal(first.totals.payment.count,121);assert.equal(first.totals.payment.amount,12100);assert.equal(first.totals.invoice.amount,500,'original insertion total retained');assert(first.has_more);assert(first.rows.every(r=>!('actor_name' in r)&&!('created_by' in r)&&!('allocations' in r)));
let all=[...first.rows];for(let offset=50;offset<150;offset+=50)all.push(...(await page({},offset,first.asof)).rows);assert.equal(all.length,122);assert.equal(new Set(all.map(r=>r.id)).size,122);
assert.equal((await page({kind:'payment',query:'baraani',min:'100',max:'100',from:'2026-10-01',to:'2026-10-01'})).totals.payment.count,121);
assert.equal((await page({query:'missing'})).rows.length,0);assert.equal((await page({min:'101'})).totals.payment.count,0);
const pid=all.find(r=>r.kind==='payment').id;assert.equal((await detail(pid)).actor_name,'Test Owner');assert.deepEqual((await detail(pid)).allocations,[]);
const inv=all.find(r=>r.kind==='invoice');assert.equal((await detail(inv.id)).actor_name,'Test Owner');
assert.equal((await page({},0,null,other)).rows.length,0);assert.equal(await detail(pid,other),null);
for(const [permissions,payments,invoices] of [[{payments:'view'},121,0],[{invoices:'view'},0,1],[{customers:'edit'},0,0]]){
 await db.exec(`update store_members set permissions='${JSON.stringify(permissions)}' where user_id='${member}'; select set_config('request.jwt.claim.sub','${member}',false);set role authenticated;`);
 const result=await page();assert.equal(result.totals.payment.count,payments);assert.equal(result.totals.invoice.count,invoices);
 assert.equal((await detail(pid))!==null,payments>0);assert.equal((await detail(inv.id))!==null,invoices>0);await db.exec('reset role;');
}
await db.exec(`select set_config('request.jwt.claim.sub','',false);set role authenticated;`);assert.equal((await page()).rows.length,0);assert.equal(await detail(pid),null);await db.exec('reset role;');
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);
insert into invoices(id,store_id,supplier_id,amount,invoice_no,status,created_by) values('${invoice}','${store}','${supplier}',100,'LOOKUP-ONLY','confirmed','${owner}');
insert into payment_allocations values('${pid}','${invoice}',75,25);`);
const allocationDetail=await detail(pid);assert.equal(allocationDetail.allocations[0].invoices.invoice_no,'LOOKUP-ONLY');assert.equal(allocationDetail.allocations[0].discount_amount,25);
const searched=await page({kind:'payment',query:'lookup-only'});assert.equal(searched.rows.length,1);assert.equal(searched.rows[0].id,pid);assert.equal(searched.totals.payment.amount,100);
await db.exec(`insert into payments(id,store_id,supplier_id,payment_date,created_at,created_by,status,amount) values('20000000-0000-0000-0000-000000000001','${store}','${supplier}',current_date,now()+interval '1 minute','${owner}','posted',999);`);
assert.equal((await page({},0,first.asof)).totals.payment.amount,12100,'later inserts do not shift the current pagination snapshot');

await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261024152251_statement_current_invoice_amount.sql',import.meta.url),'utf8'));
const editedInvoice='30000000-0000-0000-0000-000000000001';
await db.exec(`insert into invoices(id,store_id,supplier_id,amount,invoice_no,status,created_by) values('${editedInvoice}','${store}','${supplier}',100,'EDIT-TEST','confirmed','${owner}')`);
const beforeHistory=(await db.query(`select details from finance_audit_events where entity_id='${editedInvoice}' and action='insert'`)).rows;
const invoiceRow=(await page({kind:'invoice'})).rows.find(r=>r.entity_id===editedInvoice);
const invoiceTotal=(await page()).totals.invoice.amount;
await db.exec(`update invoices set amount=72.05 where id='${editedInvoice}'`);
assert.equal((await detail(invoiceRow.id)).amount,72.05,'detail must show corrected amount');
assert.equal((await page({kind:'invoice',min:'72',max:'73'})).rows.filter(r=>r.entity_id===editedInvoice).length,1,'amount filter uses corrected amount');
assert.equal((await page()).totals.invoice.amount,invoiceTotal-27.95,'totals use corrected amount without adding adjustment rows');
assert.deepEqual((await db.query(`select details from finance_audit_events where entity_id='${editedInvoice}' and action='insert'`)).rows,beforeHistory,'original insert snapshots are unchanged');
for(const corrected of [1805892.05,2000000.17,72.05]){
 await db.exec(`update invoices set amount=${corrected} where id='${editedInvoice}'`);
 assert.equal((await detail(invoiceRow.id)).amount,corrected);
 assert.equal((await page()).totals.invoice.amount,invoiceTotal-100+corrected);
}
await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
assert.equal((await page()).rows.length,0,'new reader retains store permissions');
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`);
console.log('paged statement SQL: PASS — pages, totals, transliteration, details and permission isolation');
await db.exec(`delete from stores where id='${store}';`);
assert.equal((await db.query('select * from finance_audit_events')).rows.length,0,'store deletion cascades audit');
await db.close();console.log('statement activity SQL: PASS — snapshots, deletion, owner/member isolation, module permissions, actor names, invoker wrapper');
