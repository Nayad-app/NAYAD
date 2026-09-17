const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'responsive-layout.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

assert(
  html.includes('<link rel="stylesheet" href="./responsive-layout.css?v=1">'),
  'the responsive stylesheet must be loaded by the app',
);

const executableCss = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
assert(
  executableCss.startsWith('@media (min-width: 600px)'),
  'responsive overrides must start at 600px so the existing phone UI stays untouched',
);
assert(!css.includes('@media (max-width:'), 'the responsive file must not override phone breakpoints');

assert(css.includes('#app > .bottom'), 'tablet and desktop navigation must reuse the four existing tabs');
assert(css.includes('flex-direction: column'), 'tablet navigation must become a vertical rail');
assert(css.includes('@media (min-width: 1024px)'), 'desktop must have its own denser layout');
assert(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'desktop lists must use the available width');

for (const page of ['home', 'companies', 'payments', 'loans']) {
  assert(html.includes(`data-page="${page}"`), `the ${page} navigation destination must remain available`);
}
assert(
  html.includes('id="profileMenuButton"') && html.includes('onclick="showProfileMenu()"'),
  'the top-right hamburger must keep opening the existing profile menu',
);
assert(sw.includes('"./responsive-layout.css?v=1"'), 'the installed app must cache the responsive stylesheet');

console.log('responsive-layout tests passed');
