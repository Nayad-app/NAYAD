const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const invoiceSource=fs.readFileSync(path.join(root,'invoice-cloud.js'),'utf8');
const paymentSource=fs.readFileSync(path.join(root,'payment-center.js'),'utf8');

assert.doesNotMatch(invoiceSource,/Ноорог хадгалах|НООРОГ ПАДААН/,'users must not see a draft workflow');
assert.match(invoiceSource,/id="cloudConfirmInvoiceBtn"[^>]+>ПАДААН БҮРТГЭХ/,'invoice creation must expose one direct register action');
assert.match(invoiceSource,/confirm_invoice_with_note/,'direct registration must immediately confirm the staged row');
assert.match(invoiceSource,/status:'confirmed'/,'new local invoices must be confirmed');
assert.match(invoiceSource,/note:note\|\|''/,'new invoice notes must be retained locally');

assert.match(paymentSource,/Падаан засах/);
assert.match(paymentSource,/Төлсөн мөнгө өөрчлөгдөхгүй/);
assert.match(paymentSource,/if\(invoiceAmount<paid\)/);
assert.doesNotMatch(paymentSource,/reviseInvoiceReason/,'routine invoice edits must not require a correction reason');
assert.match(paymentSource,/selectInvoiceEditFiles/);
assert.match(paymentSource,/edit_confirmed_invoice/);
assert.match(paymentSource,/p_images:newImages\.length\?newImages:null/);
assert.match(paymentSource,/removeInvoiceStoragePaths\(uploadedPaths\)/,'failed image edits must clean up new Storage objects');

console.log('direct-invoice-editing: PASS — direct confirmation and paid-safe metadata/image edits are wired');
