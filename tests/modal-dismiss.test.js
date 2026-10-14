const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function setup(mode){
  let closes=0;
  const modal={classList:{contains:name=>name===mode}};
  const context=vm.createContext({closeSheet:()=>closes++});
  const start=source.indexOf('function dismissSheetFromBackdrop(');
  vm.runInContext(source.slice(start,source.indexOf('window.closeSheet=',start)),context);
  return {modal,click:target=>context.dismissSheetFromBackdrop({target,currentTarget:modal}),closes:()=>closes};
}
test('invoice input clicks and retargeted backdrop clicks preserve the form',()=>{
  const h=setup('invoiceFormModal');
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

test('payment selection, amount entry and confirmation resist backdrop dismissal',()=>{
  const h=setup('paymentFormModal');
  for(const tagName of ['SELECT','INPUT','TEXTAREA'])h.click({tagName});
  h.click(h.modal);assert.equal(h.closes(),0);
});
test('payment protection is cleared when another sheet opens or the user closes',()=>{
  const nodes={};
  for(const id of ['sheet','modal']){
    const classes=new Set(['paymentFormModal']);
    nodes[id]={innerHTML:'',classList:{contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x)}};
  }
  const ctx=vm.createContext({window:{},document:{getElementById:id=>nodes[id]}});
  const start=source.indexOf('function sheet(s)');
  vm.runInContext(source.slice(start,source.indexOf('function dismissSheetFromBackdrop',start)),ctx);
  ctx.sheet('<p>Other dialog</p>');
  assert.equal(nodes.modal.classList.contains('paymentFormModal'),false);
  nodes.modal.classList.add('paymentFormModal');ctx.closeSheet();
  assert.equal(nodes.modal.classList.contains('hide'),true);
  assert.equal(nodes.modal.classList.contains('paymentFormModal'),false);
});
