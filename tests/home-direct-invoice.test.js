const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const indexSource=fs.readFileSync(path.join(root,'index.html'),'utf8');
const contactSource=fs.readFileSync(path.join(root,'contact-types.js'),'utf8');
const invoiceSource=fs.readFileSync(path.join(root,'invoice-cloud.js'),'utf8');
const paymentSource=fs.readFileSync(path.join(root,'payment-center.js'),'utf8');

assert.match(indexSource,/id="homeQuickActionToggle"[^>]+aria-haspopup="menu"[^>]+onclick="toggleHomeQuickActions\(event\)"/,'Home plus must open the compact action menu');
assert.match(indexSource,/class="homeQuickActionPayment"[^>]+onclick="closeHomeQuickActions\(\);window\.payment\(\)"[^>]*>[\s\S]*?Төлбөр бүртгэх/,'the first quick action must open direct payment registration');
assert.match(indexSource,/class="homeQuickActionInvoice"[^>]+onclick="closeHomeQuickActions\(\);window\.invoice\(null\)"[^>]*>[\s\S]*?Падаан нэмэх/,'the second quick action must open direct invoice registration');
assert.match(contactSource,/\.homeQuickActionMenu\{position:absolute/,'the approved actions must stay in a small anchored popover');
assert.match(contactSource,/if\(!event\.target\?\.closest\?\.\('\.homeQuickActions'\)\)closeHomeQuickActions/,'outside taps must close the quick-action popover');
assert.match(contactSource,/closeHomeQuickActions\(true\)/,'Escape must close the popover and return focus to the plus button');
assert.match(indexSource,/supplier\?"ЯАРАЛТАЙ АВЛАГА":"ЯАРАЛТАЙ ӨГЛӨГ"/,'urgent heading must follow the registration direction');
assert.match(indexSource,/onclick="showHomeDebtView\('all'\)"/,'debt-contact summary must reveal all debt contacts');
assert.match(indexSource,/onclick="showHomePeriodFilter\(\)"/,'payment-period summary must open the approved centered filter');
assert.match(contactSource,/const quickRows=\[\['all','Бүгд'\],\['next7'/,'the approved five quick filters must remain in the title row');
for(const label of ['Өнөөдөр','3 хоногт','7 хоногт','14 хоногт','Энэ сард','Огноо сонгох'])assert.match(contactSource,new RegExp(label));
assert.match(contactSource,/className='homePeriodOverlay hide'/,'the payment-period picker must use its own centered overlay');
assert.match(contactSource,/align-items:center;justify-content:center/,'the payment-period picker must be centered, not a bottom sheet');
assert.match(contactSource,/id="homePeriodStart" type="date"/,'custom period must include a start date');
assert.match(contactSource,/id="homePeriodEnd" type="date"/,'custom period must include an end date');

assert.match(invoiceSource,/id="cloudICompanySearch" type="text"[^>]+role="combobox"/,'direct invoice form must use an editable searchable combobox');
assert.match(invoiceSource,/id="cloudICompany" type="hidden"/,'the selected contact id must be stored separately from the search text');
assert.match(invoiceSource,/id="cloudICompanyOptions" class="cloudInvoiceCompanyOptions" role="listbox" hidden/,'matching contacts must open directly below the field');
assert.doesNotMatch(invoiceSource,/<select id="cloudICompany"|<datalist/,'the iPhone native select and one-shot datalist must not be used');
assert.match(invoiceSource,/window\.__filterCloudInvoiceCompanies=function\(\)/,'typing must filter the contact list');
assert.match(invoiceSource,/window\.__selectCloudInvoiceCompany=function\(id\)/,'tapping a result must select the contact');
assert.match(invoiceSource,/\.cloudInvoiceCompanyOptions\{position:absolute;left:0;right:0;top:calc\(100% \+ 5px\)/,'the results must stay anchored below the customer field without a second modal');
assert.match(invoiceSource,/localeCompare\(String\(b\.name\|\|''\),'mn',\{sensitivity:'base'\}\)/,'the direct invoice contact dropdown must be alphabetical in Mongolian');
assert.match(invoiceSource,/window\.openDirectInvoice=function\(\)\{window\.invoice\(null\);\}/);
assert.match(invoiceSource,/if\(directInvoiceMode\)/,'saving a direct invoice must resolve and validate its selected contact');
assert.match(invoiceSource,/ПАДААН БҮРТГЭХ/,'the existing direct registration action must remain available');
assert.match(paymentSource,/if\(companyId==null\|\|companyId===''\)\{directPaymentForm\(\);return;\}/,'direct payment must first open the supplier picker');
assert.match(paymentSource,/id="directPaymentCompany"/,'direct payment must provide a supplier dropdown');
assert.match(paymentSource,/window\.openSelectedPayment=function\(\)/,'the selected supplier must continue into the existing payment form');

console.log('home-direct-invoice: PASS — compact Home actions open direct payment and invoice registration');
