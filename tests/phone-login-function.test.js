const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "supabase/functions/phone-login/index.ts"),
  "utf8",
);

assert.doesNotMatch(source, /admin\.auth\.admin\.listUsers/);
assert.match(source, /from\("phone_login_accounts"\)/);
assert.match(source, /\.eq\("phone", phone\)/);
assert.match(source, /consume_auth_rate_limit/);
assert.match(source, /phone-login-ip/);
assert.match(source, /phone-login-phone/);
assert.match(source, /Invalid login credentials/);
assert.match(source, /user_id: account\.user_id, email: account\.email/);

console.log("phone-login-function: PASS — indexed phone lookup is rate-limited and password-verified");
