const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const subscription=html.match(/sb\.auth\.onAuthStateChange\([^;]+\);/)?.[0]||'';

assert.match(
  subscription,
  /onAuthStateChange\(\(event,session\)=>setTimeout\(\(\)=>handleAuthStateChange\(event,session\),0\)\)/,
  'the auth callback must return before any Supabase-backed app preparation starts'
);
assert.doesNotMatch(
  subscription,
  /showAuthenticatedApp|handleEmailConfirmation|\.rpc\(|\.from\(/,
  'no asynchronous Supabase work may run directly inside onAuthStateChange'
);
assert.match(html,/function handleAuthStateChange\(event,session\).*showAuthenticatedApp\(\)/s);

console.log('auth-deadlock: PASS — Supabase work is deferred until the auth callback returns');
