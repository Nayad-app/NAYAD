const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const hub=fs.readFileSync(path.join(root,'staff-hub.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261016070800_expose_staff_phone_in_hub.sql'),'utf8');

assert.match(html,/staff-hub\.js\?v=2/,'the live app must load the phone-enabled staff hub');
assert.match(sw,/staff-hub\.js\?v=2/,'the installed app must cache the phone-enabled staff hub');
assert.match(hub,/staff_hub_contacts/,'the chat list must fetch store-scoped employee phone numbers');
assert.match(hub,/href="tel:\+976/,'the call control must use a direct Mongolia telephone link');
assert.match(hub,/class="hubChatOpen"/,'the employee name area must remain a separate chat target');
assert.match(migration,/e\.store_id=v_store and e\.active/,'phone lookup must stay inside the authorized active store');
assert.match(migration,/c\.device_hash=encode\(extensions\.digest/,'employee access must verify the saved device credential');
assert.match(migration,/m\.role='owner'/,'owner access must require store ownership');
assert.doesNotMatch(migration,/service_role/,'the browser must not depend on a service-role key');

console.log('staff-hub: PASS — employee phones stay store-scoped, names open chat and call icons use tel links');
