const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260822071514_payment_center_v11.sql'),'utf8');
const notificationPrivileges=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260822074830_harden_notification_preferences_privileges.sql'),'utf8');

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

console.log('payment-center-migration: PASS — ledger, locking, audit and least-privilege guards are present');
