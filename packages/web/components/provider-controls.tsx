"use client";
import { useEffect, useState } from "react";
type Credential = {
  provider: string;
  revision: string;
  models: { id: string; name: string }[];
  tested_model: string | null;
};
type State = {
  credentials: Credential[];
  active: {
    active_provider: string | null;
    active_model: string | null;
    active_revision: string | null;
  };
  encryptionReady: boolean;
  dailyCallLimit: number;
};
export default function ProviderControls({
  demo,
  onChanged,
}: {
  demo: boolean;
  onChanged: () => Promise<void>;
}) {
  const [state, setState] = useState<State>(),
    [provider, setProvider] = useState("openai"),
    [key, setKey] = useState(""),
    [model, setModel] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [draft, setDraft] = useState("");
  const credential = state?.credentials.find((c) => c.provider === provider);
  async function request(path: string, body?: unknown) {
    const r = await fetch("/api/backend/admin/providers" + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const value = await r.json();
    if (!r.ok) throw new Error(value.message || "Request failed.");
    return value;
  }
  async function reload() {
    setState(await request(""));
  }
  useEffect(() => {
    if (!demo)
      void request("")
        .then(setState)
        .catch((e) => setNotice(e.message));
  }, [demo]);
  async function run(action: "connect" | "test" | "activate") {
    setBusy(true);
    setNotice("");
    setDraft("");
    const secret = key;
    setKey("");
    try {
      const body =
        action === "connect"
          ? { key: secret, reason }
          : action === "test"
            ? { model, revision: credential?.revision }
            : { model, revision: credential?.revision, reason };
      const result = await request("/" + provider + "/" + action, body);
      await reload();
      await onChanged();
      if (action === "connect") {
        setModel("");
        setNotice(
          "Key validated and saved securely. Choose a model and run a live test.",
        );
      }
      if (action === "test") {
        setDraft(result.draft);
        setNotice(
          "Live provider test passed. You can now activate this model.",
        );
      }
      if (action === "activate")
        setNotice(
          "Global model activated for existing and new customers. Check that generation is not paused below.",
        );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-card admin-editor">
      <h2>Provider connection & global model</h2>
      <p className="admin-help">
        One verified model for every existing and future customer. Keys stay on
        the server and are never shown again.
      </p>
      <p className="admin-status">
        Active model:{" "}
        {state?.active.active_revision
          ? `${state.active.active_provider} / ${state.active.active_model}`
          : "None activated"}
      </p>
      {demo ? (
        <p className="admin-warning">
          Preview only. Connect Supabase and configure server encryption to save
          a key or run a real test.
        </p>
      ) : (
        !state?.encryptionReady && (
          <p className="admin-error">
            Server encryption is not configured. Ask your deployment operator to
            set AI_KEY_ENCRYPTION_KEY.
          </p>
        )
      )}
      <div className="admin-fields">
        <label>
          AI provider
          <select
            value={provider}
            disabled={busy}
            onChange={(e) => {
              setProvider(e.target.value);
              setModel("");
              setKey("");
              setDraft("");
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
        <label>
          API token
          <input
            type="password"
            autoComplete="new-password"
            value={key}
            maxLength={512}
            disabled={demo || busy || !state?.encryptionReady}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              credential ? "Enter a replacement key" : "Paste provider API key"
            }
          />
        </label>
        <label>
          Change reason
          <input
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you connecting or changing this model?"
          />
        </label>
        <button
          className="button secondary"
          style={{ alignSelf: "end", minHeight: 40 }}
          disabled={
            demo ||
            busy ||
            key.trim().length < 20 ||
            reason.trim().length < 8 ||
            !state?.encryptionReady
          }
          onClick={() => run("connect")}
        >
          Validate key & load models
        </button>
        <label>
          Universal AI model
          <select
            value={model}
            disabled={busy || !credential}
            onChange={(e) => {
              setModel(e.target.value);
              setDraft("");
            }}
          >
            <option value="">Choose a model from your provider</option>
            {credential?.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="admin-actions">
        <button
          className="button secondary"
          disabled={demo || busy || !model}
          onClick={() => run("test")}
        >
          {busy ? "Working…" : "Run live model test"}
        </button>
        <button
          className="button primary"
          disabled={
            demo ||
            busy ||
            !model ||
            credential?.tested_model !== model ||
            reason.trim().length < 8
          }
          onClick={() => run("activate")}
        >
          Activate for all users
        </button>
      </div>
      <p className="admin-help">
        Tests use a small synthetic support query. The server requires a
        successful test within the last hour. Rotating an active key pauses
        customer generation until it is tested, activated and resumed.
      </p>
      <p className="admin-help">
        Daily provider request ceiling: {state?.dailyCallLimit ?? 1000}. Set
        provider-side spending limits as well; request counts are not a currency
        budget.
      </p>
      {notice && (
        <p role="status" className="admin-help">
          {notice}
        </p>
      )}
      {draft && (
        <div
          className="admin-help"
          style={{
            whiteSpace: "pre-wrap",
            padding: 16,
            border: "1px solid #d6dfd0",
            borderRadius: 12,
          }}
        >
          <strong>Live test draft</strong>
          <p>{draft}</p>
        </div>
      )}
    </section>
  );
}
