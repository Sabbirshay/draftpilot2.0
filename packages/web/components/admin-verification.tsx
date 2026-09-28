"use client";
import { useState } from "react";
export default function AdminVerification() {
  const [factorId, setFactor] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(action: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/mfa", {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({action, factorId, code})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verification failed.");
      if (data.factorId) { setFactor(data.factorId); setSecret(data.secret || ""); }
      else { setSecret(""); setCode(""); window.location.replace("/admin"); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="auth-form" style={{maxWidth:480,margin:"80px auto",padding:24}}>
    <h1>Verify administrator access</h1><p>Your dashboard stays locked until you verify the six-digit code from Google Authenticator.</p>
    {!factorId && <div><button className="button primary" disabled={busy} onClick={()=>submit("existing")}>Use existing authenticator</button><button className="button secondary" disabled={busy} onClick={()=>submit("enroll")}>Set up Google Authenticator</button></div>}
    {secret && <div><p>On your phone, open Google Authenticator → + → Enter a setup key. Name it DraftPilot, paste this key and choose Time based. Keep this key private.</p><code style={{overflowWrap:"anywhere"}}>{secret}</code></div>}
    {factorId && <form onSubmit={e=>{e.preventDefault(); void submit("verify");}}><label>Six-digit code<input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g, "").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label><button className="button primary" disabled={busy || code.length!==6}>Verify and open dashboard</button></form>}
    {error && <p role="alert">{error}</p>}
  </main>;
}
