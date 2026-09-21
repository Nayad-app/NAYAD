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
assert.match(indexSource,/onclick="showHomePeriodFilter\(\)"/,'payment-period summary must open the approved centered filter');
assert.match(contactSource,/const quickRows=\[\['all','Бүгд'\],\['next7'/,'the approved five quick filters must remain in the title row');
for(const label of ['Өнөөдөр','3 хоногт','7 хоногт','14 хоногт','Энэ сард','Огноо сонгох'])assert.match(contactSource,new RegExp(label));
assert.match(contactSource,/className='homePeriodOverlay hide'/,'the payment-period picker must use its own centered overlay');
assert.match(contactSource,/align-items:center;justify-content:center/,'the payment-period picker must be centered, not a bottom sheet');
assert.match(contactSource,/id="homePeriodStart" type="date"/,'custom period must include a start date');
assert.match(contactSource,/id="homePeriodEnd" type="date"/,'custom period must include an end date');

assert.match(invoiceSource,/<select id="cloudICompany"><option value="">Харилцагч сонгох<\/option>/,'direct invoice form must use a re-openable contact dropdown');
assert.doesNotMatch(invoiceSource,/cloudICompanyOptions|<datalist/,'the iPhone-incompatible one-shot datalist must be removed');
assert.match(invoiceSource,/getElementById\('cloudICompany'\)\.onchange=function\(\)/,'changing the dropdown must replace the selected contact');
assert.match(invoiceSource,/localeCompare\(String\(b\.name\|\|''\),'mn',\{sensitivity:'base'\}\)/,'the direct invoice contact dropdown must be alphabetical in Mongolian');
assert.match(invoiceSource,/window\.openDirectInvoice=function\(\)\{window\.invoice\(null\);\}/);
assert.match(invoiceSource,/if\(directInvoiceMode\)/,'saving a direct invoice must resolve and validate its selected contact');
assert.match(invoiceSource,/ПАДААН БҮРТГЭХ/,'the existing direct registration action must remain available');

console.log('home-direct-invoice: PASS — compact Home actions and direct invoice entry are wired');
