"use client";
import { useState, type FormEvent } from "react";
export default function AdminPlayground({
  demo,
  paused,
}: {
  demo: boolean;
  paused: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setResult("");
    try {
      const r = await fetch("/api/backend/admin/pipeline/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.message || "Test failed.");
      setResult(
        `${value.liveProvider ? "Live provider" : "Local template"} · ${value.model || value.source} · ${value.durationMs} ms\n\n${value.draft}`,
      );
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-card admin-editor">
      <h2>Private AI playground</h2>
      <p className="admin-help">
        Test the saved global model with sample support questions, reference
        facts and tone. Only platform administrators with MFA can use this tool.
        Each test counts toward the provider request ceiling.
      </p>
      <form onSubmit={submit} className="admin-fields">
        <label>
          Test customer question
          <textarea
            name="question"
            required
            minLength={8}
            maxLength={4000}
            defaultValue="What is the example return window?"
          />
        </label>
        <label>
          Test knowledge / reference facts
          <textarea
            name="reference"
            required
            minLength={10}
            maxLength={8000}
            defaultValue="Example returns are accepted within 37 days."
          />
        </label>
        <label>
          Test tone
          <select name="tone" defaultValue="concise">
            <option value="concise">Concise</option>
            <option value="friendly">Friendly</option>
            <option value="professional">Professional</option>
            <option value="empathetic">Empathetic</option>
          </select>
        </label>
        <button className="button secondary" disabled={demo || busy || paused}>
          {busy ? "Testing…" : "Test saved pipeline"}
        </button>
        {demo && (
          <p className="admin-help">
            Live testing is unavailable in the local preview.
          </p>
        )}
        {paused && (
          <p className="admin-help">
            Resume generation to test the saved pipeline.
          </p>
        )}
      </form>
      {result && (
        <pre className="admin-test" role="status">
          {result}
        </pre>
      )}
    </section>
  );
}
