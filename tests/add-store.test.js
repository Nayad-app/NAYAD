const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const storeSource=fs.readFileSync(path.join(root,'store-switcher.js'),'utf8');
const onboardingSource=fs.readFileSync(path.join(root,'registration-onboarding.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260911103000_add_registration_directions.sql'),'utf8');

test('store picker opens the approved registration flow',()=>{
  assert.match(storeSource,/Шинэ бүртгэл нэмэх/);
  assert.match(storeSource,/showNayadRegistrationOnboarding\(\{initial:false\}\)/);
  assert.match(onboardingSource,/Та аль чиглэлээр ажилладаг вэ\?/);
  assert.match(onboardingSource,/Хоёр чиглэлээр ажилладаг бол дараа нь нөгөө төрлийн бүртгэл нэмж болно/);
});

test('buyer flow contains the twelve approved categories and Other',()=>{
  for(const label of [
    'Хүнсний дэлгүүр, супермаркет','Ресторан, кафе, баар','Зочид буудал, амралтын газар',
    'Эмийн сан','Барилгын материал','Авто засвар, сэлбэг','Бөөний худалдаа','Аж ахуйн бараа',
    'Гоо сайхан, салон','Цахилгаан бараа, техник','Хувцас, гутал','Үйлдвэрлэл, цех'
  ])assert.ok(onboardingSource.includes(label),label);
  assert.match(onboardingSource,/Үйл ажиллагааныхаа төрлийг бичнэ үү/);
});

test('registration RPC is scoped to the authenticated caller',()=>{
  assert.match(migration,/v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration,/insert into public\.store_members\(store_id, user_id, role\)[\s\S]*values \(v_store_id, v_user_id, 'owner'\)/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/A store with this name already exists/);
  assert.match(migration,/security definer[\s\S]*set search_path = ''/i);
  assert.match(migration,/revoke all on function private\.create_my_registration_impl\(text, text, text, text\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration,/grant execute on function public\.create_my_registration\(text, text, text, text\)[\s\S]*to authenticated/);
});

test('completed buyer onboarding sends only the approved fields and activates the new registration',async()=>{
  const elements=new Map();
  const classList={add(){},remove(){}};
  const document={
    head:{insertAdjacentHTML(){}},
    body:{appendChild(element){elements.set(element.id,element);}},
    createElement:()=>({id:'',className:'',innerHTML:'',remove(){elements.delete(this.id);}}),
    getElementById:id=>elements.get(id)||(['landing','login','app'].includes(id)?{classList}:null),
    querySelector:()=>({toggleAttribute(){}})
  };
  const rpcCalls=[];
  let refreshOptions=null;
  const context={console,document,setTimeout:fn=>{fn();return 1;}};
  context.window=context;
  context.window.nayadSupabase={rpc:async(name,args)=>{
    rpcCalls.push({name,args});
    return {data:{id:'registration-2',name:args.p_name},error:null};
  }};
  context.window.__nayadRefreshStores=async options=>{refreshOptions=options;return [{id:'registration-2'}];};
  context.window.render=()=>{};
  context.window.toast=()=>{};

  vm.createContext(context);
  vm.runInContext(onboardingSource,context,{filename:'registration-onboarding.js'});
  context.window.showNayadRegistrationOnboarding({initial:false});
  assert.match(elements.get('nayadRegistrationRoot').innerHTML,/Нийлүүлэгч/);
  assert.match(elements.get('nayadRegistrationRoot').innerHTML,/Худалдан авагч/);

  context.window.nayadRegistrationChooseRole('buyer');
  context.window.nayadRegistrationContinue();
  assert.match(elements.get('nayadRegistrationRoot').innerHTML,/Хүнсний дэлгүүр, супермаркет/);
  context.window.nayadRegistrationChooseBusinessType('Эмийн сан');
  context.window.nayadRegistrationContinue();
  context.window.nayadRegistrationSetName('Наран эмийн сан');
  context.window.nayadRegistrationContinue();
  assert.match(elements.get('nayadRegistrationRoot').innerHTML,/Бүртгэлээ шалгах/);
  await context.window.nayadRegistrationCreate();

  assert.equal(rpcCalls.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(rpcCalls[0])),{
    name:'create_my_registration',
    args:{p_name:'Наран эмийн сан',p_operation_role:'buyer',p_business_type:'Эмийн сан',p_entity_type:null}
  });
  assert.deepEqual(JSON.parse(JSON.stringify(refreshOptions)),{selectStoreId:'registration-2',sync:true,close:true});
  assert.equal(elements.has('nayadRegistrationRoot'),false);
});
