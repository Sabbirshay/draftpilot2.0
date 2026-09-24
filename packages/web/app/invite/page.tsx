"use client";
import { useEffect, useState, type FormEvent } from "react";
export default function Invite() {
  const [token, setToken] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [signup, setSignup] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    setToken(location.hash.slice(1));
    history.replaceState(null, "", location.pathname);
  }, []);
  async function accept() {
    const response = await fetch("/api/backend/team/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Unable to accept invitation.");
    setDone(true);
    setMessage("You have joined the workspace.");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const body = Object.fromEntries(new FormData(e.currentTarget));
      const response = await fetch(
        "/api/auth/" + (signup ? "signup" : "login"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.confirmationRequired) {
        setMessage(
          "Confirm your email, then reopen the original invitation link and sign in.",
        );
        setSignup(false);
      } else await accept();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-form" style={{ paddingTop: 90 }}>
      <h2>You’re invited.</h2>
      <p className="muted">
        Sign in with the invited email to join your team. This won’t create a
        separate workspace.
      </p>
      {done ? (
        <a className="button primary" href="/app">
          Open workspace →
        </a>
      ) : (
        <>
          <form onSubmit={submit}>
            <label>
              Email address
              <input type="email" name="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                required
                minLength={12}
                autoComplete={signup ? "new-password" : "current-password"}
              />
            </label>
            <button className="button primary" disabled={busy || !token}>
              {signup ? "Create account & join" : "Sign in & join"}
            </button>
          </form>
          <button className="text-button" onClick={() => setSignup(!signup)}>
            {signup ? "Already have an account? Sign in" : "Create an account"}
          </button>
          <button
            className="text-button"
            onClick={() => {
              setBusy(true);
              accept()
                .catch((e) => setMessage(e.message))
                .finally(() => setBusy(false));
            }}
            disabled={busy || !token}
          >
            Accept with current signed-in account
          </button>
        </>
      )}
      <p role="status">
        {message ||
          (!token ? "Open the original invitation link to continue." : "")}
      </p>
    </main>
  );
}
