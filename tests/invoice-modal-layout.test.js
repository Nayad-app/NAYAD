const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const indexSource=fs.readFileSync(path.join(root,'index.html'),'utf8');
const invoiceSource=fs.readFileSync(path.join(root,'invoice-cloud.js'),'utf8');

assert.match(invoiceSource,/classList\.add\('invoiceFormModal'\)/,'invoice form must opt into the centered modal backdrop');
assert.match(invoiceSource,/classList\.add\('invoiceFormSheet'\)/,'invoice form must opt into the compact modal sheet');
assert.match(indexSource,/\.modal\.invoiceFormModal\{align-items:center/,'invoice modal must be centered over the visible app');
assert.match(indexSource,/\.sheet\.invoiceFormSheet\{[^}]+border-radius:24px/,'invoice form must look like a separate rounded window');
assert.match(indexSource,/\.invoiceFormSheet \.field\{margin:6px 0\}/,'invoice fields must use the approved compact spacing');
assert.match(indexSource,/\.invoiceFormSheet \.actions\{position:sticky/,'register actions must stay visible when attached images make the form taller');
assert.match(indexSource,/function closeSheet\(\)\{[^}]+classList\.remove\("invoiceFormModal"\)[^}]+classList\.remove\("invoiceFormSheet"\)/,'closing the invoice must not leak its layout into other sheets');

console.log('invoice-modal-layout: PASS — the invoice form is compact, centered, isolated, and keeps actions visible');
