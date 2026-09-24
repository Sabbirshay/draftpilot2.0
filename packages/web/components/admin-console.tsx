"use client";
import AdminCommandOverview, {
  type CommandMetrics,
} from "./admin-command-overview";
import AdminPlayground from "./admin-playground";
import ProviderControls from "./provider-controls";
import { useEffect, useState, useRef } from "react";
import {
  ShieldCheck,
  Users,
  Building2,
  Sparkles,
  History,
  ArrowUpRight,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  LockKeyhole,
} from "lucide-react";
import "./admin-console.css";
type Grant = { plan: "free" | "team"; seats: number; limit: number };
type Workspace = {
  id: string;
  name: string;
  plan: string;
  billing_plan: string;
  manual_override: Grant | null;
  frozen: boolean;
  seat_limit: number;
  monthly_draft_limit: number;
  used: number;
  member_count: number;
  stripe_subscription_id?: string | null;
  billing_event_at?: number;
};
type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  team_id: string;
  workspace: string;
  plan: string;
  billing_plan: string;
  manual_override: Grant | null;
  frozen: boolean;
  monthly_draft_limit: number;
  seat_limit: number;
  member_count: number;
  suspended: boolean;
  generation_blocked: boolean;
  monthly_limit: number | null;
  used: number;
};
type Event = {
  id: number;
  actor_id: string;
  action: string;
  resource_id: string;
  created_at: string;
  details: { reason?: string; before?: unknown; after?: unknown };
};
type Snapshot = {
  command?: CommandMetrics;
  metrics: {
    users: number;
    workspaces: number;
    suspended: number;
    monthDrafts: number;
  };
  users: User[];
  workspaces: Workspace[];
  totalUsers: number;
  totalWorkspaces: number;
  audit: Event[];
};
type Pipeline = {
  generation_paused: boolean;
  max_output_tokens: number;
  environmentPaused: boolean;
  ai_config: {
    openai_enabled: boolean;
    openrouter_enabled: boolean;
    embeddings_enabled: boolean;
    fallback_enabled: boolean;
    openai_model: string;
    router_models: string[];
    temperature: number;
  };
  integrations: Record<string, boolean>;
};
const samplePipeline: Pipeline = {
  generation_paused: false,
  max_output_tokens: 600,
  environmentPaused: false,
  ai_config: {
    openai_enabled: true,
    openrouter_enabled: true,
    embeddings_enabled: true,
    fallback_enabled: true,
    openai_model: "gpt-4o-mini",
    router_models: ["openai/gpt-4o-mini"],
    temperature: 0.3,
  },
  integrations: {
    openai: false,
    openrouter: false,
    stripe: false,
    stripePrice: false,
    stripeWebhook: false,
  },
};
function samples(): Snapshot {
  const workspaces: Workspace[] = [
    {
      id: "sample-acme",
      name: "Acme Studio",
      plan: "team",
      billing_plan: "team",
      manual_override: null,
      frozen: false,
      seat_limit: 3,
      monthly_draft_limit: 3000,
      used: 428,
      member_count: 3,
    },
    {
      id: "sample-north",
      name: "Northstar Goods",
      plan: "free",
      billing_plan: "free",
      manual_override: null,
      frozen: false,
      seat_limit: 1,
      monthly_draft_limit: 50,
      used: 38,
      member_count: 1,
    },
  ];
  const users: User[] = [
    ["Alex Morgan", "alex@example.com", 0, "owner", 128],
    ["Jamie Chen", "jamie@example.com", 0, "member", 210],
    ["Sam Rivera", "sam@example.com", 0, "member", 90],
    ["Taylor Reed", "taylor@example.com", 1, "owner", 38],
  ].map((v, i) => {
    const t = workspaces[Number(v[2])];
    return {
      id: "sample-user-" + i,
      email: String(v[1]),
      full_name: String(v[0]),
      role: String(v[3]),
      team_id: t.id,
      workspace: t.name,
      plan: t.plan,
      billing_plan: t.billing_plan,
      manual_override: null,
      frozen: false,
      monthly_draft_limit: t.monthly_draft_limit,
      seat_limit: t.seat_limit,
      member_count: t.member_count,
      suspended: false,
      generation_blocked: false,
      monthly_limit: null,
      used: Number(v[4]),
    };
  });
  return {
    metrics: { users: 4, workspaces: 2, suspended: 0, monthDrafts: 466 },
    users,
    workspaces,
    totalUsers: 4,
    totalWorkspaces: 2,
    audit: [],
  };
}
const sections = [
  ["users", "Users", Users],
  ["workspaces", "Workspaces & plans", Building2],
  ["pipeline", "AI pipeline", Sparkles],
  ["audit", "Activity log", History],
] as const;
export default function AdminConsole({ demo }: { demo: boolean }) {
  const [tab, setTab] = useState("users"),
    [data, setData] = useState<Snapshot | null>(demo ? samples : null),
    [pipeline, setPipeline] = useState<Pipeline>(samplePipeline),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [authorized, setAuthorized] = useState(demo);
  const [selected, setSelected] = useState<User | Workspace | null>(null),
    [reason, setReason] = useState(""),
    [limit, setLimit] = useState(""),
    [suspended, setSuspended] = useState(false),
    [blocked, setBlocked] = useState(false),
    [grant, setGrant] = useState<Grant>({
      plan: "team",
      seats: 1,
      limit: 1000,
    }),
    [override, setOverride] = useState(false),
    [frozen, setFrozen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(""),
    [stale, setStale] = useState(false);
  const loadVersion = useRef(0);
  const [code, setCode] = useState(""),
    [factor, setFactor] = useState(""),
    [secret, setSecret] = useState("");
  async function call(path: string, method = "GET", body?: unknown) {
    const r = await fetch("/api/backend/admin/" + path, {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (!r.ok)
      throw Object.assign(Error(d.message || "Request failed."), {
        status: r.status,
      });
    return d;
  }
  async function load(q = search, position = offset) {
    if (demo) return;
    const version = ++loadVersion.current;
    setBusy(true);
    setError("");
    try {
      const [d, p] = await Promise.all([
        call("overview?q=" + encodeURIComponent(q) + "&offset=" + position),
        call("pipeline"),
      ]);
      if (version !== loadVersion.current) return;
      setData(d);
      setUpdatedAt(d.command?.observedAt || new Date().toISOString());
      setStale(false);
      setPipeline(p);
      setAuthorized(true);
    } catch (e) {
      if (version !== loadVersion.current) return;
      setError((e as Error).message);
      setStale(true);
      if ([401, 403].includes((e as Error & { status?: number }).status || 0)) {
        setAuthorized(false);
        setData(null);
      }
    } finally {
      if (version === loadVersion.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (demo || !authorized || tab !== "users" || busy) return;
    let disposed = false,
      inFlight = false;
    const controller = new AbortController();
    async function refresh() {
      if (disposed || inFlight || document.hidden) return;
      inFlight = true;
      const version = loadVersion.current;
      try {
        const r = await fetch(
          "/api/backend/admin/overview?q=" +
            encodeURIComponent(search) +
            "&offset=" +
            offset,
          {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(12000),
            ]),
          },
        );
        if (disposed || version !== loadVersion.current) return;
        if (r.status === 401 || r.status === 403) {
          setAuthorized(false);
          setData(null);
          setError("Administrator access expired. Verify your session again.");
          return;
        }
        if (!r.ok) throw Error("refresh");
        const next = await r.json();
        if (disposed || version !== loadVersion.current) return;
        setData(next);
        setUpdatedAt(next.command?.observedAt || new Date().toISOString());
        setStale(false);
      } catch {
        if (!disposed && version === loadVersion.current) setStale(true);
      } finally {
        inFlight = false;
      }
    }
    const timer = window.setInterval(() => void refresh(), 5000);
    const resume = () => void refresh();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    };
  }, [demo, authorized, tab, busy, search, offset]);
  function select(item: User | Workspace) {
    setSelected(item);
    setReason("");
    setMessage("");
    setError("");
    setFrozen(item.frozen);
    setGrant(
      item.manual_override || {
        plan: item.plan as "free" | "team",
        seats: item.seat_limit,
        limit: item.monthly_draft_limit,
      },
    );
    setOverride(!!item.manual_override);
    if ("email" in item) {
      setLimit(item.monthly_limit === null ? "" : String(item.monthly_limit));
      setSuspended(item.suspended);
      setBlocked(item.generation_blocked);
    }
  }
  async function save(
    kind: "user" | "workspace" | "pipeline",
    changes: Record<string, unknown>,
  ) {
    if (reason.trim().length < 8) {
      setError("Please explain this change in at least 8 characters.");
      return;
    }
    if (
      kind === "user" &&
      changes.monthly_limit !== null &&
      (!Number.isInteger(changes.monthly_limit) ||
        Number(changes.monthly_limit) < 0 ||
        Number(changes.monthly_limit) > 1000000)
    ) {
      setError("User quota must be a whole number from 0 to 1,000,000.");
      return;
    }
    if (
      kind === "workspace" &&
      changes.manual_override &&
      (!Number.isInteger(grant.seats) ||
        grant.seats < 1 ||
        grant.seats > 100 ||
        !Number.isInteger(grant.limit) ||
        grant.limit < 0 ||
        grant.limit > 1000000)
    ) {
      setError("Use 1–100 seats and a quota from 0 to 1,000,000.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const target =
        selected &&
        ("email" in selected && kind === "workspace"
          ? selected.team_id
          : selected.id);
      if (demo) {
        setData((current) => {
          if (!current) return current;
          const next = structuredClone(current);
          if (kind === "user") {
            const u = next.users.find((u) => u.id === target)!;
            Object.assign(u, changes);
          }
          if (kind === "workspace") {
            const t = next.workspaces.find((t) => t.id === target)!;
            t.frozen = Boolean(changes.frozen);
            t.manual_override = changes.manual_override as Grant | null;
            t.plan = t.manual_override?.plan || t.billing_plan;
            t.seat_limit =
              t.manual_override?.seats || (t.billing_plan === "team" ? 3 : 1);
            t.monthly_draft_limit =
              t.manual_override?.limit ||
              (t.billing_plan === "team" ? 3000 : 50);
            for (const u of next.users.filter((u) => u.team_id === t.id))
              Object.assign(u, {
                plan: t.plan,
                frozen: t.frozen,
                manual_override: t.manual_override,
                seat_limit: t.seat_limit,
                monthly_draft_limit: t.monthly_draft_limit,
              });
          }
          next.metrics.suspended = next.users.filter((u) => u.suspended).length;
          next.audit.unshift({
            id: Date.now(),
            actor_id: "sample-admin",
            action: "platform." + kind + ".update",
            resource_id: target || "pipeline",
            created_at: new Date().toISOString(),
            details: { reason, after: changes },
          });
          return next;
        });
      } else {
        await call(
          kind === "pipeline"
            ? "pipeline"
            : (kind === "user" ? "users/" : "workspaces/") + target,
          "PATCH",
          { ...changes, reason },
        );
        await load();
      }
      setSelected(null);
      setReason("");
      setMessage(
        demo
          ? "Sample changes saved for this preview only."
          : "Changes saved and recorded in the activity log.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mfa(action: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, factorId: factor, code }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.secret) {
        setSecret(d.secret);
        setFactor(d.factorId);
      } else if (d.factorId) setFactor(d.factorId);
      else {
        setSecret("");
        setCode("");
        await load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = demo
    ? data?.users.filter((u) =>
        (u.email + " " + u.full_name)
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : data?.users;
  const teams = demo
    ? data?.workspaces.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()),
      )
    : data?.workspaces;
  const total = tab === "users" ? data?.totalUsers : data?.totalWorkspaces;
  const field = (label: string, key: keyof Pipeline["ai_config"]) => (
    <label className="admin-toggle">
      <input
        type="checkbox"
        checked={Boolean(pipeline.ai_config[key])}
        onChange={(e) =>
          setPipeline({
            ...pipeline,
            ai_config: { ...pipeline.ai_config, [key]: e.target.checked },
          })
        }
      />
      <span>{label}</span>
    </label>
  );
  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <a className="admin-brand" href="/">
          <span>ϟ</span> DraftPilot<span className="admin-dot">.</span>
        </a>
        <div className="admin-nav-label">PLATFORM CONTROL</div>
        {sections.map(([id, label, Icon]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setSelected(null);
              setReason("");
              setSearch("");
              setQuery("");
              setOffset(0);
              if (!demo) void load("", 0);
            }}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
        <div className="admin-nav-footer">
          <ShieldCheck size={20} />
          <strong>Super administrator</strong>
          <small>
            {demo ? "Local preview · sample data" : "MFA-protected operations"}
          </small>
          <a href="/app">
            Back to workspace <ArrowUpRight size={14} />
          </a>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-top">
          <span>
            <span className="admin-live-dot" />{" "}
            {demo ? "Preview environment" : "Platform operations"}
          </span>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </header>
        <div className="admin-heading">
          <div>
            <div className="eyebrow">DRAFTPILOT / CONTROL CENTER</div>
            <h1>
              {tab === "users"
                ? "Your users, in focus."
                : tab === "workspaces"
                  ? "Every workspace. One view."
                  : tab === "pipeline"
                    ? "The intelligence behind every reply."
                    : "A clear record of every change."}
            </h1>
            <p>
              {tab === "users"
                ? "Understand usage, manage access, and give each person the right limits."
                : tab === "workspaces"
                  ? "Manage paid entitlements and deliberate manual exceptions."
                  : tab === "pipeline"
                    ? "Control providers, global model selection, and generation limits from one place."
                    : "Review who changed access, plans, and AI settings — and why."}
            </p>
          </div>
          <span className="admin-pill">
            <ShieldCheck size={14} />
            {demo ? "Sample controls" : "Protected controls"}
          </span>
        </div>
        {demo && (
          <div className="admin-notice">
            <AlertCircle size={17} />
            <span>
              <strong>Interactive preview.</strong> All accounts and payments
              shown are samples. Changes reset on reload and never affect real
              users.
            </span>
          </div>
        )}
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="admin-success">
            {message}
          </p>
        )}
        {!authorized ? (
          <section className="admin-card admin-lock">
            <LockKeyhole size={32} />
            <h2>Verify administrator access</h2>
            <p>
              Sign in from the workspace with a server-assigned platform
              administrator account, then verify your authenticator.
            </p>
            <div className="admin-actions">
              <button
                disabled={busy}
                className="button secondary"
                onClick={() => mfa("existing")}
              >
                Use existing authenticator
              </button>
              <button
                disabled={busy}
                className="button secondary"
                onClick={() => mfa("enroll")}
              >
                Set up authenticator
              </button>
            </div>
            {secret && (
              <p className="pair-code">Authenticator secret: {secret}</p>
            )}
            {factor && (
              <label>
                Six-digit code
                <input
                  aria-label="Six-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button
                  disabled={busy}
                  className="button primary"
                  onClick={() => mfa("verify")}
                >
                  Verify access
                </button>
              </label>
            )}
          </section>
        ) : (
          <>
            {tab === "users" && (
              <AdminCommandOverview
                metrics={data?.metrics}
                command={data?.command}
                demo={demo}
                stale={stale}
                updatedAt={updatedAt}
              />
            )}
            {(tab === "users" || tab === "workspaces") && (
              <section className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <h2>
                      {tab === "users"
                        ? "User directory"
                        : "Workspace directory"}
                    </h2>
                    <p>
                      {tab === "users"
                        ? "Individual caps are enforced alongside the workspace limit."
                        : "Manual overrides remain in effect until explicitly removed."}
                    </p>
                  </div>
                  <form
                    className="admin-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setSearch(query);
                      setOffset(0);
                      void load(query, 0);
                    }}
                  >
                    <Search size={16} />
                    <input
                      aria-label="Search directory"
                      placeholder={
                        tab === "users"
                          ? "Search name or email…"
                          : "Search workspace…"
                      }
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <button disabled={busy}>Search</button>
                  </form>
                </div>
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{tab === "users" ? "User" : "Workspace"}</th>
                        <th>
                          {tab === "users" ? "Workspace / plan" : "Plan source"}
                        </th>
                        <th>Monthly usage</th>
                        <th>Access</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {tab === "users"
                        ? rows?.map((u) => (
                            <tr key={u.id}>
                              <td>
                                <div className="admin-identity">
                                  <span>
                                    {(u.full_name || u.email).slice(0, 1)}
                                  </span>
                                  <div>
                                    <strong>{u.full_name || u.email}</strong>
                                    <small>{u.email}</small>
                                  </div>
                                </div>
                              </td>
                              <td>
                                {u.workspace}
                                <small className="admin-sub">
                                  {u.plan} · {u.role}
                                </small>
                              </td>
                              <td>
                                {u.used.toLocaleString()} /{" "}
                                {u.monthly_limit === null
                                  ? "Workspace cap"
                                  : u.monthly_limit.toLocaleString()}
                                <small className="admin-sub">
                                  Workspace:{" "}
                                  {u.monthly_draft_limit.toLocaleString()}
                                </small>
                              </td>
                              <td>
                                <span
                                  className={
                                    "admin-status " +
                                    (u.suspended || u.frozen
                                      ? "bad"
                                      : u.generation_blocked
                                        ? "warn"
                                        : "")
                                  }
                                >
                                  {u.suspended
                                    ? "Suspended"
                                    : u.frozen
                                      ? "Workspace frozen"
                                      : u.generation_blocked
                                        ? "Drafting blocked"
                                        : "Active"}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="button secondary"
                                  onClick={() => select(u)}
                                  aria-label={"Manage " + u.email}
                                >
                                  Manage
                                </button>
                              </td>
                            </tr>
                          ))
                        : teams?.map((t) => (
                            <tr key={t.id}>
                              <td>
                                <strong>{t.name}</strong>
                                <small className="admin-sub">
                                  {t.member_count} members · {t.seat_limit}{" "}
                                  seats
                                </small>
                              </td>
                              <td>
                                {t.plan}
                                <small className="admin-sub">
                                  {t.manual_override
                                    ? "Manual override"
                                    : t.billing_plan === "team"
                                      ? "Subscription"
                                      : "Free plan"}
                                </small>
                              </td>
                              <td>
                                {t.used.toLocaleString()} /{" "}
                                {t.monthly_draft_limit.toLocaleString()}
                              </td>
                              <td>
                                <span
                                  className={
                                    "admin-status " + (t.frozen ? "bad" : "")
                                  }
                                >
                                  {t.frozen ? "Suspended" : "Active"}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="button secondary"
                                  onClick={() => select(t)}
                                  aria-label={"Manage " + t.name}
                                >
                                  Manage
                                </button>
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                  {(tab === "users" ? rows : teams)?.length === 0 && (
                    <p className="admin-empty">No matching accounts found.</p>
                  )}
                </div>
                <div className="admin-pagination">
                  <span>{total || 0} records · up to 50 per page</span>
                  <button
                    disabled={busy || demo || offset === 0}
                    onClick={() => {
                      setOffset(offset - 50);
                      void load(search, offset - 50);
                    }}
                  >
                    Previous
                  </button>
                  <button
                    disabled={busy || demo || offset + 50 >= (total || 0)}
                    onClick={() => {
                      setOffset(offset + 50);
                      void load(search, offset + 50);
                    }}
                  >
                    Next
                  </button>
                </div>
              </section>
            )}
            {selected && (
              <section
                className="admin-card admin-editor"
                aria-label="Account controls"
              >
                <div className="admin-card-head">
                  <div>
                    <div className="eyebrow">ACCOUNT CONTROLS</div>
                    <h2>
                      {"email" in selected ? selected.email : selected.name}
                    </h2>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => setSelected(null)}
                  >
                    Close controls
                  </button>
                </div>
                <div className="admin-editor-grid">
                  {"email" in selected && (
                    <div>
                      <h3>User access & quota</h3>
                      <label className="admin-toggle">
                        <input
                          type="checkbox"
                          checked={suspended}
                          onChange={(e) => setSuspended(e.target.checked)}
                        />
                        Suspend account and revoke extension access
                      </label>
                      <label className="admin-toggle">
                        <input
                          type="checkbox"
                          checked={blocked}
                          onChange={(e) => setBlocked(e.target.checked)}
                        />
                        Block draft generation only
                      </label>
                      <label>
                        Monthly user quota
                        <input
                          type="number"
                          min={0}
                          max={1000000}
                          placeholder="Use workspace cap"
                          value={limit}
                          onChange={(e) => setLimit(e.target.value)}
                        />
                      </label>
                      <p className="admin-help">
                        Leave blank to inherit the workspace cap. Zero blocks
                        new drafts. Usage resets monthly in UTC.
                      </p>
                      <button
                        disabled={busy || reason.trim().length < 8}
                        className="button secondary"
                        onClick={() =>
                          save("user", {
                            suspended,
                            generation_blocked: blocked,
                            monthly_limit: limit === "" ? null : Number(limit),
                          })
                        }
                      >
                        Save user controls
                      </button>
                    </div>
                  )}
                  {(!("email" in selected) || selected.team_id) && (
                    <div>
                      <h3>Workspace plan & access</h3>
                      <p className="admin-help">
                        Applies to{" "}
                        <strong>
                          {"email" in selected
                            ? selected.workspace
                            : selected.name}
                        </strong>{" "}
                        and all {selected.member_count} members. This does not
                        charge, refund, or cancel a subscription.
                      </p>
                      <label className="admin-toggle">
                        <input
                          type="checkbox"
                          checked={frozen}
                          onChange={(e) => setFrozen(e.target.checked)}
                        />
                        Suspend workspace
                      </label>
                      <label className="admin-toggle">
                        <input
                          type="checkbox"
                          checked={override}
                          onChange={(e) => setOverride(e.target.checked)}
                        />
                        Use a manual plan override
                      </label>
                      {override ? (
                        <div className="admin-fields">
                          <label>
                            Plan
                            <select
                              value={grant.plan}
                              onChange={(e) =>
                                setGrant({
                                  ...grant,
                                  plan: e.target.value as Grant["plan"],
                                })
                              }
                            >
                              <option value="free">Free</option>
                              <option value="team">Team</option>
                            </select>
                          </label>
                          <label>
                            Seats
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={grant.seats}
                              onChange={(e) =>
                                setGrant({
                                  ...grant,
                                  seats: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Workspace monthly quota
                            <input
                              type="number"
                              min={0}
                              max={1000000}
                              value={grant.limit}
                              onChange={(e) =>
                                setGrant({
                                  ...grant,
                                  limit: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : (
                        <p className="admin-help">
                          Follow billing: {selected.billing_plan}. Removing an
                          override restores the latest subscription
                          entitlements.
                        </p>
                      )}
                      <button
                        disabled={busy || reason.trim().length < 8}
                        className="button primary"
                        onClick={() =>
                          save("workspace", {
                            frozen,
                            manual_override: override ? grant : null,
                          })
                        }
                      >
                        Save workspace plan
                      </button>
                    </div>
                  )}
                </div>
                <label className="admin-reason">
                  Reason for change
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={8}
                    maxLength={300}
                    placeholder="Explain the support request or business reason…"
                  />
                </label>
              </section>
            )}
            {tab === "pipeline" && (
              <>
                <section className="admin-card">
                  <div className="admin-card-head">
                    <div>
                      <h2>Provider connections</h2>
                      <p>
                        Provider keys are stored encrypted on the server. Only
                        configuration status is shown here.
                      </p>
                    </div>
                  </div>
                  <div className="admin-provider-grid">
                    {[
                      ["OpenAI", "openai"],
                      ["OpenRouter", "openrouter"],
                      ["Stripe", "stripe"],
                    ].map(([name, key]) => (
                      <div className="admin-provider" key={key}>
                        <Sparkles size={22} />
                        <h3>{name}</h3>
                        <span
                          className={
                            "admin-status " +
                            (!pipeline.integrations[key] ? "warn" : "")
                          }
                        >
                          {pipeline.integrations[key]
                            ? "Key configured"
                            : "Not connected"}
                        </span>
                        <p>
                          {key === "stripe"
                            ? "Checkout, subscription events and paid entitlements."
                            : "Server-side credentials required for live generation."}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="admin-help admin-padding">
                    Stripe price:{" "}
                    {pipeline.integrations.stripePrice
                      ? "configured"
                      : "missing"}{" "}
                    · Webhook secret:{" "}
                    {pipeline.integrations.stripeWebhook
                      ? "configured"
                      : "missing"}
                    . A configured key is not a live connectivity check.
                  </p>
                </section>
                <ProviderControls demo={demo} onChanged={() => load()} />
                <section className="admin-card admin-editor">
                  <h2>Generation policy</h2>
                  <p className="admin-help">
                    The activated global model handles customer replies.
                    Knowledge retrieval and workspace tone remain in effect.
                  </p>
                  {pipeline.environmentPaused && (
                    <p className="admin-error">
                      The deployment emergency switch is active. It must be
                      cleared in the server environment.
                    </p>
                  )}
                  <label className="admin-toggle">
                    <input
                      type="checkbox"
                      checked={pipeline.generation_paused}
                      onChange={(e) =>
                        setPipeline({
                          ...pipeline,
                          generation_paused: e.target.checked,
                        })
                      }
                    />
                    Pause all new draft generation
                  </label>
                  <div className="admin-editor-grid">
                    <div>
                      {field(
                        "Enable semantic retrieval / embeddings",
                        "embeddings_enabled",
                      )}
                    </div>
                    <div className="admin-fields">
                      <label>
                        Maximum output tokens
                        <input
                          type="number"
                          min={100}
                          max={1200}
                          value={pipeline.max_output_tokens}
                          onChange={(e) =>
                            setPipeline({
                              ...pipeline,
                              max_output_tokens: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Temperature
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          value={pipeline.ai_config.temperature}
                          onChange={(e) =>
                            setPipeline({
                              ...pipeline,
                              ai_config: {
                                ...pipeline.ai_config,
                                temperature: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                  <label className="admin-reason">
                    Reason for change
                    <textarea
                      value={reason}
                      maxLength={300}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why are you changing the AI policy?"
                    />
                  </label>
                  <div className="admin-actions">
                    <button
                      className="button primary"
                      disabled={busy || reason.trim().length < 8}
                      onClick={() =>
                        save("pipeline", {
                          generation_paused: pipeline.generation_paused,
                          max_output_tokens: pipeline.max_output_tokens,
                          ai_config: pipeline.ai_config,
                        })
                      }
                    >
                      Save pipeline settings
                    </button>
                  </div>
                </section>
                <AdminPlayground
                  demo={demo}
                  paused={
                    pipeline.generation_paused || pipeline.environmentPaused
                  }
                />
              </>
            )}
            {tab === "audit" && (
              <section className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <h2>Recent platform changes</h2>
                    <p>
                      Latest 50 events. Audit retention follows the platform’s
                      90-day policy.
                    </p>
                  </div>
                  <CheckCircle2 size={22} />
                </div>
                {data?.audit.length ? (
                  data.audit.map((e) => (
                    <details className="admin-event" key={e.id}>
                      <summary>
                        <strong>
                          {e.action
                            .replace("platform.", "")
                            .replaceAll(".", " ")}
                        </strong>
                        <span>{new Date(e.created_at).toLocaleString()}</span>
                        <p>{e.details?.reason || "Legacy operation"}</p>
                      </summary>
                      <p className="admin-help">
                        Actor: {e.actor_id} · Target:{" "}
                        {e.resource_id || "Global pipeline"}
                      </p>
                      <pre>{JSON.stringify(e.details, null, 2)}</pre>
                    </details>
                  ))
                ) : (
                  <p className="admin-empty">
                    No platform changes recorded yet.
                  </p>
                )}
              </section>
            )}
          </>
        )}
        <footer className="admin-footer">
          <ShieldCheck size={14} /> Human oversight. Server-enforced controls.{" "}
          <span>DraftPilot control center</span>
        </footer>
      </main>
    </div>
  );
}
