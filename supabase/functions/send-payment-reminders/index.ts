import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false,autoRefreshToken:false}});
function allowedEndpoint(value:string):boolean {
 try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && !u.port &&
  (u.hostname==='fcm.googleapis.com' || u.hostname==='updates.push.services.mozilla.com' || /^[a-z0-9.-]+\.push\.apple\.com$/.test(u.hostname)); } catch { return false; }
}
async function equalSecret(a:string,b:string):Promise<boolean>{
 const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [x,y]=await Promise.all([digest(a),digest(b)]);let different=0;for(let i=0;i<x.length;i++)different|=x[i]^y[i];return different===0;
}
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const bearer=req.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return new Response('Unauthorized',{status:401});
 const {data:config,error:configError}=await client.rpc('push_server_config');
 if(configError||!config?.cronToken)return new Response('Not configured',{status:503});
 // verify_jwt=false is intentional: the scheduler uses a separate Vault-backed secret.
 if(!await equalSecret(bearer.slice(7),config.cronToken))return new Response('Unauthorized',{status:401});
 // Health check validates key generation and crypto without reading financial data or sending a push.
 const input=await req.json().catch(()=>({}));
 if(input.health===true){
  try{webpush.getVapidHeaders('https://fcm.googleapis.com', 'https://nayad.store',config.publicKey,config.privateKey,'aes128gcm');}
  catch{return new Response('Invalid keys',{status:503});}
  return Response.json({configured:true});
 }
 const {data:jobs,error}=await client.rpc('claim_push_reminders');
 if(error)return new Response('Unable to claim reminders',{status:500});
 let accepted=0,failed=0;
 // Bounded concurrency; never log endpoints, keys or reminder contents.
 for(let offset=0;offset<(jobs||[]).length;offset+=5){
  await Promise.all(jobs.slice(offset,offset+5).map(async(job:any)=>{
   let status=400;
   if(allowedEndpoint(job.endpoint))try{
    const details=webpush.generateRequestDetails({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth}},JSON.stringify(job.payload),{
     TTL:3600,urgency:'normal',vapidDetails:{subject:'https://nayad.store',publicKey:config.publicKey,privateKey:config.privateKey}
    });
    const response=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});
    status=response.status;await response.body?.cancel();
   }catch{status=503;}
   const {error:ackError}=await client.rpc('finish_push_reminder',{p_id:job.delivery_id,p_token:job.claim_token,p_status:status});
   if(status>=200&&status<300&&!ackError)accepted++;else failed++;
  }));
 }
 return Response.json({accepted,failed});
});
