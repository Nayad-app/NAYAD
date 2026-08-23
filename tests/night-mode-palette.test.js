const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

assert.match(source,/html\.nightMode\{--bg:#1A1B1A;--surface:#252624;--surface-2:#2D2E2B;--text:#F0F0EB;--muted:#AAAFA9;--line:#3A3B38/);
assert.match(source,/html\.nightMode header\{background:rgba\(32,33,31,\.94\)/);
assert.match(source,/html\.nightMode \.modal\{background:rgba\(8,9,8,\.36\)/);
assert.doesNotMatch(source,/html\.nightMode\{--bg:#141413/);

console.log('night-mode-palette: PASS — approved low-glare charcoal surfaces are wired globally');
