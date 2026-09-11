const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const recoverySource=read('store-recovery.js');
const onboardingSource=read('registration-onboarding.js');
const supplierSource=read('supplier-cloud.js');
const invoiceSource=read('invoice-cloud.js');
const cloudSource=read('cloud-runtime.js');
const contactSource=read('contact-types.js');
const html=read('index.html');

function classList(){
  const values=new Set();
  return {
    add:name=>values.add(name),
    remove:name=>values.delete(name),
    contains:name=>values.has(name),
    toggle(name,force){
      if(force===undefined)force=!values.has(name);
      if(force)values.add(name);else values.delete(name);
      return force;
    }
  };
}

test('the shared predicate rejects every incomplete registration',()=>{
  const context={console};
  context.window=context;
  vm.createContext(context);
  vm.runInContext(onboardingSource,context,{filename:'registration-onboarding.js'});

  const complete=context.window.__nayadIsRegistrationComplete;
  assert.equal(typeof complete,'function','all UI and sync gates must share one registration-completeness predicate');
  assert.equal(complete({
    id:'buyer-store',registration_completed_at:'2026-09-11T00:00:00Z',operation_role:'buyer',business_type:'Эмийн сан',entity_type:null
  }),true);
  assert.equal(complete({
    id:'supplier-store',registration_completed_at:'2026-09-11T00:00:00Z',operation_role:'supplier',business_type:null,entity_type:'organization'
  }),true);
  assert.equal(complete({
    id:'incomplete-store',registration_completed_at:null,operation_role:'buyer',business_type:'Эмийн сан',entity_type:null
  }),false,'a row is not complete until onboarding was explicitly finished');
  assert.equal(complete({
    registration_completed_at:'2026-09-11T00:00:00Z',operation_role:'buyer',business_type:'Эмийн сан'
  }),false,'a marker without a registration id must never unlock accounting data');
});

test('store recovery routes an owned placeholder to completion without activating it',async()=>{
  const userId='user-80050800';
  const storeId='legacy-namjildorj';
  const accessToken=`header.${Buffer.from(JSON.stringify({sub:userId})).toString('base64url')}.signature`;
  const placeholder={
    user_id:userId,id:storeId,name:'Namjildorj',role:'owner',permissions:{customers:'edit'},
    operation_role:'buyer',business_type:'',entity_type:'',registration_completed_at:null
  };
  let hydrated=0;
  const context={
    console,Intl,URL,Response,Headers,atob,
    setTimeout:fn=>{fn();return 1;},clearTimeout(){},
    localStorage:{getItem:()=>storeId,setItem(){},removeItem(){}},
    document:{head:{insertAdjacentHTML(){}},getElementById:()=>null,createElement:()=>({})},
    fetch:async url=>{
      assert.ok(String(url).endsWith('/rpc/get_my_registrations'));
      return new Response(JSON.stringify([placeholder]),{status:200,headers:{'content-type':'application/json'}});
    }
  };
  context.window=context;
  context.window.addEventListener=()=>{};
  context.window.__nayadUser={id:userId};
  context.window.__nayadStores=[placeholder];
  context.window.__nayadStoresUserId=userId;
  context.window.__nayadActiveStore=placeholder;
  context.window.__nayadActiveStoreId=storeId;
  context.window.__nayadIsRegistrationComplete=store=>Boolean(
    store?.registration_completed_at&&store.operation_role==='buyer'&&String(store.business_type||'').trim()
  );
  context.window.__nayadHydrateVerifiedStores=()=>{hydrated++;return true;};
  context.window.__nayadClearStoreRuntime=()=>{
    context.window.__nayadStores=[];
    context.window.__nayadStoresUserId='';
    context.window.__nayadActiveStore=null;
    context.window.__nayadActiveStoreId=null;
  };
  context.window.nayadSupabase={auth:{getSession:async()=>({
    data:{session:{user:{id:userId},access_token:accessToken}},error:null
  })}};

  vm.createContext(context);
  vm.runInContext(recoverySource,context,{filename:'store-recovery.js'});
  const ready=await context.window.__nayadPrepareUserStore(userId);

  assert.equal(ready,'needs_registration');
  assert.equal(context.window.__nayadPendingRegistration?.id,storeId,'the existing row must be handed to onboarding for completion');
  assert.equal(context.window.__nayadActiveStore,null,'an incomplete registration must not enter the accounting UI');
  assert.equal(context.window.__nayadActiveStoreId,null);
  assert.equal(hydrated,1,'the incomplete row may be hydrated for the picker, but it must not become active');
});

test('the authenticated-app bridge passes the pending row into onboarding',()=>{
  const start=html.indexOf('async function showAuthenticatedApp(){');
  const end=html.indexOf('async function showLoginScreen()',start);
  assert.ok(start>=0&&end>start,'showAuthenticatedApp must exist');
  const block=html.slice(start,end);
  assert.match(block,/ready\s*===\s*["']needs_registration["']/);
  assert.match(block,/existingRegistration\s*:\s*window\.__nayadPendingRegistration/,
    'a legacy placeholder must be completed rather than replaced by a second registration');
});

test('onboarding completes the same legacy row instead of creating another one',async()=>{
  const elements=new Map();
  const fixedNodes=new Map('landing login app'.split(' ').map(id=>[id,{classList:classList()}]));
  const document={
    head:{insertAdjacentHTML(){}},
    body:{appendChild(element){elements.set(element.id,element);}},
    createElement:()=>({id:'',className:'',innerHTML:'',remove(){elements.delete(this.id);}}),
    getElementById:id=>elements.get(id)||fixedNodes.get(id)||null,
    querySelector:()=>({toggleAttribute(){}})
  };
  const calls=[];
  let refreshOptions=null;
  let authenticatedAppCalls=0;
  const context={console,document,setTimeout:fn=>{fn();return 1;}};
  context.window=context;
  context.window.__nayadPendingRegistration={
    id:'legacy-namjildorj',name:'Namjildorj',role:'owner',operation_role:'buyer',
    business_type:'',entity_type:'',registration_completed_at:null
  };
  context.window.nayadSupabase={rpc:async(name,args)=>{
    calls.push({name,args});
    return {data:{id:'legacy-namjildorj',name:args.p_name},error:null};
  }};
  context.window.__nayadRefreshStores=async options=>{refreshOptions=options;return [{id:'legacy-namjildorj'}];};
  context.window.showAuthenticatedApp=async()=>{authenticatedAppCalls++;return true;};
  context.window.render=()=>{};
  context.window.toast=()=>{};

  vm.createContext(context);
  vm.runInContext(onboardingSource,context,{filename:'registration-onboarding.js'});
  context.window.showNayadRegistrationOnboarding({
    initial:true,existingRegistration:context.window.__nayadPendingRegistration
  });
  context.window.nayadRegistrationChooseRole('buyer');
  context.window.nayadRegistrationContinue();
  context.window.nayadRegistrationChooseBusinessType('Эмийн сан');
  context.window.nayadRegistrationContinue();
  context.window.nayadRegistrationSetName('Намжилдорж эмийн сан');
  context.window.nayadRegistrationContinue();
  await context.window.nayadRegistrationCreate();

  assert.equal(calls.length,1,'completion must be one atomic RPC call');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{
    name:'complete_my_registration',
    args:{
      p_store_id:'legacy-namjildorj',p_name:'Намжилдорж эмийн сан',p_operation_role:'buyer',
      p_business_type:'Эмийн сан',p_entity_type:null
    }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(refreshOptions)),{
    selectStoreId:'legacy-namjildorj',sync:true,close:true
  });
  assert.equal(authenticatedAppCalls,1);
  assert.equal(calls.some(call=>call.name==='create_my_registration'),false,'completion must not create a duplicate registration');
});

test('an incomplete registration cannot open or save the customer form',()=>{
  let sheetCalls=0;
  let saveCalls=0;
  const toasts=[];
  const values={
    newContactType:'organization',newName:'Тест харилцагч',newPhone:'99112233',
    newBank:'ХААН банк',newBankAccount:'5000000000',newBankAccountHolder:'Тест'
  };
  const data={companies:[],payments:[]};
  const document={
    head:{appendChild(){}},
    getElementById:id=>id==='nayadContactTypeStyle'?null:{value:values[id]||'',classList:classList()},
    createElement:()=>({id:'',textContent:''}),
    querySelectorAll:()=>[],
    addEventListener(){}
  };
  const context={
    console,document,data,Intl,
    localStorage:{getItem:()=>null,setItem(){}},
    setTimeout:()=>1,clearTimeout(){},
    sheet:()=>{sheetCalls++;},closeSheet(){},toast:message=>toasts.push(String(message)),
    save:()=>{saveCalls++;},render(){},sync(){},money:n=>String(n),tel:()=>'',
    escapeHtml:value=>String(value??''),bankSelect:()=>'',bankAccountField:()=>'',
    v:id=>values[id]||''
  };
  context.window=context;
  context.window.__nayadActiveStore={
    id:'legacy-namjildorj',role:'owner',operation_role:'buyer',business_type:'',
    registration_completed_at:null
  };
  context.window.__nayadIsRegistrationComplete=()=>false;
  context.window.__nayadPendingRegistration=context.window.__nayadActiveStore;
  context.window.showNayadRegistrationOnboarding=()=>{};
  vm.createContext(context);
  vm.runInContext(contactSource,context,{filename:'contact-types.js'});

  context.window.addCompany();
  assert.equal(sheetCalls,0,'the add-customer sheet must stay closed until registration setup is complete');
  context.window.saveCompany();
  assert.equal(data.companies.length,0,'a direct save call must also be rejected');
  assert.equal(saveCalls,0);
  assert.ok(toasts.length>=1,'the user must receive a clear completion prompt');
});

test('cloud sync is a no-op for an incomplete active row',async()=>{
  let invoiceSyncs=0;
  let supplierSyncs=0;
  let loanSyncs=0;
  const user={id:'user-80050800'};
  const incomplete={
    id:'legacy-namjildorj',role:'owner',operation_role:'buyer',business_type:'',
    registration_completed_at:null
  };
  const context={
    console,
    setTimeout:fn=>{fn();return 1;},clearTimeout(){},setInterval:()=>1,
    document:{visibilityState:'visible',addEventListener(){}},
  };
  context.window=context;
  context.window.addEventListener=()=>{};
  context.window.__nayadUser=user;
  context.window.__nayadStores=[incomplete];
  context.window.__nayadStoresUserId=user.id;
  context.window.__nayadActiveStore=incomplete;
  context.window.__nayadActiveStoreId=incomplete.id;
  context.window.__nayadIsRegistrationComplete=()=>false;
  context.window.__nayadGetActiveStore=async()=>incomplete;
  context.window.__nayadSyncInvoices=async()=>{invoiceSyncs++;};
  context.window.__nayadSyncSuppliers=async()=>{supplierSyncs++;};
  context.window.__nayadSyncLoans=async()=>{loanSyncs++;};
  context.window.nayadSupabase={auth:{getSession:async()=>({data:{session:{user}},error:null})}};
  vm.createContext(context);
  vm.runInContext(cloudSource,context,{filename:'cloud-runtime.js'});

  await context.window.__nayadStartCloudSync({reason:'test',force:true});
  assert.deepEqual({invoiceSyncs,supplierSyncs,loanSyncs},{invoiceSyncs:0,supplierSyncs:0,loanSyncs:0});
});

test('legacy auto-creation is retired in both client and database permissions',()=>{
  assert.doesNotMatch(supplierSource,/\.rpc\(\s*["']ensure_my_store["']/,
    'supplier sync must never auto-create a registration');
  assert.doesNotMatch(invoiceSource,/\.rpc\(\s*["']get_my_store["']/,
    'invoice sync must never fall back to an unverified registration');

  const migrationFiles=fs.readdirSync(path.join(root,'supabase','migrations'))
    .filter(name=>/complete_registration_setup\.sql$/.test(name)).sort();
  assert.ok(migrationFiles.length,'a complete_registration_setup migration must exist');
  const migration=read(path.join('supabase','migrations',migrationFiles.at(-1)));

  assert.match(migration,/registration_completed_at/i);
  assert.match(migration,/complete_my_registration/i);
  assert.match(migration,/auth\.uid\(\)/i,'completion must bind to the authenticated user');
  assert.match(migration,/store_members[\s\S]*role\s*=\s*'owner'/i,'only the registration owner may complete it');
  assert.match(migration,/update\s+public\.stores[\s\S]*where[\s\S]*p_store_id/i,
    'completion must update the exact existing row');
  assert.doesNotMatch(migration,/delete\s+from\s+public\.stores/i,'completion must preserve the existing row and its data');
  const legacyEnsure=migration.match(/create\s+or\s+replace\s+function\s+public\.ensure_my_store\(\)[\s\S]*?\n\$\$;/i)?.[0]||'';
  assert.ok(legacyEnsure,'the legacy RPC must be replaced for already-open cached clients');
  assert.match(legacyEnsure,/security\s+invoker/i);
  assert.match(legacyEnsure,/select[\s\S]*store_members/i);
  assert.doesNotMatch(legacyEnsure,/insert\s+into|update\s+public\.stores|delete\s+from/i,
    'the legacy RPC may read an existing registration but must never create or mutate one');
  assert.match(migration,/revoke\s+all\s+on\s+function\s+public\.complete_my_registration/i);
  assert.match(migration,/grant\s+execute\s+on\s+function\s+public\.complete_my_registration[\s\S]*to\s+authenticated/i);
  assert.doesNotMatch(migration,/grant\s+execute\s+on\s+function\s+public\.complete_my_registration[^;]*to\s+(?:public|anon)/i);
  assert.match(migration,/create_my_registration[\s\S]*registration_completed_at/i,
    'new registrations must be marked complete when their approved onboarding RPC succeeds');
  assert.match(migration,/get_my_registrations[\s\S]*registration_completed_at/i,
    'the client must receive the completion marker when registrations are listed');
  assert.match(migration,/require_completed_registration[\s\S]*registration_completed_at\s+is\s+not\s+null/i,
    'the database must also reject customer writes from an old incomplete client');
});
