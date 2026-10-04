"use client";
import { useEffect, useState, type FormEvent } from "react";

type Lesson = {id: string; title: string; mistake: string; correction: string; lesson: string; status: "draft" | "active" | "paused"; revision: number; updated_at: string};
const empty = {title: "", mistake: "", correction: "", lesson: "", status: "draft" as Lesson["status"]};
export default function AdminTraining({demo}: {demo: boolean}) {
  const [rows, setRows] = useState<Lesson[]>([]);
  const [form, setForm] = useState(empty);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [approved, setApproved] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  async function load() {
    const response = await fetch("/api/backend/admin/training", {signal: AbortSignal.timeout(15000)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Could not load training memory.");
    setRows(data);
  }
  useEffect(() => { if (demo) {setLoading(false); return;} load().catch(e => setNotice(e.message)).finally(() => setLoading(false)); }, [demo]);
  function edit(row: Lesson | null) {
    setSelected(row); setForm(row ? {title: row.title, mistake: row.mistake, correction: row.correction, lesson: row.lesson, status: row.status} : empty);
    setApproved(false); setReason(""); setNotice("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || demo) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/backend/admin/training" + (selected ? "/" + selected.id : ""), {
        method: selected ? "PATCH" : "POST", headers: {"Content-Type": "application/json"},
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({...form, reason, globalApproved: approved, ...(selected ? {revision: selected.revision} : {})}),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || "Unable to save lesson.");
      setSelected(value); setForm({title: value.title, mistake: value.mistake, correction: value.correction, lesson: value.lesson, status: value.status});
      await load();
      setNotice(value.status === "active" ? "Published. New AI drafts now receive this lesson across all workspaces." : "Saved to persistent memory. This lesson is not included in new drafts.");
    } catch(error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="admin-card admin-editor">
    <div className="admin-card-head"><div><span className="eyebrow">PERSISTENT GLOBAL MEMORY</span><h2>Training ground</h2>
      <p>Teach DraftPilot what went wrong and how to improve. Save a draft, review the general lesson, then publish it for every workspace and future session.</p></div></div>
    <p className="admin-help">{rows.filter(r => r.status === "active").length} / 20 active lessons · {rows.length} saved. Lessons guide the active model; they do not fine-tune its weights. Workspace knowledge and safety rules take precedence. Changes affect new generations, not previously saved replies.</p>
    <div className="training-grid">
      <div className="training-library"><button className="button secondary" onClick={() => edit(null)} disabled={busy}>+ New lesson</button>
        {loading && <p role="status">Loading saved memory…</p>}
        {!loading && !rows.length && <p className="admin-help">No lessons yet. Start with a mistake you want DraftPilot to avoid.</p>}
        {rows.map(row => <button key={row.id} className={"training-lesson " + (selected?.id === row.id ? "selected" : "")} onClick={() => edit(row)} disabled={busy}>
          <strong>{row.title}</strong><span>{row.status} · revision {row.revision}</span><small>{new Date(row.updated_at).toLocaleDateString()}</small>
        </button>)}
      </div>
      <form onSubmit={save} className="admin-fields">
        <label>Lesson title<input required minLength={3} maxLength={100} value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Do not claim a refund was processed" /></label>
        <label>Mistake / original reply<textarea required minLength={8} maxLength={2000} value={form.mistake} onChange={e => setForm({...form, mistake: e.target.value})} placeholder="Use a synthetic or anonymized example." /></label>
        <label>Corrected reply<textarea required minLength={8} maxLength={2000} value={form.correction} onChange={e => setForm({...form, correction: e.target.value})} placeholder="Show what a better reply should say." /></label>
        <label>Reusable global lesson ({form.lesson.length}/400)<textarea required minLength={8} maxLength={400} value={form.lesson} onChange={e => setForm({...form, lesson: e.target.value})} placeholder="Describe the general behavior to follow, without customer details or company-specific policies." /></label>
        <p className="admin-help">Only this general lesson enters model prompts. Original and corrected replies stay in the protected admin record. Use anonymized examples; automatic redaction cannot catch every confidential detail.</p>
        <label>Status<select value={form.status} onChange={e => {setForm({...form, status: e.target.value as Lesson["status"]}); setApproved(false);}}><option value="draft">Draft — review first</option><option value="active">Active — apply globally</option><option value="paused">Paused — keep history, stop applying</option></select></label>
        {form.status === "active" && <label className="training-approval"><input type="checkbox" required checked={approved} onChange={e => setApproved(e.target.checked)} />I reviewed this lesson for all workspaces. It contains no confidential details or customer-specific policies.</label>}
        <label>Reason for this change<input required minLength={8} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Recorded in the admin activity log" /></label>
        <button className="button primary" disabled={busy || demo || loading}>{busy ? "Saving…" : form.status === "active" ? "Publish global lesson" : "Save lesson"}</button>
        <p role="status">{notice}</p>
      </form>
    </div>
    <p className="admin-help">After publishing, use the private AI playground below to retry the question against your reference facts. It uses the same saved memory as extension drafts. Review the result before considering a mistake resolved.</p>
  </section>;
}
