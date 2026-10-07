import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {startLocalApi,testBearer,userId}=require("./helpers/local-api.cjs");
test("persistent extension tokens have no expiry and disconnect revokes only the presented token",async()=>{
 const api=await startLocalApi();
 try {
  async function pair(){
   const p=await fetch(api.url+"/extension/pair",{method:"POST",headers:{Authorization:"Bearer "+testBearer}}).then(r=>r.json());
   return fetch(api.url+"/extension/exchange",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:p.code})}).then(r=>r.json());
  }
  const a=await pair(),b=await pair();
  assert.equal(a.expiresIn,null);
  api.user.last_sign_in_at = new Date(Date.now()+60000).toISOString();
  assert.notEqual((await fetch(api.url+"/drafts",{headers:{Authorization:"Bearer "+a.token}})).status,401);
  const rows=await api.db.query("select expires_at from extension_tokens where user_id=$1",[userId]);
  assert.ok(rows.rows.every((r:any)=>r.expires_at===null));
  const response=await fetch(api.url+"/extension/disconnect",{method:"POST",headers:{Authorization:"Bearer "+a.token}});
  assert.equal(response.status,200);
  assert.equal((await api.db.query("select count(*)::int n from extension_tokens where revoked_at is null")).rows[0].n,1);
  assert.equal((await fetch(api.url+"/drafts",{headers:{Authorization:"Bearer "+a.token}})).status,401);
  assert.notEqual((await fetch(api.url+"/drafts",{headers:{Authorization:"Bearer "+b.token}})).status,401);
  assert.equal((await fetch(api.url+"/extension/disconnect",{method:"POST",headers:{Authorization:"Bearer "+a.token}})).status,200);
 } finally {await api.close();}
});
