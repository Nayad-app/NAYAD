const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function setup(invoice){
  let closes=0;
  const modal={classList:{contains:name=>invoice&&name==='invoiceFormModal'}};
  const context=vm.createContext({closeSheet:()=>closes++});
  const start=source.indexOf('function dismissSheetFromBackdrop(');
  vm.runInContext(source.slice(start,source.indexOf('window.closeSheet=',start)),context);
  return {modal,click:target=>context.dismissSheetFromBackdrop({target,currentTarget:modal}),closes:()=>closes};
}
test('invoice input clicks and retargeted backdrop clicks preserve the form',()=>{
  const h=setup(true);
  h.click({tagName:'INPUT'});
  h.click({tagName:'TEXTAREA'});
  // Keyboard/layout changes can finish a pointer gesture on the backdrop.
  h.click(h.modal);
  assert.equal(h.closes(),0);
});
test('other sheets still dismiss on backdrop, never on their content',()=>{
  const h=setup(false);h.click({tagName:'INPUT'});assert.equal(h.closes(),0);
  h.click(h.modal);assert.equal(h.closes(),1);
});
test('explicit invoice cancel and Escape remain available',()=>{
  assert.match(source,/event\.key==="Escape"[^}]+closeSheet\(\)/);
  const invoice=fs.readFileSync(path.join(__dirname,'..','invoice-cloud.js'),'utf8');
  assert.match(invoice,/window\.__cancelCloudInvoice=function\(\).*clearPending\(\);close\(\)/);
});
