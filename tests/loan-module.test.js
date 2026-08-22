const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const projectRoot=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(projectRoot,'loans.js'),'utf8');
const indexSource=fs.readFileSync(path.join(projectRoot,'index.html'),'utf8');
const renderSource=fs.readFileSync(path.join(projectRoot,'render.js'),'utf8');
const profileSource=fs.readFileSync(path.join(projectRoot,'profile-menu.js'),'utf8');
const migrationSource=fs.readFileSync(path.join(projectRoot,'supabase/migrations/20260823100000_add_loan_module.sql'),'utf8');
const hardeningSource=fs.readFileSync(path.join(projectRoot,'supabase/migrations/20260823100100_harden_loan_privileges.sql'),'utf8');

const styles=[];
const context={
  console,Intl,Date,Math,Promise,URL,setTimeout:()=>1,clearTimeout(){},confirm:()=>true,
  crypto:{randomUUID:()=> 'uuid-1'},
  document:{
    visibilityState:'visible',body:{classList:{add(){},remove(){}}},
    head:{appendChild:node=>styles.push(node)},
    createElement:tag=>({tagName:tag,id:'',textContent:'',className:'',innerHTML:'',appendChild(){},remove(){}}),
    getElementById:()=>null,
    addEventListener(){}
  },
  addEventListener(){},
  payments:()=>'<div id="base-payment-center"></div>',
  __nayadActiveStore:{id:'store-1',role:'owner'},
  __nayadActiveStoreId:'store-1'
};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'loans.js'});

assert.equal(typeof context.loans,'function','loan page must be registered');
assert.equal(typeof context.showLoanCreate,'function','loan create screen must be registered');
assert.equal(typeof context.__nayadSyncLoans,'function','cloud runtime must be able to sync loans');
assert.match(context.payments(),/base-payment-center/,'loan module must preserve the supplier payment center');
assert.ok(styles.some(style=>/loanFormOverlay/.test(style.textContent)),'loan styles must be installed');

const annuity=context.__nayadCalculateLoanSchedule({
  principal:12000000,interest:12,startDate:'2026-01-31',term:12
},'annuity',31);
assert.equal(annuity.length,12);
assert.equal(annuity[0].due_date,'2026-02-28','payment day must clamp to the last day of short months');
assert.equal(annuity[1].due_date,'2026-03-31');
assert.equal(Math.round(annuity.reduce((sum,row)=>sum+row.principal_amount,0)),12000000,'schedule principal must fully repay the loan');
assert.ok(annuity.every(row=>row.total_amount===Math.round((row.principal_amount+row.interest_amount)*100)/100));

const equalPrincipal=context.__nayadCalculateLoanSchedule({
  principal:12000000,interest:12,startDate:'2026-01-01',term:12
},'equal_principal',15);
assert.equal(equalPrincipal[0].principal_amount,1000000);
assert.equal(equalPrincipal[11].principal_amount,1000000);
assert.ok(equalPrincipal[0].total_amount>equalPrincipal[11].total_amount,'equal-principal payments must decrease as interest falls');

const navOrder=[...indexSource.matchAll(/class="nav(?: active)?" data-page="([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(navOrder,['home','companies','payments','loans']);
assert.match(indexSource,/>Харилцагч<\/button>/);
assert.match(indexSource,/>Зээл<\/button>/);
assert.match(renderSource,/page==='loans'/);
assert.match(profileSource,/Тайлан/,'reports must move into the hamburger drawer');
assert.match(source,/loanGalleryInput[^>]*multiple/,'phone gallery must support selecting many images');
assert.match(source,/loanPdfInput[^>]*multiple/,'contract PDFs must be accepted');
assert.match(source,/createSignedUrl\(doc\.storage_path,600\)/,'private contracts must use short-lived signed URLs');
assert.match(source,/Зураг авах/);
assert.match(source,/Зургаас сонгох/);
assert.match(source,/PDF оруулах/);

for(const table of ['loans','loan_installments','loan_documents']){
  assert.match(migrationSource,new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(migrationSource,/bucket_id = 'loan-contracts'/);
assert.match(migrationSource,/sm\.role in \('owner', 'manager'\)/);
assert.match(migrationSource,/public false|false,/);
assert.match(hardeningSource,/revoke all .* from anon, authenticated/);
assert.match(hardeningSource,/grant update \(status, paid_amount, paid_at\)/);

console.log('loan-module: PASS — secure loan schedule and multi-file contract flow are wired');
