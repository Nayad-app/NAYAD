// Runs only in an isolated, in-memory PostgreSQL instance; no Supabase credentials.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
  const root=path.join(__dirname,'..'),db=new PGlite();
  try{
    const fixture=fs.readFileSync(path.join(root,'tests','identity-photo-rls.sql'),'utf8');
    const [setup,checks]=fixture.split('-- APPLY MIGRATION HERE');
    await db.exec(setup);
    await db.exec(fs.readFileSync(path.join(root,'supabase','migrations','20261001025221_identity_photos.sql'),'utf8'));
    await db.exec(checks);
    console.log('identity-photo-rls: PASS — private bucket, owner/member/nonmember permissions and scoped paths');
  }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
