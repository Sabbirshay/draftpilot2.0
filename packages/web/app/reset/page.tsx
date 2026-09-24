"use client";
import { useState, type FormEvent } from "react";
export default function ResetPassword() {
  const [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (sent && values.password !== values.confirmPassword)
        throw new Error("Passwords do not match.");
      const response = await fetch(
        "/api/auth/" + (sent ? "recover" : "reset-request"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            sent
              ? { email, code: values.code, password: values.password }
              : { email },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (sent) {
        setDone(true);
        setMessage("Password updated. Sign in with your new password.");
      } else {
        setSent(true);
        setMessage(
          "If an account exists, a recovery code will arrive shortly.",
        );
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-form" style={{ paddingTop: 90 }}>
      <a className="text-button" href="/login">
        ← Back to DraftPilot
      </a>
      <h2 style={{ marginTop: 26 }}>
        {done ? "You’re ready to return." : "Let’s get you back in."}
      </h2>
      <p className="muted">
        {sent
          ? "Enter the one-time code from your recovery email."
          : "We’ll send a recovery code to the email on your account."}
      </p>
      {!done && (
        <form onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              readOnly={sent}
            />
          </label>
          {sent && (
            <>
              <label>
                Recovery code
                <input
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6,10}"
                  required
                  minLength={6}
                  maxLength={10}
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
            </>
          )}
          <button className="button primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : sent
                ? "Update password"
                : "Send recovery code"}
          </button>
        </form>
      )}
      {sent && !done && (
        <button
          className="text-button"
          onClick={() => {
            setSent(false);
            setMessage("");
          }}
        >
          Use a different email or request another code
        </button>
      )}
      {done && (
        <a className="button primary" href="/login">
          Back to sign in →
        </a>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </main>
  );
}
