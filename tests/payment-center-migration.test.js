const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260822071514_payment_center_v11.sql'),'utf8');
const notificationPrivileges=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260822074830_harden_notification_preferences_privileges.sql'),'utf8');
const revisionSql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260822090000_revise_confirmed_invoice.sql'),'utf8');
const invoiceDiscountSql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260822100000_invoice_discount_is_invoice_level.sql'),'utf8');
const directEditSql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260826010000_direct_invoice_editing.sql'),'utf8');

for(const required of [
  /add column if not exists status text not null default 'confirmed'/,
  /add column if not exists due_date date/,
  /create table if not exists public\.payment_allocations/,
  /create table if not exists public\.invoice_agreements/,
  /create table if not exists public\.finance_audit_events/,
  /create or replace function public\.save_invoice_draft/,
  /create or replace function public\.confirm_invoice/,
  /create or replace function public\.post_supplier_payment_v11/,
  /for update/,
  /revoke insert,update,delete,truncate on public\.invoices from authenticated/,
  /revoke insert,update,delete,truncate on public\.payments from authenticated/
])assert.match(sql,required);

assert.match(sql,/order by coalesce\(\(select min\(a\.agreed_due_date\)/,'payments must allocate by negotiated/original due date');
assert.match(sql,/v_cash=round\(\(v_invoice\.amount-v_invoice\.paid\)\*\(1-v_invoice\.discount_percent\/100\),2\)/,'discount closes debt only when the exact discounted cash amount is paid');
assert.match(sql,/Legacy payment cannot be reversed automatically/,'old payments without allocations must not corrupt debt during reversal');
assert.doesNotMatch(sql,/add constraint if not exists/i,'Postgres does not support ADD CONSTRAINT IF NOT EXISTS');
assert.match(notificationPrivileges,/revoke delete,truncate,references,trigger on public\.notification_preferences from anon,authenticated/);
assert.match(notificationPrivileges,/grant select,insert,update on public\.notification_preferences to authenticated/);
for(const required of [
  /create or replace function public\.revise_confirmed_invoice/,
  /select \* into v_invoice from public\.invoices where id=p_invoice_id for update/,
  /v_role not in \('owner','manager'\)/,
  /v_invoice\.paid<>0 or exists/,
  /Reverse posted payment before revising this invoice/,
  /'confirmed_revised'/,
  /revoke execute on function public\.revise_confirmed_invoice[^\n]+ from public,anon/,
  /grant execute on function public\.revise_confirmed_invoice[^\n]+ to authenticated/
])assert.match(revisionSql,required);

for(const required of [
  /A timely-payment discount is defined by the original invoice total/,
  /v_discount_available:=greatest\(round\(v_invoice\.amount\*v_invoice\.discount_percent\/100,2\)-v_prior_discount,0\)/,
  /v_cash=round\(greatest\(\(v_invoice\.amount-v_invoice\.paid\)-v_discount_available,0\),2\)/,
  /revoke execute on function public\.post_supplier_payment_v11[^\n]+ from public,anon/,
  /grant execute on function public\.post_supplier_payment_v11[^\n]+ to authenticated/
])assert.match(invoiceDiscountSql,required);

for(const required of [
  /add column if not exists note text/,
  /create or replace function public\.confirm_invoice_with_note/,
  /create or replace function public\.edit_confirmed_invoice/,
  /select \* into v_invoice from public\.invoices where id=p_invoice_id for update/,
  /v_role not in \('owner','manager'\)/,
  /p_amount<v_invoice\.paid/,
  /paid_preserved/,
  /jsonb_array_length\(p_images\)>20/,
  /v_image_prefix:=v_invoice\.store_id::text\|\|'\/'\|\|v_invoice\.supplier_id::text/,
  /'confirmed_edited'/,
  /revoke execute on function public\.confirm_invoice_with_note[^\n]+ from public,anon/,
  /revoke execute on function public\.edit_confirmed_invoice[^\n]+ from public,anon/,
  /grant execute on function public\.edit_confirmed_invoice[^\n]+ to authenticated/
])assert.match(directEditSql,required);

console.log('payment-center-migration: PASS — ledger, direct edits, locking, audit and least-privilege guards are present');
