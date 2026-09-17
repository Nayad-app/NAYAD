const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(
  path.join(root,'supabase','migrations','20260917204558_fix_invoice_agreement_ordinality.sql'),
  'utf8'
);

assert.match(
  migration,
  /jsonb_array_elements\(p_installments\)\s+with ordinality\s+as x\(installment,n\)/i,
  'agreement installments must use legal PostgreSQL ordinality syntax'
);
assert.doesNotMatch(
  migration,
  /jsonb_to_recordset\(p_installments\)\s+with ordinality/i,
  'record-returning functions cannot combine WITH ORDINALITY with a column definition list'
);
assert.match(migration,/v_role not in \('owner','manager'\)/,'owner/manager authorization must remain enforced');
assert.match(migration,/security definer[\s\S]*set search_path = pg_catalog, public/i,'the hardened function context must remain unchanged');

console.log('invoice-agreement-migration: PASS — legal ordinality syntax preserves authorization and installment order');
