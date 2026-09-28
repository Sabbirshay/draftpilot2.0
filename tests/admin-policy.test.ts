import test from "node:test";
import assert from "node:assert/strict";
import { isGoogleAdministrator } from "../packages/shared/src/admin-policy";
const user = {email:"mdronykhan4633@gmail.com", email_confirmed_at:"2026-09-27", app_metadata:{platform_admin:true},identities:[{provider:"google"}]};
const oauth = {amr:[{method:"oauth"}]};
test("administrator requires exact identity, server role, and OAuth session", () => {
  assert.equal(isGoogleAdministrator(user,oauth),true);
  assert.equal(isGoogleAdministrator({...user,email:"other@gmail.com"},oauth),false);
  assert.equal(isGoogleAdministrator({...user,app_metadata:{}},oauth),false);
  assert.equal(isGoogleAdministrator({...user,identities:[]},oauth),false);
  assert.equal(isGoogleAdministrator({...user,email_confirmed_at:undefined},oauth),false);
  assert.equal(isGoogleAdministrator(user,{amr:[{method:"password"},{method:"totp"}]}),false);
  assert.equal(isGoogleAdministrator(user,{amr:[{method:"recovery"}]}),false);
});
