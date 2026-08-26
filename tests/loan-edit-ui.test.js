const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.resolve(__dirname,'../loans.js'),'utf8');
const elements=new Map();
const appended=[];
const app={appendChild(node){appended.push(node);elements.set(node.id,node);}};
elements.set('app',app);

function result(data){
  const query={select(){return query},eq(){return query},order(){return Promise.resolve({data,error:null})}};
  return query;
}

const datasets={
  loans:[{id:'loan-1',store_id:'store-1',lender_type:'bank',lender_name:'Bank',loan_name:'Business',principal:12000000,annual_interest_rate:18,start_date:'2026-01-31',term_months:12,payment_day:31,repayment_method:'annuity',status:'active',created_at:'2026-01-01'}],
  loan_installments:[
    {id:'row-1',loan_id:'loan-1',store_id:'store-1',installment_number:1,due_date:'2026-02-28',principal_amount:900000,interest_amount:180000,total_amount:1080000,paid_amount:1080000,status:'paid',paid_at:'2026-02-28'},
    {id:'row-2',loan_id:'loan-1',store_id:'store-1',installment_number:2,due_date:'2026-03-31',principal_amount:920000,interest_amount:160000,total_amount:1080000,paid_amount:0,status:'pending',paid_at:null}
  ],
  loan_documents:[]
};

const context={
  console,Intl,Date,Math,Promise,URL,setTimeout:fn=>{if(typeof fn==='function')fn();return 1},clearTimeout(){},confirm:()=>true,
  crypto:{randomUUID:()=> 'uuid-1'},payments:()=>'',toast(){},render(){},closeSheet(){},
  __nayadActiveStore:{id:'store-1',role:'owner'},__nayadActiveStoreId:'store-1',
  nayadSupabase:{from(name){return result(datasets[name]||[])}},
  document:{
    visibilityState:'visible',body:{classList:{add(){},remove(){}}},
    head:{appendChild(){}},
    createElement:tag=>({tagName:tag,id:'',className:'',innerHTML:'',textContent:'',remove(){elements.delete(this.id)}}),
    getElementById:id=>elements.get(id)||null,
    querySelectorAll:()=>[],addEventListener(){}
  },
  addEventListener(){}
};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'loans.js'});

function balancedDivs(html){
  return (html.match(/<div\b/g)||[]).length===(html.match(/<\/div>/g)||[]).length;
}

(async()=>{
  context.showLoanCreate();
  const createHtml=appended.at(-1).innerHTML;
  assert.match(createHtml,/<label>Сарын хүү<\/label>/);
  assert.match(createHtml,/id="loanAnnualInterestPreview"/);
  assert.match(createHtml,/placeholder="1\.5"/);
  assert.ok(balancedDivs(createHtml),'new-loan form markup must be balanced');

  await context.__nayadSyncLoans();
  const pageHtml=context.loans(),cardHtml=pageHtml.slice(pageHtml.indexOf('<article class="loanCard'),pageHtml.indexOf('</article>')+10);
  assert.match(cardHtml,/Дараагийн төлөлт/);
  assert.ok(cardHtml.indexOf('920,000')<cardHtml.indexOf('Нийт үлдэгдэл'),'balance amount must be above its label');
  context.showLoanEdit('loan-1');
  const editHtml=appended.at(-1).innerHTML;
  assert.match(editHtml,/<h1>Зээл засах<\/h1>/);
  assert.match(editHtml,/id="loanInterest"[^>]*value="1\.5"/,'18% annual interest must prefill as 1.5% monthly');
  assert.match(editHtml,/Гэрээний файл хэвээр хадгалагдана/);
  assert.ok(balancedDivs(editHtml),'edit-loan form markup must be balanced');

  console.log('loan-edit-ui: PASS — create/edit forms are balanced and monthly interest is prefilled');
})().catch(error=>{console.error(error);process.exitCode=1});
