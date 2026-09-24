"use client";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Globe,
  HelpCircle,
  History,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
  Zap,
  CreditCard,
  Command,
  ExternalLink,
  Lock,
  SlidersHorizontal,
  RefreshCw,
  Send,
  Pencil,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { importKnowledge } from "@/lib/import-knowledge";
import { initialWorkspace } from "@/lib/demo";
import {
  scrubPII,
  type Workspace as WorkspaceData,
  type Macro,
  type Draft,
} from "@draftpilot/shared";
type Page =
  | "Overview"
  | "Draft history"
  | "Macros"
  | "Knowledge base"
  | "Integrations"
  | "Team"
  | "Settings";
const navigation: [Page, typeof LayoutDashboard][] = [
  ["Overview", LayoutDashboard],
  ["Draft history", History],
  ["Macros", Zap],
  ["Knowledge base", BookOpen],
  ["Integrations", Link2],
  ["Team", Users],
];
const tones = ["friendly", "professional", "empathetic", "concise"];
const cx = (...items: (string | false | undefined)[]) =>
  items.filter(Boolean).join(" ");
function Logo() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Zap size={23} fill="currentColor" />
      </span>
      DraftPilot<span className="brand-dot">.</span>
    </span>
  );
}
function Badge({
  children,
  kind = "green",
}: {
  children: ReactNode;
  kind?: string;
}) {
  return <span className={"badge " + kind}>{children}</span>;
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-title">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Workspace({
  configured,
  initialAuthMode = "login",
  forceAuth = false,
}: {
  configured: boolean;
  initialAuthMode?: "login" | "signup";
  forceAuth?: boolean;
}) {
  const [page, setPage] = useState<Page>("Overview"),
    [data, setData] = useState<WorkspaceData>(initialWorkspace),
    [demo, setDemo] = useState(!configured),
    [ready, setReady] = useState(!configured && !forceAuth),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<
      "macro" | "knowledge" | "invite" | "help" | "search" | null
    >(null),
    [editing, setEditing] = useState<Macro | undefined>(),
    [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">(initialAuthMode),
    [authError, setAuthError] = useState(""),
    [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [pairingCode, setPairingCode] = useState(""),
    [inviteUrl, setInviteUrl] = useState(""),
    [extensionSessions, setExtensionSessions] = useState<
      { id: string; name: string; expires_at: string }[]
    >([]);
  const [filter, setFilter] = useState("All"),
    [historyItem, setHistoryItem] = useState<Draft | null>(null),
    [deleteItem, setDeleteItem] = useState<{
      kind: string;
      id: string;
      name: string;
    } | null>(null);
  const notify = useCallback((message: string) => setNotice(message), []);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  async function api(path: string, method = "GET", body?: unknown) {
    const response = await fetch("/api/backend/" + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(
        value.message || value.error || "The request could not be completed.",
      );
    return value;
  }
  async function reload() {
    try {
      const value = await api("workspace");
      setData(value);
      setReady(true);
      setNeedsWorkspace(false);
      setDemo(false);
    } catch (e) {
      if ((e as Error).message.includes("Create or join")) {
        setNeedsWorkspace(true);
        setReady(false);
        return;
      }
      throw e;
    }
  }
  useEffect(() => {
    if (configured) reload().catch(() => setReady(false));
  }, [configured]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("search");
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  function go(next: Page) {
    if (next === "Integrations" && !demo)
      api("extension/sessions")
        .then(setExtensionSessions)
        .catch((e) => notify(e.message));
    setPage(next);
    setSearch("");
    setFilter("All");
    setMobile(false);
    setModal(null);
  }
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setAuthError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await fetch("/api/auth/" + authMode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || "Unable to sign in");
      if (v.confirmationRequired) {
        setAuthError("Check your email to confirm your account, then sign in.");
        setAuthMode("login");
      } else {
        await api("auth/provision", "POST", {
          name: values.workspace || "My workspace",
        });
        await reload();
      }
    } catch (e) {
      setAuthError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied. Review your reply before sending.");
    } catch {
      notify(
        "Clipboard unavailable. Select the draft text and copy it manually.",
      );
    }
  }
  async function saveMacro(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const payload = {
      name: String(values.name),
      category: String(values.category),
      content: String(values.content),
      tags: String(values.tags)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    setBusy(true);
    try {
      if (demo)
        setData((d) => ({
          ...d,
          macros: editing
            ? d.macros.map((m) =>
                m.id === editing.id ? { ...m, ...payload } : m,
              )
            : [
                ...d.macros,
                { id: crypto.randomUUID(), ...payload, usage_count: 0 },
              ],
        }));
      else {
        await api(
          "macros" + (editing ? "/" + editing.id : ""),
          editing ? "PATCH" : "POST",
          payload,
        );
        await reload();
      }
      setModal(null);
      notify(editing ? "Macro updated." : "Your new macro is ready to use.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveKnowledge(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const payload = {
      name: String(values.name),
      content: scrubPII(String(values.content)).text,
    };
    setBusy(true);
    try {
      if (demo)
        setData((d) => ({
          ...d,
          documents: [
            ...d.documents,
            {
              id: crypto.randomUUID(),
              ...payload,
              status: "ready",
              chunks_count: Math.ceil(payload.content.length / 1200),
            },
          ],
        }));
      else {
        await api("knowledge", "POST", payload);
        await reload();
      }
      setModal(null);
      notify("Knowledge added. It can now ground your drafts.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleteItem) return;
    setBusy(true);
    try {
      if (!demo) await api(deleteItem.kind + "/" + deleteItem.id, "DELETE");
      setData((d) => ({
        ...d,
        macros:
          deleteItem.kind === "macros"
            ? d.macros.filter((x) => x.id !== deleteItem.id)
            : d.macros,
        documents:
          deleteItem.kind === "knowledge"
            ? d.documents.filter((x) => x.id !== deleteItem.id)
            : d.documents,
        history:
          deleteItem.kind === "drafts"
            ? d.history.filter((x) => x.id !== deleteItem.id)
            : d.history,
        members:
          deleteItem.kind === "team/members"
            ? d.members.filter((x) => x.id !== deleteItem.id)
            : d.members,
      }));
      setDeleteItem(null);
      notify("Deleted successfully.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      if (demo)
        notify(
          "Demo: invitations are not sent. Connect your workspace to invite teammates.",
        );
      else {
        const invite = await api("team/invites", "POST", v);
        setInviteUrl(invite.url);
        notify("Invite link created. Share it with your teammate.");
        await reload();
      }
      setModal(null);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget));
    const payload = {
      name: String(v.name),
      tone: String(v.tone),
      retention_days: Number(v.retention),
    };
    setBusy(true);
    try {
      if (!demo) await api("workspace", "PATCH", payload);
      setData((d) => ({ ...d, team: { ...d.team, ...payload } }));
      notify("Workspace preferences saved.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pairExtension() {
    if (demo) {
      notify(
        "Pairing needs a connected account. The extension’s local template mode works without one.",
      );
      return;
    }
    try {
      const value = await api("extension/pair", "POST", {});
      setPairingCode(value.code);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function billing(kind: string) {
    if (demo) {
      notify(
        "Billing is disabled in the local demo. Connect Stripe to activate subscriptions.",
      );
      return;
    }
    try {
      const v = await api("billing/" + kind, "POST", {});
      window.location.assign(v.url);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function changeRole(id: string, role: string) {
    try {
      if (!demo) await api("team/members/" + id, "PATCH", { role });
      setData((d) => ({
        ...d,
        members: d.members.map((m) => (m.id === id ? { ...m, role } : m)),
      }));
      notify("Team role updated.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const isOwner = ["owner", "admin"].includes(data.user.role);
  if (needsWorkspace)
    return (
      <main className="auth-form" style={{ paddingTop: 90 }}>
        <h2>Where will you help?</h2>
        <p className="muted">
          Create a workspace, or open the invitation link your teammate shared
          with you.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const values = new FormData(e.currentTarget);
            try {
              await api("auth/provision", "POST", {
                name: String(values.get("name")),
              });
              await reload();
            } catch (e) {
              setAuthError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Workspace name
            <input
              name="name"
              required
              maxLength={80}
              placeholder="Your company"
            />
          </label>
          <button className="button primary" disabled={busy}>
            Create workspace
          </button>
        </form>
        <p role="status">{authError}</p>
      </main>
    );
  if (!ready)
    return (
      <main className="auth-shell">
        <div className="auth-story">
          <Logo />
          <div>
            <span className="eyebrow">MORE HUMAN. LESS REPETITIVE.</span>
            <h1>
              Great support starts
              <br />
              with a thoughtful reply.
            </h1>
            <p>
              Bring your team’s knowledge into every conversation. Let
              DraftPilot handle the first draft.
            </p>
            <div className="auth-pills">
              <span>
                <ShieldCheck size={16} /> Privacy first
              </span>
              <span>
                <CheckCheck size={16} /> You’re in control
              </span>
            </div>
          </div>
          <span className="muted">
            Made for the people behind great customer experiences.
          </span>
        </div>
        <div className="auth-form">
          <h2>
            {authMode === "login" ? "Welcome back." : "A better way to reply."}
          </h2>
          <p className="muted">
            {authMode === "login"
              ? "Sign in to your DraftPilot workspace."
              : "Create your customer support workspace."}
          </p>
          <form onSubmit={authenticate}>
            {authMode === "signup" && (
              <label>
                Workspace name
                <input
                  name="workspace"
                  required
                  maxLength={80}
                  placeholder="Your company"
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={12}
              />
            </label>
            {authError && (
              <p role="alert" className="form-error">
                {authError}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? <Loader2 className="spin" size={16} /> : null}
              {authMode === "login" ? "Sign in" : "Create workspace"}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="button secondary full"
            onClick={() => window.location.assign("/api/auth/google")}
          >
            Continue with Google
          </button>
          <button
            className="text-button"
            onClick={() =>
              setAuthMode(authMode === "login" ? "signup" : "login")
            }
          >
            {authMode === "login"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
          <a
            className="text-button"
            style={{ display: "block", marginTop: 16 }}
            href="/reset"
          >
            Forgot your password?
          </a>
          <hr />
          <button
            className="text-button"
            onClick={() => {
              setDemo(true);
              setReady(true);
            }}
          >
            Explore the local demo <ArrowUpRight size={14} />
          </button>
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={cx("sidebar", mobile && "open")}>
        <a href="/" className="brand-link" aria-label="DraftPilot home">
          <Logo />
        </a>
        <button className="workspace-switch" onClick={() => go("Settings")}>
          <span className="workspace-avatar">
            A<span />
          </span>
          <span>
            <strong>{data.team.name}</strong>
            <small>{demo ? "Demo workspace" : "Team workspace"}</small>
          </span>
          <ChevronDown size={16} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {navigation.map(([name, Icon]) => (
            <button
              key={name}
              className={cx("nav-item", page === name && "active")}
              onClick={() => go(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === "Draft history" ? (
                <span className="nav-count">{data.history.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="usage-card">
            <div>
              <span>
                <Zap size={15} /> Your drafting power
              </span>
              <span>
                {Math.round(
                  (data.usage / Math.max(1, data.team.monthly_draft_limit)) *
                    100,
                )}
                %
              </span>
            </div>
            <div className="meter">
              <i
                style={{
                  width:
                    Math.min(
                      100,
                      (data.usage /
                        Math.max(1, data.team.monthly_draft_limit)) *
                        100,
                    ) + "%",
                }}
              />
            </div>
            <p>
              <strong>{data.usage.toLocaleString()}</strong> /{" "}
              {data.team.monthly_draft_limit.toLocaleString()} drafts{" "}
              {demo ? "· sample usage" : "this month"}
            </p>
            {data.userQuota && (
              <p>
                Your usage: {data.userQuota.used.toLocaleString()} /{" "}
                {data.userQuota.limit === null
                  ? "workspace cap"
                  : data.userQuota.limit.toLocaleString()}
                {data.userQuota.generationBlocked ? " · drafting disabled" : ""}
              </p>
            )}
            <button onClick={() => billing("checkout")}>
              Explore Team plan <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={cx("nav-item", page === "Settings" && "active")}
            onClick={() => go("Settings")}
          >
            <Settings size={18} />
            Settings
          </button>
          <button className="nav-item" onClick={() => setModal("help")}>
            <HelpCircle size={18} />
            Help & resources
            <ArrowUpRight size={15} />
          </button>
          {(demo || data.platformAdmin) && (
            <a className="nav-item" href="/admin">
              <ShieldCheck size={18} />
              Control center
              <ArrowUpRight size={15} />
            </a>
          )}
          <div className="profile">
            <span className="avatar">AM</span>
            <span>
              <strong>{data.user.full_name || "Your account"}</strong>
              <small>{data.user.email}</small>
            </span>
            <button
              className="icon-button"
              aria-label={demo ? "Account information" : "Sign out"}
              onClick={async () => {
                if (demo) {
                  notify(
                    "You are exploring a local demo. No account is signed in.",
                  );
                  return;
                }
                await fetch("/api/auth/logout", { method: "POST" });
                setReady(false);
              }}
            >
              {demo ? <MoreHorizontal size={18} /> : <LogOut size={17} />}
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <button
              className="search-trigger"
              onClick={() => setModal("search")}
            >
              <Search size={16} />
              <span>Quick search</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="top-divider" />
            <Badge kind={demo ? "neutral" : "green"}>
              <span className="status-dot" />
              {demo ? "Local demo" : "Workspace connected"}
            </Badge>
            <button
              className="icon-button"
              aria-label="Help"
              onClick={() => setModal("help")}
            >
              <HelpCircle size={18} />
            </button>
          </div>
        </header>
        <main id="main" className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Overview"
                  ? "YOUR SUPPORT, SUPERCHARGED"
                  : "YOUR WORKSPACE"}
              </div>
              <h1>
                {page === "Overview" ? (
                  <>
                    A little less typing.
                    <br className="mobile-break" /> A lot more helping
                    <span className="green-dot">.</span>
                  </>
                ) : (
                  page
                )}
              </h1>
              <p>
                {
                  (
                    {
                      Overview:
                        "Everything your team needs to turn questions into great conversations.",
                      "Draft history":
                        "Pick up where you left off. Every response, in one place.",
                      Macros:
                        "Your best answers, ready for the next conversation.",
                      "Knowledge base":
                        "Give every reply a reliable source of truth.",
                      Integrations:
                        "Meet your customers where the conversation happens.",
                      Team: "Great customer experiences are a team effort.",
                      Settings: "Make DraftPilot feel like your team.",
                    } as Record<Page, string>
                  )[page]
                }
              </p>
            </div>
            {
              <button
                className="button primary"
                onClick={() => {
                  if (page === "Macros") {
                    setEditing(undefined);
                    setModal("macro");
                  } else if (page === "Knowledge base") setModal("knowledge");
                  else if (page === "Team") setModal("invite");
                  else go("Integrations");
                }}
              >
                <Plus size={18} />
                {page === "Macros"
                  ? "New macro"
                  : page === "Knowledge base"
                    ? "Add knowledge"
                    : page === "Team"
                      ? "Invite teammate"
                      : "Set up extension"}
              </button>
            }
          </div>
          {demo && (
            <div className="demo-note">
              <span>
                <span className="status-dot" /> You’re in the demo workspace.
                Sample data, real interactions. Changes reset on reload.
              </span>
              <button onClick={() => setModal("help")}>
                Setup guide <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <section className="stats-grid" aria-label="Workspace statistics">
                {[
                  [
                    FileText,
                    "Drafts created",
                    data.usage.toLocaleString(),
                    "Ready for a human touch",
                    "lime",
                  ],
                  [
                    Zap,
                    "Reusable macros",
                    String(data.macros.length),
                    "Your team’s best answers",
                    "purple",
                  ],
                  [
                    BookOpen,
                    "Knowledge sources",
                    String(data.documents.length),
                    "A shared source of truth",
                    "blue",
                  ],
                  [
                    Users,
                    "Team members",
                    String(data.members.length),
                    "Better support, together",
                    "peach",
                  ],
                ].map(([Icon, label, value, caption, color]) => {
                  const I = Icon as typeof FileText;
                  return (
                    <article className="stat-card" key={label as string}>
                      <div className="stat-top">
                        <span>{label as string}</span>
                        <span className={"stat-icon " + color}>
                          <I size={17} />
                        </span>
                      </div>
                      <strong>{value as string}</strong>
                      <p>{caption as string}</p>
                    </article>
                  );
                })}
              </section>
              <div className="overview-grid">
                <section className="panel activity-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Drafting activity</h2>
                      <p>
                        {demo
                          ? "An example of a week with DraftPilot"
                          : "Drafts generated in the last 7 days"}
                      </p>
                    </div>
                    <Badge kind="neutral">
                      Last 7 days <ChevronDown size={12} />
                    </Badge>
                  </div>
                  <div className="chart-summary">
                    <strong>
                      {demo
                        ? "128"
                        : data.history.filter(
                            (h) =>
                              Date.now() - Date.parse(h.created_at) <
                              7 * 86400000,
                          ).length}
                    </strong>
                    <span>
                      drafts created{" "}
                      {demo && <Badge kind="green">Sample activity</Badge>}
                    </span>
                  </div>
                  <div
                    className="chart"
                    role="img"
                    aria-label={
                      demo
                        ? "Sample weekly activity: 12, 18, 14, 23, 16, 27, 18 drafts"
                        : "Daily draft count over the last seven days"
                    }
                  >
                    <div className="chart-y">
                      <span>30</span>
                      <span>20</span>
                      <span>10</span>
                      <span>0</span>
                    </div>
                    <div className="chart-plot">
                      <div className="chart-grid">
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                      <div className="bars">
                        {(demo
                          ? [12, 18, 14, 23, 16, 27, 18]
                          : Array.from(
                              { length: 7 },
                              (_, i) =>
                                data.history.filter(
                                  (h) =>
                                    new Date(h.created_at).toDateString() ===
                                    new Date(
                                      Date.now() - (6 - i) * 86400000,
                                    ).toDateString(),
                                ).length,
                            )
                        ).map((n, i) => (
                          <div className="bar-column" key={i}>
                            <div
                              className={cx("bar", i === 5 && "highlight")}
                              style={{
                                height:
                                  Math.max(2, Math.min(100, (n / 30) * 100)) +
                                  "%",
                              }}
                            >
                              <span>{n} drafts</span>
                            </div>
                            <small>
                              {demo
                                ? [
                                    "Mon",
                                    "Tue",
                                    "Wed",
                                    "Thu",
                                    "Fri",
                                    "Sat",
                                    "Sun",
                                  ][i]
                                : new Date(
                                    Date.now() - (6 - i) * 86400000,
                                  ).toLocaleDateString("en", {
                                    weekday: "short",
                                  })}
                            </small>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="chart-footer">
                    <span className="legend-dot" /> Drafts generated{" "}
                    <span className="muted">A little momentum, every day.</span>
                  </div>
                </section>
                <section className="start-card">
                  <div className="orbital">
                    <div className="orbit one" />
                    <div className="orbit two" />
                    <span className="spark-large">
                      <Sparkles size={38} />
                    </span>
                    <span className="floating-mail">
                      <Mail size={18} />
                    </span>
                    <span className="floating-zap">
                      <Zap size={16} />
                    </span>
                    <span className="mini-spark">✦</span>
                  </div>
                  <Badge kind="dark">YOUR REPLY, WITH A HEAD START</Badge>
                  <h2>
                    Skip the blank page.
                    <br />
                    Keep the human touch.
                  </h2>
                  <p>
                    Turn a customer question into a thoughtful first draft, in
                    your team’s voice.
                  </p>
                  <button
                    className="button light"
                    onClick={() => go("Integrations")}
                  >
                    Set up your extension <ArrowRight size={16} />
                  </button>
                  <div className="start-foot">
                    <ShieldCheck size={14} /> Review first. Send when you’re
                    ready.
                  </div>
                </section>
              </div>
              <div className="overview-bottom">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Recent drafts</h2>
                      <p>A few conversations moving forward.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("Draft history")}
                    >
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="draft-list">
                    {data.history.slice(0, 3).map((h, i) => (
                      <button
                        className="draft-row"
                        key={h.id}
                        onClick={() => setHistoryItem(h)}
                      >
                        <span
                          className={
                            "row-icon " + ["peach", "blue", "purple"][i]
                          }
                        >
                          <Mail size={18} />
                        </span>
                        <span className="draft-row-text">
                          <strong>
                            {h.generated_draft
                              .split("\n")
                              .filter(Boolean)[1]
                              ?.slice(0, 51) || "Customer support reply"}
                          </strong>
                          <small>
                            {h.channel[0].toUpperCase() + h.channel.slice(1)}{" "}
                            <span>·</span>{" "}
                            {new Date(h.created_at).toLocaleDateString("en", {
                              month: "short",
                              day: "numeric",
                            })}
                          </small>
                        </span>
                        <Badge
                          kind={h.status === "reviewed" ? "green" : "neutral"}
                        >
                          {h.status === "reviewed" ? "Reviewed" : "Draft"}
                        </Badge>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {!data.history.length && (
                      <div className="empty-state">
                        <FileText />
                        <h3>Your first great reply starts here</h3>
                        <button
                          className="text-button"
                          onClick={() => go("Integrations")}
                        >
                          Create your first draft <ArrowRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
                <section className="panel knowledge-overview">
                  <div className="section-heading">
                    <div>
                      <h2>Make every reply better</h2>
                      <p>A little setup goes a long way.</p>
                    </div>
                  </div>
                  {[
                    [
                      "Add your team’s knowledge",
                      "Help DraftPilot find the right answers.",
                      "Knowledge base",
                      BookOpen,
                    ],
                    [
                      "Save your go-to responses",
                      "Great answers deserve a second use.",
                      "Macros",
                      Zap,
                    ],
                    [
                      "Bring DraftPilot to your inbox",
                      "Less switching. More helping.",
                      "Integrations",
                      Mail,
                    ],
                  ].map(([title, desc, target, Icon], i) => {
                    const I = Icon as typeof Mail;
                    return (
                      <button
                        className="setup-row"
                        key={i}
                        onClick={() => go(target as Page)}
                      >
                        <span className="setup-icon">
                          <I size={18} />
                        </span>
                        <span>
                          <strong>{title as string}</strong>
                          <small>{desc as string}</small>
                        </span>
                        <ArrowUpRight size={17} />
                      </button>
                    );
                  })}
                </section>
              </div>
            </>
          )}
          {page === "Macros" && (
            <>
              <div className="toolbar">
                <div className="filter-tabs">
                  {["All", "Orders", "Returns", "Account", "Billing"].map(
                    (f) => (
                      <button
                        key={f}
                        className={filter === f ? "active" : ""}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                        {f === "All" && <span>{data.macros.length}</span>}
                      </button>
                    ),
                  )}
                </div>
                <div className="search-input">
                  <Search size={16} />
                  <input
                    aria-label="Search macros"
                    placeholder="Search macros…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="macro-grid">
                {data.macros
                  .filter(
                    (m) =>
                      (filter === "All" || m.category === filter) &&
                      (m.name + " " + m.content + " " + m.tags.join(" "))
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((m, i) => (
                    <article className="panel macro-card" key={m.id}>
                      <div className="macro-top">
                        <span
                          className={
                            "row-icon " +
                            ["lime", "peach", "purple", "blue"][i % 4]
                          }
                        >
                          <Zap size={20} />
                        </span>
                        <div>
                          <button
                            className="icon-button"
                            aria-label={"Edit " + m.name}
                            onClick={() => {
                              setEditing(m);
                              setModal("macro");
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={"Delete " + m.name}
                            onClick={() =>
                              setDeleteItem({
                                kind: "macros",
                                id: m.id,
                                name: m.name,
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <Badge kind="neutral">{m.category}</Badge>
                      <h2>{m.name}</h2>
                      <p>{m.content}</p>
                      <div className="tags">
                        {m.tags.map((t) => (
                          <span key={t}>#{t}</span>
                        ))}
                      </div>
                      <div className="macro-footer">
                        <span>
                          {m.usage_count || 0} uses {demo ? "· sample" : ""}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => {
                            go("Integrations");
                          }}
                        >
                          Use macro <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                <button
                  className="add-card"
                  onClick={() => {
                    setEditing(undefined);
                    setModal("macro");
                  }}
                >
                  <span>
                    <Plus size={24} />
                  </span>
                  <h3>Your next go-to answer</h3>
                  <p>Create a macro your whole team can use.</p>
                </button>
              </div>
            </>
          )}
          {page === "Knowledge base" && (
            <>
              <div className="knowledge-banner">
                <div className="banner-icon">
                  <BookOpen size={27} />
                </div>
                <div>
                  <h2>Better context. Better conversations.</h2>
                  <p>
                    Add policies, product guides, and FAQs. DraftPilot retrieves
                    relevant passages when drafting a reply.
                  </p>
                </div>
                <Badge>Team-scoped knowledge</Badge>
              </div>
              <div className="panel">
                <div className="section-heading">
                  <h2>
                    Knowledge library{" "}
                    <span className="count">{data.documents.length}</span>
                  </h2>
                  <div className="search-input">
                    <Search size={16} />
                    <input
                      aria-label="Search knowledge"
                      placeholder="Find a source…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Source name</th>
                        <th>Status</th>
                        <th>Passages</th>
                        <th>Access</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.documents
                        .filter((d) =>
                          d.name.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((d) => (
                          <tr key={d.id}>
                            <td>
                              <span className="file-cell">
                                <span className="row-icon blue">
                                  <FileText size={18} />
                                </span>
                                <span>
                                  <strong>{d.name}</strong>
                                  <small>Text document</small>
                                </span>
                              </span>
                            </td>
                            <td>
                              <Badge>
                                <span className="status-dot" />
                                {d.status}
                              </Badge>
                            </td>
                            <td>{d.chunks_count}</td>
                            <td>
                              <span className="muted">
                                <Users size={14} /> Your team
                              </span>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={"Delete " + d.name}
                                onClick={() =>
                                  setDeleteItem({
                                    kind: "knowledge",
                                    id: d.id,
                                    name: d.name,
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!data.documents.length && (
                    <div className="empty-state">
                      <BookOpen />
                      <h3>Give your drafts a source of truth</h3>
                      <p>Add your first policy or guide to get started.</p>
                    </div>
                  )}
                </div>
              </div>
              <p className="bottom-note">
                <ShieldCheck size={14} /> Add only information your team is
                authorized to use. Remove customer records and secrets.
              </p>
            </>
          )}
          {page === "Draft history" && (
            <>
              <div className="toolbar">
                <div className="filter-tabs">
                  {["All", "Draft", "Reviewed"].map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "active" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="search-input">
                  <Search size={16} />
                  <input
                    aria-label="Search draft history"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search replies…"
                  />
                </div>
              </div>
              <section className="panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Reply preview</th>
                        <th>Channel</th>
                        <th>Created</th>
                        <th>Status</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history
                        .filter(
                          (h) =>
                            (filter === "All" ||
                              h.status === filter.toLowerCase()) &&
                            h.generated_draft
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                        )
                        .map((h) => (
                          <tr key={h.id}>
                            <td>
                              <button
                                className="history-preview"
                                onClick={() => setHistoryItem(h)}
                              >
                                <span className="row-icon lime">
                                  <MessageSquare size={18} />
                                </span>
                                <span>
                                  {h.generated_draft
                                    .split("\n")
                                    .filter(Boolean)[1]
                                    ?.slice(0, 70) || "Customer reply"}
                                </span>
                              </button>
                            </td>
                            <td className="capitalize">{h.channel}</td>
                            <td>
                              {new Date(h.created_at).toLocaleDateString("en", {
                                month: "short",
                                day: "numeric",
                              })}
                            </td>
                            <td>
                              <Badge
                                kind={
                                  h.status === "reviewed" ? "green" : "neutral"
                                }
                              >
                                {h.status}
                              </Badge>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label="Delete draft"
                                onClick={() =>
                                  setDeleteItem({
                                    kind: "drafts",
                                    id: h.id,
                                    name: "this draft",
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!data.history.length && (
                  <div className="empty-state">
                    <History />
                    <h3>No drafts yet</h3>
                    <p>
                      Your replies will appear here after you generate them.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
          {page === "Integrations" && (
            <>
              <div className="integration-feature panel">
                <div>
                  <Badge>CHROME EXTENSION</Badge>
                  <h2>
                    Your copilot.
                    <br />
                    Right where you reply.
                  </h2>
                  <p>
                    Capture a message in Gmail, Zendesk or another web platform,
                    review the redacted context, and insert a draft when you’re
                    ready. Sending stays in your hands.
                  </p>
                  <a
                    className="button primary"
                    href="/draftpilot-extension.zip"
                    download
                  >
                    <Download size={16} />
                    Download local extension
                  </a>
                  <button className="button secondary" onClick={pairExtension}>
                    Pair extension
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setModal("help")}
                  >
                    Installation instructions <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="inbox-illustration">
                  <div className="mini-inbox">
                    <span>
                      <Mail size={15} />
                      Inbox
                    </span>
                    <i />
                    <i />
                    <i />
                    <div className="mini-message">
                      Could you help with my order?
                      <div>
                        <Sparkles size={13} /> Let’s find the right words.
                      </div>
                    </div>
                  </div>
                  <div className="mini-copilot">
                    <span className="brand-mark">
                      <Zap size={19} />
                    </span>
                    <strong>DraftPilot</strong>
                    <div className="mini-lines">
                      <i />
                      <i />
                      <i />
                    </div>
                    <span className="mini-button">
                      Review & insert <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              </div>
              {extensionSessions.length > 0 && (
                <section className="panel session-panel">
                  <h2>Connected extension sessions</h2>
                  {extensionSessions.map((session) => (
                    <div key={session.id}>
                      <span>
                        {session.name} · expires{" "}
                        {new Date(session.expires_at).toLocaleDateString()}
                      </span>
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await api(
                              "extension/sessions/" + session.id,
                              "DELETE",
                            );
                            setExtensionSessions((s) =>
                              s.filter((v) => v.id !== session.id),
                            );
                            notify("Extension session revoked.");
                          } catch (e) {
                            notify((e as Error).message);
                          }
                        }}
                      >
                        Revoke access
                      </button>
                    </div>
                  ))}
                </section>
              )}
              <div className="integration-grid">
                {[
                  [
                    "Gmail",
                    "mail",
                    "Native extension",
                    "Read the active conversation and insert reviewed text into Gmail.",
                  ],
                  [
                    "Outlook",
                    "outlook",
                    "Email adapter",
                    "Read the open Outlook web conversation, then review and insert your reply. No copying needed.",
                  ],
                  [
                    "Zendesk",
                    "zendesk",
                    "Ticket adapter",
                    "Read the ticket with the Zendesk adapter, or select a message. Review and insert in-page.",
                  ],
                  [
                    "Intercom",
                    "intercom",
                    "Universal capture",
                    "Capture a selected message and insert a reviewed reply without leaving the conversation.",
                  ],
                  [
                    "Crisp",
                    "crisp",
                    "Configurable watcher",
                    "Pick a customer message to configure in-page drafts. Live inbox compatibility needs signed-in verification.",
                  ],
                  [
                    "Mevrik",
                    "mevrik",
                    "Configurable watcher",
                    "Capture and insert in-page, with watching on supported message layouts. Live inbox verification is pending.",
                  ],
                ].map(([name, brand, status, description]) => (
                  <article className="panel integration-card" key={name}>
                    <div className="integration-card-top">
                      <span className={"platform-icon " + brand}>
                        {name === "Gmail" ? (
                          <Mail />
                        ) : name === "Outlook" ? (
                          "O"
                        ) : name === "Zendesk" ? (
                          "Z"
                        ) : (
                          <MessageSquare />
                        )}
                      </span>
                      <Badge kind="neutral">{status}</Badge>
                    </div>
                    <h2>{name}</h2>
                    <p>{description}</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        go("Integrations");
                      }}
                    >
                      Try draft studio <ArrowUpRight size={14} />
                    </button>
                  </article>
                ))}
              </div>
              <p className="bottom-note">
                <Globe size={14} /> Select a message on any regular web page and
                click the extension. Restricted pages and inaccessible frames
                may block capture or insertion. Replies always require your
                confirmation.
              </p>
            </>
          )}
          {page === "Team" && (
            <>
              <div className="panel">
                <div className="section-heading">
                  <div>
                    <h2>The people behind your support</h2>
                    <p>
                      {data.members.length} / {data.team.seat_limit || 1} seats
                      in {data.team.name}
                    </p>
                  </div>
                  <Badge>Shared workspace</Badge>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Team member</th>
                        <th>Role</th>
                        <th>Access</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.members.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <span className="file-cell">
                              <span className="avatar">
                                {(m.full_name || m.email)
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                              <span>
                                <strong>
                                  {m.full_name || m.email.split("@")[0]}
                                  {m.id === data.user.id ? " (you)" : ""}
                                </strong>
                                <small>{m.email}</small>
                              </span>
                            </span>
                          </td>
                          <td>
                            {data.user.role === "owner" &&
                            m.role !== "owner" ? (
                              <select
                                aria-label={"Role for " + m.email}
                                value={m.role}
                                onChange={(e) =>
                                  changeRole(m.id, e.target.value)
                                }
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                              </select>
                            ) : (
                              <Badge kind="neutral">{m.role}</Badge>
                            )}
                          </td>
                          <td>
                            <span className="muted">
                              <CheckCircle2 size={14} />
                              Active
                            </span>
                          </td>
                          <td>
                            {isOwner &&
                              m.id !== data.user.id &&
                              m.role !== "owner" &&
                              (data.user.role === "owner" ||
                                m.role === "member") && (
                                <button
                                  className="icon-button"
                                  aria-label={"Remove " + m.email}
                                  onClick={() =>
                                    setDeleteItem({
                                      kind: "team/members",
                                      id: m.id,
                                      name: m.full_name || m.email,
                                    })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="team-note">
                <ShieldCheck size={23} />
                <div>
                  <h3>A shared brain. Clear boundaries.</h3>
                  <p>
                    Members draft replies and use team knowledge. Admins manage
                    content and invitations. Owners manage billing and workspace
                    preferences.
                  </p>
                </div>
              </div>
            </>
          )}
          {page === "Settings" && (
            <div className="settings-grid">
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Workspace preferences</h2>
                    <p>The defaults behind every thoughtful reply.</p>
                  </div>
                  <SlidersHorizontal size={20} />
                </div>
                <form className="panel-body" onSubmit={saveSettings}>
                  <label>
                    Workspace name
                    <input
                      name="name"
                      defaultValue={data.team.name}
                      required
                      maxLength={80}
                      disabled={data.user.role !== "owner"}
                    />
                  </label>
                  <label>
                    Default tone
                    <select
                      name="tone"
                      defaultValue={data.team.tone}
                      disabled={data.user.role !== "owner"}
                    >
                      {tones.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Draft retention
                    <select
                      name="retention"
                      defaultValue={data.team.retention_days}
                      disabled={data.user.role !== "owner"}
                    >
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                    </select>
                  </label>
                  <p className="field-hint">
                    Expired draft content is removed by the scheduled retention
                    job. Original customer messages are not saved.
                  </p>
                  <button
                    className="button primary"
                    disabled={busy || data.user.role !== "owner"}
                  >
                    <Check size={16} />
                    Save preferences
                  </button>
                </form>
              </section>
              <div>
                <section className="panel plan-panel">
                  <Badge>TEAM PLAN</Badge>
                  <h2>More room to help.</h2>
                  <div className="price">
                    $19 <span>/ seat / month</span>
                  </div>
                  <p>
                    1,000 drafts per seat, shared knowledge, and team
                    collaboration.
                  </p>
                  <button
                    className="button primary full"
                    onClick={() => billing("checkout")}
                  >
                    Upgrade workspace <ArrowUpRight size={15} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => billing("portal")}
                  >
                    Manage existing subscription
                  </button>
                </section>
                <section className="panel security-panel">
                  <h2>
                    <ShieldCheck size={18} /> Privacy by design
                  </h2>
                  <p>
                    <Check size={14} /> Sensitive-pattern redaction
                  </p>
                  <p>
                    <Check size={14} /> Tenant-scoped data access
                  </p>
                  <p>
                    <Check size={14} /> Human approval before sending
                  </p>
                  <p>
                    <Check size={14} /> Server-only provider credentials
                  </p>
                  <small>
                    Redaction and AI output still need human review.
                  </small>
                </section>
              </div>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <span className="tiny-logo">ϟ</span> A thoughtful reply, every
              time.
            </span>
            <span>
              <ShieldCheck size={13} /> Built around your team. Designed for
              trust.
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {pairingCode && (
        <Modal
          title="Connect your browser extension"
          onClose={() => setPairingCode("")}
        >
          <p className="muted">
            Paste this one-time code into the extension. It expires in 5 minutes
            and grants access to drafting only.
          </p>
          <pre className="pair-code">{pairingCode}</pre>
          <button className="button primary" onClick={() => copy(pairingCode)}>
            <Copy size={15} />
            Copy pairing code
          </button>
        </Modal>
      )}
      {inviteUrl && (
        <Modal
          title="Your teammate’s invitation"
          onClose={() => setInviteUrl("")}
        >
          <p className="muted">
            Share this link with the intended recipient. They must sign in with
            the invited email address. The link expires in 7 days.
          </p>
          <input aria-label="Invitation link" readOnly value={inviteUrl} />
          <div className="modal-actions">
            <button className="button primary" onClick={() => copy(inviteUrl)}>
              <Copy size={15} />
              Copy invite link
            </button>
          </div>
        </Modal>
      )}
      {modal === "macro" && (
        <Modal
          title={editing ? "Edit macro" : "A great answer, ready to reuse"}
          onClose={() => setModal(null)}
        >
          <form onSubmit={saveMacro}>
            <label>
              Macro name
              <input
                autoFocus
                name="name"
                defaultValue={editing?.name}
                placeholder="e.g. Order status update"
                required
                maxLength={100}
              />
            </label>
            <label>
              Category
              <select
                name="category"
                defaultValue={editing?.category || "General"}
              >
                {[
                  "General",
                  "Orders",
                  "Returns",
                  "Account",
                  "Billing",
                  "Technical",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Response guidance
              <textarea
                name="content"
                defaultValue={editing?.content}
                placeholder="Add the approved information your team should use…"
                required
                minLength={10}
                maxLength={8000}
                rows={6}
              />
            </label>
            <label>
              Tags <span className="optional">Comma separated</span>
              <input
                name="tags"
                defaultValue={editing?.tags.join(", ")}
                placeholder="shipping, tracking"
                maxLength={200}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                <Check size={15} />
                Save macro
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "knowledge" && (
        <Modal title="Add a source of truth" onClose={() => setModal(null)}>
          <p className="muted">
            Add approved policies, product details, or FAQs. Sensitive patterns
            are redacted before saving.
          </p>
          <form onSubmit={saveKnowledge}>
            <label>
              Source name
              <input
                autoFocus
                name="name"
                required
                maxLength={100}
                placeholder="e.g. Shipping & delivery guide"
              />
            </label>
            <label>
              Import a file{" "}
              <span className="optional">
                TXT, MD, XLSX, CSV, TSV · up to 500 KB
              </span>
              <input
                type="file"
                accept=".txt,.md,.xlsx,.csv,.tsv"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const f = input.files?.[0];
                  if (!f) return;
                  const form = input.form!;
                  setBusy(true);
                  try {
                    const text = await importKnowledge(f);
                    (
                      form.elements.namedItem("content") as HTMLTextAreaElement
                    ).value = text;
                    (
                      form.elements.namedItem("name") as HTMLInputElement
                    ).value = f.name.replace(/\.[^.]+$/, "");
                    notify(
                      "File imported locally. Review its contents before adding it.",
                    );
                  } catch (error) {
                    notify((error as Error).message);
                    input.value = "";
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <label>
              Source content
              <textarea
                name="content"
                rows={8}
                minLength={20}
                maxLength={100000}
                required
                placeholder="Paste the guidance your team can rely on…"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                <Plus size={15} />
                Add knowledge
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "invite" && (
        <Modal title="Make room for a teammate" onClose={() => setModal(null)}>
          <p className="muted">
            Create a workspace invite. Existing members cannot be moved between
            teams through an invitation.
          </p>
          <form onSubmit={invite}>
            <label>
              Email address
              <input
                autoFocus
                name="email"
                type="email"
                required
                placeholder="teammate@company.com"
              />
            </label>
            <label>
              Role
              <select name="role">
                <option value="member">
                  Member — create and review drafts
                </option>
                <option value="admin">Admin — also manage team content</option>
              </select>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                Create invite <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Your DraftPilot field guide"
          onClose={() => setModal(null)}
        >
          <div className="help-content">
            <h3>Start with a thoughtful first draft</h3>
            <p>
              Pair your extension, capture a customer question in your inbox,
              and generate. Edit the result, check its sources, then copy it
              into your support platform.
            </p>
            <h3>Install the universal extension locally</h3>
            <ol>
              <li>Download and unzip the extension from Integrations.</li>
              <li>Open chrome://extensions and enable Developer mode.</li>
              <li>Select Load unpacked and choose the extracted folder.</li>
              <li>
                Open Gmail or Zendesk, or select a message on any regular web
                page, then click DraftPilot. Local template mode works without
                an account.
              </li>
            </ol>
            <h3>Connect your production accounts</h3>
            <p>
              The included README and LAUNCH.md cover Supabase migrations, AI
              keys, Stripe, HTTPS, and extension configuration. The current demo
              is not connected to live services.
            </p>
            <h3>Your privacy matters</h3>
            <p>
              Pattern matching does not detect all personal information. Review
              redacted context and every response. DraftPilot does not
              automatically send email.
            </p>
          </div>
        </Modal>
      )}
      {modal === "search" && (
        <Modal title="Find your next step" onClose={() => setModal(null)}>
          <div className="search-input modal-search">
            <Search size={18} />
            <input
              autoFocus
              placeholder="Search pages and macros…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="command-results">
            {navigation
              .filter(([name]) =>
                name.toLowerCase().includes(search.toLowerCase()),
              )
              .map(([name, Icon]) => (
                <button key={name} onClick={() => go(name)}>
                  <Icon size={17} />
                  {name}
                  <ArrowRight size={14} />
                </button>
              ))}
            {data.macros
              .filter(
                (m) =>
                  search && m.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    go("Integrations");
                  }}
                >
                  <Zap size={17} />
                  {m.name}
                  <span>Macro</span>
                </button>
              ))}
          </div>
        </Modal>
      )}
      {historyItem && (
        <Modal
          title="A conversation, moving forward"
          onClose={() => setHistoryItem(null)}
        >
          <div className="history-meta">
            <Badge kind="neutral">{historyItem.channel}</Badge>
            <Badge>{historyItem.status}</Badge>
            <span>{new Date(historyItem.created_at).toLocaleString()}</span>
          </div>
          <pre className="history-body">{historyItem.generated_draft}</pre>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                setHistoryItem(null);
                go("Integrations");
              }}
            >
              <Pencil size={15} />
              Continue editing
            </button>
            <button
              className="button primary"
              onClick={() => copy(historyItem.generated_draft)}
            >
              <Copy size={15} />
              Copy reply
            </button>
          </div>
        </Modal>
      )}
      {deleteItem && (
        <Modal
          title={"Delete " + deleteItem.name + "?"}
          onClose={() => setDeleteItem(null)}
        >
          <p className="muted">
            {deleteItem.kind === "team/members"
              ? "This revokes their workspace and extension access. Team drafts remain available. You can invite them again later."
              : "This removes it from your workspace. This action cannot be undone."}
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteItem(null)}
            >
              Keep it
            </button>
            <button className="button danger" onClick={remove} disabled={busy}>
              <Trash2 size={15} />
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
