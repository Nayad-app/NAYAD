const {PGlite}=require('@electric-sql/pglite'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();await db.exec(`create schema auth;create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
 create table invoices(id uuid primary key,store_id uuid,supplier_id uuid,invoice_no text,invoice_date date,due_date date,amount numeric,paid numeric,status text,discount_percent numeric,discount_deadline date,note text,image_url text,updated_at timestamptz,confirmed_at timestamptz,confirmed_by uuid,correction_note text);
 create table store_members(store_id uuid,user_id uuid,role text);
 create table invoice_images(id uuid,invoice_id text,image_url text,image_path text,page_number integer);
 create table finance_audit_events(store_id uuid,entity_type text,entity_id uuid,action text,actor_id uuid,details jsonb);
 create table payments(id uuid,status text);create table payment_allocations(payment_id uuid,invoice_id uuid);
 insert into store_members values('22222222-2222-4222-8222-222222222222',auth.uid(),'owner');
 insert into invoices(id,store_id,supplier_id,invoice_date,due_date,amount,paid,status,discount_percent,discount_deadline) values('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','2026-10-09','2026-10-25',741650,0,'draft',4,'2026-10-31');`);
 const source=fs.readFileSync('supabase/migrations/20260826010000_direct_invoice_editing.sql','utf8');const old=source.match(/create or replace function public\.confirm_invoice_with_note\([\s\S]*?\n\$\$;/)[0];await db.exec(old);
 const id='33333333-3333-4333-8333-333333333333';await assert.rejects(()=>db.query('select * from confirm_invoice_with_note($1,null)',[id]),/between invoice/);
 await db.exec(fs.readFileSync('supabase/migrations/20261012104013_independent_discount_deadline.sql','utf8'));
 for(const fn of ['confirm_invoice','confirm_invoice_with_note']){
  await db.exec("update invoices set status='draft',discount_deadline='2026-10-31'");await db.query(`select * from ${fn}($1)`,[id]);assert.equal((await db.query('select status from invoices')).rows[0].status,'confirmed');
  for(const date of [null,'2026-10-08']){await db.query("update invoices set status='draft',discount_deadline=$1",[date]);await assert.rejects(()=>db.query(`select * from ${fn}($1)`,[id]),/падааны огнооноос/);}
 }
 await db.exec("update invoices set status='confirmed',paid=200");
 const edit=deadline=>db.query("select * from edit_confirmed_invoice($1,'TEST','2026-10-09','2026-10-25',741650,4,$2,null,null)",[id,deadline]);
 for(const date of ['2026-10-09','2026-10-25','2026-10-31'])await edit(date);
 assert.equal((await db.query('select paid from invoices')).rows[0].paid,'200');await assert.rejects(()=>edit('2026-10-08'),/падааны огнооноос/);await assert.rejects(()=>edit(null),/падааны огнооноос/);
 await db.exec('update invoices set paid=0');await db.query("select * from revise_confirmed_invoice($1,'TEST','2026-10-09','2026-10-25',741650,4,'2026-10-31','test')",[id]);
 await assert.rejects(()=>db.query("select * from revise_confirmed_invoice($1,'TEST','2026-10-09','2026-10-25',741650,4,'2026-10-08','test')",[id]),/падааны огнооноос/);
 await db.query("select * from edit_confirmed_invoice($1,'TEST','2026-10-09','2026-10-25',741650,0,null,null,null)",[id]);assert.equal((await db.query('select discount_deadline from invoices')).rows[0].discount_deadline,null);
 await assert.rejects(()=>db.query("select * from edit_confirmed_invoice($1,'TEST','2026-10-09','2026-10-08',741650,0,null,null,null)",[id]),/Due date/);
 console.log('PASS: original error reproduced; all four invoice paths accept independent discount deadline, validate lower bound, preserve paid amount, support no discount');await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
