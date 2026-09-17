const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const migrations=fs.readdirSync(path.join(root,'supabase','migrations'))
  .filter(name=>/contact_logos\.sql$/.test(name));
assert.equal(migrations.length,1,'one contact logo migration must be versioned');
const sql=fs.readFileSync(path.join(root,'supabase','migrations',migrations[0]),'utf8');

assert.match(sql,/alter table public\.suppliers[\s\S]*add column if not exists logo_path text/i);
assert.match(sql,/insert into storage\.buckets[\s\S]*'contact-logos'[\s\S]*false/i,'contact logos must use a private bucket');
assert.match(sql,/file_size_limit[\s\S]*2097152/i);
for(const mime of ['image/jpeg','image/png','image/webp'])assert.match(sql,new RegExp(mime.replace('/','\\/')));
assert.match(sql,/for select to authenticated[\s\S]*has_store_permission[\s\S]*'customers'[\s\S]*'view'/i);
assert.match(sql,/for insert to authenticated[\s\S]*has_store_permission[\s\S]*'customers'[\s\S]*'edit'/i);
assert.match(sql,/for delete to authenticated[\s\S]*has_store_permission[\s\S]*'customers'[\s\S]*'edit'/i);
assert.match(sql,/storage\.foldername\(name\)\)\[1\][\s\S]*::uuid/i,'RLS must bind the first logo path folder to the active store UUID');
assert.doesNotMatch(sql,/to anon|to public/i,'anonymous users must not receive logo object policies');

console.log('contact-logo-migration: PASS — private bucket policies follow customer view/edit permissions');

