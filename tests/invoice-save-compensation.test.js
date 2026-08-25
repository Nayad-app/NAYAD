const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

const root=path.resolve(__dirname,'..');

function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}

function createHarness(options={}){
  const userId='user-1';
  const storeId='store-1';
  const supplierId='supplier-1';
  const localKey=`NAYAD_DATA_V4:${userId}:${storeId}`;
  const initial={
    companies:[{id:1,name:'Empty Supplier',supabase_supplier_id:supplierId,invoices:[]}],
    payments:[]
  };
  const storage=new Map([[localKey,JSON.stringify(initial)]]);
  const insertGate=options.gateInvoiceInsert?deferred():null;
  const insertStarted=deferred();
  const state={
    sessionUser:userId,
    invoices:new Set(),
    imageRows:new Set(),
    objects:new Set(),
    uploads:[],
    cleanup:[],
    operationClients:[],
    notices:[]
  };
  const elements={
    cloudGalleryInput:{files:[],value:''},
    cloudCameraInput:{files:[],value:''},
    cloudImageList:{innerHTML:'',style:{},addEventListener(){},querySelectorAll(){return[];}},
    cloudIDate:{value:'2026-08-20'},
    cloudIDueDate:{value:'2026-08-30'},
    cloudINo:{value:'INV-ADV'},
    cloudIAmount:{value:'1000'},
    cloudIDiscount:{value:'0'},
    cloudIDiscountDeadline:{value:''},
    cloudINote:{value:''},
    cloudConfirmInvoiceBtn:{disabled:false,textContent:'ПАДААН БҮРТГЭХ'}
  };

  function makeClient(identity,label){
    function from(table){
      let operation='select';
      const filters=[];
      const query={
        select(){return query;},
        eq(column,value){filters.push([column,value]);return query;},
        limit(){return query;},
        order(){return query;},
        in(column,value){filters.push([column,value]);return query;},
        maybeSingle(){
          return Promise.resolve({
            data:table==='suppliers'?{id:supplierId,name:'Empty Supplier'}:null,
            error:null
          });
        },
        insert(payload){
          operation='insert';
          if(table==='invoice_images')state.imageRows.add(payload.invoice_id);
          return Promise.resolve({error:null});
        },
        update(){operation='update';return query;},
        delete(){operation='delete';return query;},
        then(resolve,reject){
          let result={data:[],error:null};
          if(operation==='delete'){
            state.cleanup.push({label,identity,table,filters:[...filters]});
            if(identity!==userId){
              result={data:null,error:{message:'RLS denied cleanup'}};
            }else if(table==='invoice_images')state.imageRows.clear();
          }
          return Promise.resolve(result).then(resolve,reject);
        }
      };
      return query;
    }

    return {
      from,
      rpc(name,args){
        if(name==='save_invoice_draft'){
          const first=!state.invoices.has(args.p_invoice_id);
          state.invoices.add(args.p_invoice_id);
          if(first){insertStarted.resolve();if(insertGate)return insertGate.promise.then(()=>({data:[{invoice_id:args.p_invoice_id,invoice_status:'draft'}],error:null}));}
          return Promise.resolve({data:[{invoice_id:args.p_invoice_id,invoice_status:'draft'}],error:null});
        }
        if(name==='delete_invoice_draft'){
          state.cleanup.push({label,identity,table:'invoices',filters:[['id',args.p_invoice_id]]});
          if(identity!==userId)return Promise.resolve({data:null,error:{message:'RLS denied cleanup'}});
          state.invoices.delete(args.p_invoice_id);
          return Promise.resolve({data:true,error:null});
        }
        if(name==='confirm_invoice_with_note')return Promise.resolve({data:[{invoice_id:args.p_invoice_id,invoice_status:'confirmed'}],error:null});
        return Promise.resolve({data:null,error:{message:'Unexpected RPC '+name}});
      },
      storage:{
        from:()=>({
          upload:async objectPath=>{
            state.objects.add(objectPath);
            state.uploads.push(objectPath);
            if(options.lostUploadResponseAt===state.uploads.length){
              return {error:{message:'response lost after Storage committed'}};
            }
            return {error:null};
          },
          getPublicUrl:objectPath=>({data:{publicUrl:`https://storage.test/${objectPath}`}}),
          remove:async objectPaths=>{
            state.cleanup.push({label,identity,table:'storage',paths:[...objectPaths]});
            if(identity!==userId)return {error:{message:'RLS denied cleanup'}};
            objectPaths.forEach(objectPath=>state.objects.delete(objectPath));
            return {error:null};
          }
        })
      }
    };
  }

  const sharedClient=makeClient('current-session','shared');
  sharedClient.supabaseUrl='https://example.supabase.co';
  sharedClient.supabaseKey='anon-key';
  sharedClient.auth={
    getSession:async()=>({
      data:{
        session:state.sessionUser
          ?{user:{id:state.sessionUser},access_token:`token-${state.sessionUser}`}
          :null
      },
      error:null
    })
  };

  const context={
    console:{log:console.log,error(){},warn(){}},
    Intl,
    crypto:webcrypto,
    URL:{createObjectURL:file=>`blob:${file.name}`,revokeObjectURL(){}},
    setTimeout:()=>1,
    clearTimeout(){},
    localStorage:{
      getItem:key=>storage.get(key)||null,
      setItem:(key,value)=>storage.set(key,String(value))
    },
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    location:{reload(){}},
    navigator:{},
    document:{
      visibilityState:'visible',
      getElementById:id=>elements[id]||null,
      querySelector:()=>null,
      addEventListener(){},
      body:{style:{}},
      documentElement:{style:{}},
      elementFromPoint(){return null;}
    }
  };
  context.window=context;
  context.window.__nayadUser={id:userId};
  context.window.__nayadActiveStoreId=storeId;
  context.window.__nayadActiveStore={id:storeId};
  context.window.__nayadStoreDataKey=()=>localKey;
  context.window.__nayadGetActiveStore=async()=>({id:storeId});
  context.window.addEventListener=()=>{};
  context.window.sheet=()=>{};
  context.window.closeSheet=()=>{};
  context.window.toast=message=>state.notices.push(message);
  context.window.compressInvoiceImage=async file=>file;
  context.window.nayadSupabase=sharedClient;
  context.window.supabase={
    createClient:(url,key,config)=>{
      state.operationClients.push({url,key,config});
      const token=String(config?.global?.headers?.Authorization||'').replace(/^Bearer token-/,'');
      return makeClient(token,'operation');
    }
  };

  vm.createContext(context);
  vm.runInContext(`
    let data=${JSON.stringify(initial)};
    let selected=null;
    let page='companies';
    function render(){}
  `,context);
  vm.runInContext(fs.readFileSync(path.join(root,'app-state.js'),'utf8'),context,{filename:'app-state.js'});
  vm.runInContext(fs.readFileSync(path.join(root,'invoice-cloud.js'),'utf8'),context,{filename:'invoice-cloud.js'});

  return {
    context,
    elements,
    state,
    insertStarted:insertStarted.promise,
    releaseInvoiceInsert(){insertGate?.resolve();},
    openInvoice(){context.window.invoice(1);},
    addImages(files){
      elements.cloudGalleryInput.files=files;
      elements.cloudGalleryInput.onchange();
    },
    saved(){return JSON.parse(storage.get(localKey));}
  };
}

(async()=>{
  {
    const test=createHarness({gateInvoiceInsert:true});
    test.openInvoice();
    const savePromise=test.context.window.__saveCloudInvoice();
    await test.insertStarted;
    assert.equal(test.state.invoices.size,1,'the old-user invoice must reach the server before the auth switch');

    test.state.sessionUser='user-2';
    test.context.window.__nayadUser={id:'user-2'};
    test.releaseInvoiceInsert();
    await savePromise;

    assert.equal(test.state.operationClients.length,1,'save must create one operation-scoped Supabase client');
    assert.equal(
      test.state.operationClients[0].config.global.headers.Authorization,
      'Bearer token-user-1',
      'the operation client must stay pinned to the session that started the save'
    );
    assert.equal(test.state.invoices.size,0,'the old-user invoice must be compensated after shared auth changes');
    const databaseCleanup=test.state.cleanup.filter(item=>item.table!=='storage');
    assert.deepEqual(databaseCleanup.map(item=>item.table),['invoices']);
    assert.ok(databaseCleanup.every(item=>item.label==='operation'&&item.identity==='user-1'),'cleanup must run as the original user');
    assert.equal(test.saved().companies[0].invoices.length,0,'a rejected cross-user save must not update local state');
    assert.match(test.state.notices.at(-1),/хэрэглэгч солигдсон/);
    assert.equal(test.context.window.__nayadCriticalOperation,undefined);
  }

  {
    const test=createHarness({lostUploadResponseAt:2});
    test.openInvoice();
    test.addImages([
      {name:'page-1.jpg',type:'image/jpeg'},
      {name:'page-2.jpg',type:'image/jpeg'}
    ]);
    await test.context.window.__saveCloudInvoice();

    assert.equal(test.state.uploads.length,2);
    const storageCleanup=test.state.cleanup.find(item=>item.table==='storage');
    assert.ok(storageCleanup,'partial upload failure must invoke Storage cleanup');
    assert.deepEqual(
      storageCleanup.paths,
      test.state.uploads,
      'cleanup must include the path whose success response was lost'
    );
    assert.equal(test.state.objects.size,0,'no uploaded object may remain after compensation');
    assert.equal(test.state.imageRows.size,0,'partial invoice image rows must be deleted');
    assert.equal(test.state.invoices.size,0,'the partial invoice row must be deleted');
    assert.deepEqual(
      test.state.cleanup.filter(item=>item.table!=='storage').map(item=>item.table),
      ['invoice_images','invoices']
    );
    assert.equal(test.saved().companies[0].invoices.length,0);
    assert.match(test.state.notices.at(-1),/2-р зураг/);
    assert.equal(test.context.window.__nayadCriticalOperation,undefined);
  }

  console.log('invoice-save-compensation: PASS — auth changes and ambiguous upload responses clean up with the original session');
})().catch(error=>{console.error(error);process.exitCode=1;});
