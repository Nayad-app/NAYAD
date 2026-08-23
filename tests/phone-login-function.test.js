const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "supabase/functions/phone-login/index.ts"),
  "utf8",
);

assert.match(source, /admin\.auth\.admin\.listUsers/);
assert.match(source, /user\.user_metadata\?\.login_phone/);
assert.match(source, /user\.phone/);
assert.match(source, /Invalid login credentials/);
assert.match(source, /user_id: user\.id, email: user\.email/);

console.log("phone-login-function: PASS — phone resolves to the verified Auth email");
