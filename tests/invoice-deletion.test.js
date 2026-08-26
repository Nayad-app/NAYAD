const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'payment-center.js'),'utf8');
const migration=[
  '20260826073149_delete_invoice_with_history.sql',
  '20260826074332_support_legacy_invoice_image_cleanup.sql'
].map(file=>fs.readFileSync(path.join(root,'supabase','migrations',file),'utf8')).join('\n');

assert.match(source,/class="invoiceDetailActions"[\s\S]*window\.editConfirmedInvoice[\s\S]*window\.showInvoiceDeleteConfirm/,'edit and delete must stay side by side');
assert.match(source,/id="confirmInvoiceDeleteBtn"[\s\S]*disabled[\s\S]*УСТГАХ \(2\)/,'destructive confirmation must begin with a disabled two-second countdown');
assert.match(source,/invoiceDeleteCountdownTimer=setInterval[\s\S]*,1000\)/,'the confirmation must count down before enabling deletion');
assert.match(source,/\.rpc\('delete_invoice_with_history',\{p_invoice_id:invoiceId\}\)/,'deletion must use the audited RPC');
assert.match(source,/storage\.from\('invoice-images'\)\.remove/,'Storage objects must be removed through the Storage API');
assert.match(source,/reason:'invoice-deleted'/,'deletion must force a cloud refresh');
assert.match(source,/Энэ падаан болон түүнтэй холбоотой зураг, төлбөр, засварын түүх бүрмөсөн устна/);

assert.match(migration,/security definer\s+set search_path = ''/i,'the RPC must use a hardened search path');
assert.match(migration,/coalesce\(v_role,''\) not in \('owner','manager'\)/,'missing memberships and non-finance roles must both be rejected');
assert.match(migration,/delete from public\.payment_allocations pa where pa\.invoice_id=v_invoice\.id/,'only the target invoice allocation may be removed');
assert.match(migration,/set amount=v_remaining_cash,invoice_id=null/,'shared payment totals must be reduced to their remaining allocations');
assert.match(migration,/if not exists \([\s\S]*payment_allocations[\s\S]*delete from public\.payments/,'payments with no remaining allocations must be deleted');
assert.match(migration,/delete from public\.finance_audit_events fae[\s\S]*fae\.entity_type='invoice'/,'invoice audit details must be removed');
assert.match(migration,/storage_paths text\[\]/,'Storage paths must be returned to the browser');
assert.match(migration,/for delete to authenticated[\s\S]*bucket_id='invoice-images'[\s\S]*sm\.role in \('owner','manager'\)/,'Storage deletion must be scoped to finance managers in the matching store folder');
assert.match(migration,/'invoice_deletion',v_invoice\.id,'deleted'/,'legacy cleanup may retain only a metadata-free deletion tombstone');
assert.match(migration,/fae\.entity_id::text=any\(storage\.foldername\(name\)\)/,'legacy image paths must be authorized by the deleted invoice UUID');
assert.match(migration,/revoke execute on function public\.delete_invoice_with_history\(uuid\) from public,anon/);

const invoice={id:'11111111-1111-4111-8111-111111111111',no:'INV-DELETE',date:'2026-08-01',due_date:'2026-08-30',amount:1500000,paid:455000,status:'confirmed',image_paths:['store/supplier/invoice/page-1.jpg']};
const state={companies:[{id:7,supabase_supplier_id:'22222222-2222-4222-8222-222222222222',name:'Delete Supplier',invoices:[invoice]}],payments:[]};
const elements={
  modal:{classList:{toggle(){}},id:'modal'},sheet:{classList:{toggle(){}},id:'sheet'},
  confirmInvoiceDeleteBtn:{disabled:false,textContent:''}
};
const rpcCalls=[],removedPaths=[],syncReasons=[],notices=[];
let sheetHtml='';
const context={
  console,Intl,Date,Number,String,Math,JSON,Promise,crypto:webcrypto,
  URL:{createObjectURL:()=>'',revokeObjectURL(){}},navigator:{},Notification:{permission:'denied'},
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
  document:{visibilityState:'visible',head:{appendChild(){}},createElement:()=>({textContent:''}),addEventListener(){},querySelectorAll:()=>[],getElementById:id=>elements[id]||null}
};
context.window=context;
context.window.addEventListener=()=>{};
context.window.__nayadState={read:()=>state};
context.window.__nayadActiveStoreId='33333333-3333-4333-8333-333333333333';
context.window.sheet=html=>{sheetHtml=html;};
context.window.closeSheet=()=>{};
context.window.toast=message=>notices.push(message);
context.window.__nayadStartCloudSync=async options=>syncReasons.push(options.reason);
context.window.nayadSupabase={
  rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:[{invoice_id:invoice.id,storage_paths:['store/supplier/invoice/page-1.jpg']}],error:null};},
  from:()=>({select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});}}),
  storage:{from:()=>({remove:async paths=>{removedPaths.push(...paths);return {error:null};}})}
};

vm.createContext(context);
vm.runInContext(`let data=${JSON.stringify(state)};let page='companies';let selected=null;function render(){}function payments(){}function reports(){}function company(){}function payment(){}function sync(){}`,context);
vm.runInContext(source,context,{filename:'payment-center.js'});

context.window.showInvoiceDeleteConfirm(invoice.id);
assert.match(sheetHtml,/Падаан устгах уу\?/);
assert.match(sheetHtml,/INV-DELETE/);

(async()=>{
  await context.window.deleteInvoiceWithHistory(invoice.id);
  assert.equal(rpcCalls.length,1);
  assert.equal(rpcCalls[0].name,'delete_invoice_with_history');
  assert.equal(rpcCalls[0].args.p_invoice_id,invoice.id);
  assert.deepEqual(removedPaths,['store/supplier/invoice/page-1.jpg']);
  assert.deepEqual(syncReasons,['invoice-deleted']);
  assert.equal(vm.runInContext('data.companies[0].invoices.length',context),0,'the deleted invoice must disappear immediately');
  assert.match(notices.at(-1),/холбогдох түүх устгагдлаа/);
  console.log('invoice-deletion: PASS — guarded UI, secure RPC and Storage cleanup are wired together');
})().catch(error=>{console.error(error);process.exitCode=1;});
