const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

assert.match(source,/id="modal" class="modal hide" onclick="dismissSheetFromBackdrop\(event\)"/);
assert.match(source,/function dismissSheetFromBackdrop\(event\)\{if\(event\.target!==event\.currentTarget\)return;closeSheet\(\)\}/);
assert.match(source,/event\.key==="Escape"[^}]+closeSheet\(\)/);

console.log('modal-dismiss: PASS — backdrop and Escape close the sheet without treating sheet taps as backdrop taps');
