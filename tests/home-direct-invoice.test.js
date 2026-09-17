const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const indexSource=fs.readFileSync(path.join(root,'index.html'),'utf8');
const contactSource=fs.readFileSync(path.join(root,'contact-types.js'),'utf8');
const invoiceSource=fs.readFileSync(path.join(root,'invoice-cloud.js'),'utf8');

assert.match(indexSource,/class="homeInvoiceAdd"[^>]+onclick="window\.openDirectInvoice\?\.\(\)"/,'Home plus must open the direct invoice form');
assert.match(indexSource,/supplier\?"ЯАРАЛТАЙ АВЛАГА":"ЯАРАЛТАЙ ӨГЛӨГ"/,'urgent heading must follow the registration direction');
assert.match(indexSource,/onclick="showHomeDebtView\('all'\)"/,'debt-contact summary must reveal all debt contacts');
assert.match(indexSource,/onclick="showHomeDebtView\('today'\)"/,'today summary must reveal only today-due contacts');
assert.match(contactSource,/const quickRows=\[\['all','Бүгд'\],\['next7'/,'the approved five quick filters must remain in the title row');

assert.match(invoiceSource,/id="cloudICompany"[^>]+placeholder="Харилцагч сонгох"/,'direct invoice form must select a contact in the same sheet');
assert.match(invoiceSource,/window\.openDirectInvoice=function\(\)\{window\.invoice\(null\);\}/);
assert.match(invoiceSource,/if\(directInvoiceMode\)/,'saving a direct invoice must resolve and validate its selected contact');
assert.match(invoiceSource,/ПАДААН БҮРТГЭХ/,'the existing direct registration action must remain available');

console.log('home-direct-invoice: PASS — compact Home actions and direct invoice entry are wired');
