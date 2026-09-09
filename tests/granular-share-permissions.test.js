const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const draft=path.join(root,'granular_share_permissions.sql');
const migrationName=fs.readdirSync(path.join(root,'supabase','migrations')).find(name=>name.endsWith('_granular_store_member_permissions.sql'));
const migration=fs.readFileSync(fs.existsSync(draft)?draft:path.join(root,'supabase','migrations',migrationName),'utf8');
const storeSource=fs.readFileSync(path.join(root,'store-switcher.js'),'utf8');
const shareSource=fs.readFileSync(path.join(root,'share.js'),'utf8');
const invoiceSource=fs.readFileSync(path.join(root,'invoice-cloud.js'),'utf8');

test('member and invite rows keep normalized module permissions',()=>{
  assert.match(migration,/alter table public\.store_members[\s\S]*add column if not exists permissions jsonb not null/i);
  assert.match(migration,/alter table public\.store_invites[\s\S]*add column if not exists permissions jsonb not null/i);
  assert.match(migration,/private\.normalize_store_permissions/);
  assert.match(migration,/v_payments = 'edit' and v_invoices = 'none'[\s\S]*v_invoices := 'view'/);
  for(const module of ['customers','invoices','payments','loans'])assert.match(migration,new RegExp(`'${module}'`));
});

test('only owners can change access, remove members, or delete business data',()=>{
  assert.match(migration,/Only the store owner can change member permissions/);
  assert.match(migration,/Only the store owner can remove members/);
  assert.match(migration,/Owner permissions cannot be changed/);
  assert.match(migration,/create policy "Owners can delete suppliers"/);
  assert.match(migration,/create policy "Owners can delete invoices"/);
  assert.match(migration,/create policy "Owners can delete payments"/);
  assert.match(migration,/create policy "Owners can delete loans"/);
});

test('public permission RPCs are authenticated-only and private helpers stay hidden',()=>{
  for(const signature of [
    'create_store_invite_with_permissions\\(uuid,text,jsonb\\)',
    'update_store_member_permissions\\(uuid,uuid,jsonb\\)',
    'remove_store_member\\(uuid,uuid\\)',
    'get_my_stores_with_permissions\\(\\)',
    'get_store_members_with_permissions\\(uuid\\)'
  ]){
    assert.match(migration,new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`,'i'));
    assert.match(migration,new RegExp(`grant execute on function public\\.${signature} to authenticated`,'i'));
  }
  assert.match(migration,/revoke all on function private\.has_store_permission\(uuid,text,text\) from public, anon, authenticated/i);
  assert.match(migration,/Trigger guard closes SECURITY DEFINER bypasses/);
});

test('invoice images become private and the app resolves short-lived signed URLs',()=>{
  assert.match(migration,/update storage\.buckets set public=false where id='invoice-images'/i);
  assert.match(migration,/Permitted members can view invoice image files/);
  assert.match(migration,/Owners can delete invoice image files/);
  assert.match(invoiceSource,/createSignedUrls\(paths,ttl\)/);
  assert.match(invoiceSource,/resolved_url/);
});

test('store and share UI carry the selected permissions',()=>{
  assert.match(storeSource,/get_my_stores_with_permissions/);
  assert.match(storeSource,/window\.__nayadCan=can/);
  assert.match(shareSource,/get_store_members_with_permissions/);
  assert.match(shareSource,/update_store_member_permissions/);
  assert.match(shareSource,/remove_store_member/);
  assert.match(shareSource,/Харахгүй/);
  assert.match(shareSource,/Зөвхөн харах/);
  assert.match(shareSource,/Нэмэх, засах/);
  assert.match(shareSource,/syncStorePermissionControls/);
});

test('browser guard blocks forbidden writes even before the database responds',()=>{
  let invoiceCalls=0;
  const notices=[];
  const context={
    console,Date,
    setTimeout:fn=>{fn();return 1;},
    document:{
      visibilityState:'visible',
      head:{appendChild(){}},
      createElement:()=>({id:'',textContent:''}),
      querySelectorAll:()=>[],
      addEventListener(){}
    }
  };
  context.window=context;
  context.window.addEventListener=()=>{};
  context.window.__nayadCan=(module,action)=>module==='invoices'&&action==='edit';
  context.window.addCompany=()=>{throw new Error('customer write must be blocked');};
  context.window.invoice=()=>{invoiceCalls++;};
  context.window.payment=()=>{throw new Error('payment write must be blocked');};
  context.window.deleteInvoiceWithHistory=()=>{throw new Error('member delete must be blocked');};
  context.window.toast=message=>notices.push(message);
  context.window.render=()=>{};
  context.window.sheet=()=>{};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'member-permissions.js'),'utf8'),context,{filename:'member-permissions.js'});

  context.window.addCompany();
  context.window.invoice();
  context.window.payment();
  context.window.deleteInvoiceWithHistory();
  assert.equal(invoiceCalls,1,'the selected invoice edit permission must remain usable');
  assert.equal(notices.length,3,'two denied edits and one denied delete must explain the restriction');
});
