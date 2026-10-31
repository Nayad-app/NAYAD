const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('remembered-login.js','utf8');
function setup(storage=new Map()){
 const fields={loginPhone:{value:''},loginPassword:{value:''},rememberMe:{checked:false}};
 const c={document:{getElementById:id=>fields[id]},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},navigator:{},Promise};c.window=c;vm.runInNewContext(source,c);
 return {api:c.__nayadRememberLogin,fields,storage};
}
test('only successful opted-in account replaces remembered credentials',()=>{
 const {api,fields,storage}=setup();
 api.restore();assert.equal(fields.rememberMe.checked,false);
 api.success('first','password-one',true);api.restore();
 assert.equal(fields.loginPhone.value,'first');assert.equal(fields.loginPassword.value,'password-one');assert(fields.rememberMe.checked);
 fields.loginPhone.value='second';api.edited();assert.equal(fields.rememberMe.checked,false);
 api.success('second','password-two',false);api.restore();
 assert.equal(fields.loginPhone.value,'first');assert.equal(fields.loginPassword.value,'password-one');
 api.success('second','password-two',true);api.restore();
 assert.equal(fields.loginPhone.value,'second');assert.equal(fields.loginPassword.value,'password-two');
 assert.equal([...storage.values()].some(v=>v.includes('password')),false);
});
test('editing either saved field unchecks; repeated restore never overwrites edits',()=>{
 for(const id of ['loginPhone','loginPassword']){
 const {api,fields}=setup();api.success('first','secret',true);api.restore();
 fields[id].value='';api.edited();assert.equal(fields.rememberMe.checked,false);
 api.restore();assert.equal(fields[id].value,'');
 fields.rememberMe.checked=true;fields[id].value='new';api.edited();
 assert.equal(fields.rememberMe.checked,true,'new user explicitly controls checkbox');
 }
});
test('reload retains last username without persisting password',()=>{
 const {api,storage}=setup();api.success('first','secret',true);
 const next=setup(storage);next.api.restore();
 assert.equal(next.fields.loginPhone.value,'first');assert.equal(next.fields.loginPassword.value,'');
 assert.equal(next.fields.rememberMe.checked,true);
});
test('failed login does not invoke success persistence',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const login=html.slice(html.indexOf('async function phoneLogin(){'),html.indexOf('async function registerUser'));
 assert(login.indexOf('__nayadRememberLogin?.success')>login.indexOf('if(!opened)throw'));
 assert(login.indexOf('__nayadRememberLogin?.success')<login.indexOf('}catch(e)'));
 const guard=fs.readFileSync('auth-guard.js','utf8');
 assert(!guard.slice(guard.indexOf('window.logoutNayad='),guard.indexOf('async function reconcile')).includes('localStorage.removeItem'));
});
