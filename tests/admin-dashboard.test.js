const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'admin-dashboard.js'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase','functions','admin-dashboard','index.ts'),'utf8');
const config=fs.readFileSync(path.join(root,'supabase','config.toml'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const migrationFiles=fs.readdirSync(path.join(root,'supabase','migrations'));
const migrationFile=migrationFiles.find(file=>/system_admin_dashboard\.sql$/.test(file));
const migrations=migrationFiles.map(file=>fs.readFileSync(path.join(root,'supabase','migrations',file),'utf8')).join('\n');

assert.ok(migrationFile,'system administrator migration must be versioned');
const migration=fs.readFileSync(path.join(root,'supabase','migrations',migrationFile),'utf8');

// The role is server-owned and cannot be granted or enumerated by normal clients.
assert.match(migration,/create table if not exists public\.system_admins/i);
assert.match(migration,/user_id uuid primary key references auth\.users\(id\) on delete cascade/i);
assert.match(migration,/alter table public\.system_admins enable row level security/i);
assert.match(migration,/revoke all on table public\.system_admins from public, anon, authenticated/i);
assert.match(migration,/grant select on table public\.system_admins to service_role/i);
assert.match(migration,/from public\.phone_login_accounts[\s\S]*phone\s*=\s*'\+97699000031'/i,'the approved account must be bootstrapped once on the server');
assert.match(migrations,/grant select \(id, full_name, phone, created_at\)[\s\S]{0,100}on table public\.profiles[\s\S]{0,50}to service_role/i,'the dashboard server must be able to read profile summaries');
assert.match(migrations,/grant select \([\s\S]{0,220}registration_completed_at[\s\S]{0,100}on table public\.stores[\s\S]{0,50}to service_role/i,'the dashboard server must be able to read registration summaries');
assert.doesNotMatch(source,/99000031/,'the browser must never authorize an administrator by phone number');
assert.doesNotMatch(edge,/99000031/,'the Edge Function must authorize by the server-owned role, not by phone number');

// Every dashboard request is independently authenticated and authorized before service-role reads.
assert.match(edge,/admin\.auth\.getUser\(token\)/);
assert.match(edge,/from\("system_admins"\)[\s\S]{0,300}\.eq\("user_id", user\.id\)/);
assert.match(edge,/code: "UNAUTHORIZED"/);
assert.match(edge,/code: "FORBIDDEN"|code: "ADMIN_REQUIRED"/);
assert.match(edge,/Cache-Control": "no-store"/);
assert.doesNotMatch(edge,/\.insert\(|\.update\(|\.delete\(/,'the approved dashboard endpoint must remain read-only');
assert.match(config,/\[functions\.admin-dashboard\]\s*verify_jwt\s*=\s*true/);

// The feature remains inside Profile and is included in the installed PWA shell.
assert.match(index,/\.\/profile-menu\.js\?v=5[\s\S]*\.\/admin-dashboard\.js\?v=1/);
assert.match(sw,/\.\/admin-dashboard\.js\?v=1/);
assert.match(source,/Админы удирдлага/);
assert.match(source,/Хэрэглэгч ба бүртгэл/);
assert.match(source,/Багцын удирдлага/);
assert.match(source,/Төлбөрийн түүх/);
assert.doesNotMatch(source,/>\s*(?:Устгах|Засах)\s*</,'admin screens must not expose unapproved mutation controls');

function classList(hidden=false){
  const values=new Set(hidden?['hide']:[]);
  return {add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value)};
}

function harness(allowed){
  const appended=[];
  const requests=[];
  const modal={classList:classList(false)};
  const sheet={
    querySelector:()=>null,
    querySelectorAll:()=>[],
    appendChild:element=>appended.push(element),
    insertBefore:element=>appended.push(element)
  };
  const body={classList:classList(),appendChild(){}};
  const context={
    console,Date,Intl,Set,Map,Promise,JSON,
    SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY:'publishable-key',
    fetch:async(url,options)=>{
      requests.push({url:String(url),options});
      return {ok:allowed,status:allowed?200:403,json:async()=>allowed?{is_admin:true}:{error:'Админы эрх шаардлагатай.'}};
    },
    requestAnimationFrame:fn=>{fn();return 1;},
    setTimeout:fn=>{fn();return 1;},
    document:{
      head:{insertAdjacentHTML(){}},body,
      addEventListener(){},querySelector(){return null;},
      getElementById:id=>id==='modal'?modal:id==='sheet'?sheet:null,
      createElement:()=>({
        type:'',className:'',style:{},innerHTML:'',listeners:{},
        addEventListener(type,handler){this.listeners[type]=handler;},
        setAttribute(){}
      })
    }
  };
  context.window=context;
  context.window.__nayadUser={id:'admin-user'};
  context.window.showProfileDetails=async()=>{};
  context.window.nayadSupabase={auth:{getSession:async()=>({data:{session:{access_token:'user-jwt'}},error:null})}};
  context.window.sb=context.window.nayadSupabase;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'admin-dashboard.js'});
  return {context,appended,requests};
}

(async()=>{
  const admin=harness(true);
  await admin.context.window.showProfileDetails();
  assert.equal(admin.requests.length,1,'opening Profile must perform a server-side access check');
  assert.match(admin.requests[0].url,/\/functions\/v1\/admin-dashboard$/);
  assert.equal(admin.requests[0].options.headers.Authorization,'Bearer user-jwt');
  assert.deepEqual(JSON.parse(admin.requests[0].options.body),{action:'access'});
  assert.equal(admin.appended.length,1,'an authorized user must receive the hidden Profile entry');
  assert.match(admin.appended[0].innerHTML,/Админы удирдлага/);

  const ordinary=harness(false);
  await ordinary.context.window.showProfileDetails();
  assert.equal(ordinary.appended.length,0,'an ordinary user must not see the administrator entry');

  console.log('admin-dashboard: PASS — server-authorized read-only admin views stay inside Profile');
})().catch(error=>{console.error(error);process.exitCode=1;});
