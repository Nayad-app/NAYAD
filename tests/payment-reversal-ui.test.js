const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','payment-center.js'),'utf8');

assert.match(source,/postedPaymentsForInvoice/,'paid invoices must load their posted payment allocations');
assert.match(source,/payment_allocations/,'payment allocation history must identify the correct payment');
assert.match(source,/payments!inner\(id,payment_date,amount,method,note,reference,status\)/,'only real posted payment details may be shown');
assert.match(source,/paymentReversalRows/,'the invoice view must render payment reversal actions');
assert.match(source,/ТӨЛБӨР БУЦААХ/,'the reversal action must be visible to the user');
assert.match(source,/Буцаалтын шалтгаан/,'a reversal must require a reason');
assert.match(source,/reverse_supplier_payment/,'the UI must use the audited server-side reversal RPC');
assert.match(source,/payment-reversed/,'the app must refresh the cloud state after reversing');
assert.match(source,/Нэг төлбөр олон падаанд хуваарилагдсан бол тэдгээрийн дүн мөн сэргэнэ/,'whole-payment impact must be disclosed before confirmation');

console.log('payment-reversal-ui: PASS — paid invoices expose a reasoned, auditable reversal path');
