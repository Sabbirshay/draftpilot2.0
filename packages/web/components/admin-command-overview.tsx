import {
  Users,
  Building2,
  Sparkles,
  Activity,
  Coins,
  Gauge,
} from "lucide-react";
export type CommandMetrics = {
  draftsCompleted: number;
  aiCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reportedCostUsd: number;
  estimatedCostUsd: number;
  unpricedCalls: number;
  unmeteredCalls: number;
  pendingCalls: number;
  failedCalls: number;
  trackingSince: string | null;
  monthStart: string;
  uptimeSeconds: number;
  observedAt: string;
  service: string;
};
const number = (n: number | undefined) =>
  n === undefined ? "—" : n.toLocaleString();
const dollars = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(n);
function uptime(seconds: number) {
  const minutes = Math.floor(seconds / 60),
    hours = Math.floor(minutes / 60);
  return hours >= 24
    ? `${Math.floor(hours / 24)}d ${hours % 24}h`
    : hours
      ? `${hours}h ${minutes % 60}m`
      : `${minutes}m ${seconds % 60}s`;
}
export default function AdminCommandOverview({
  metrics,
  command,
  demo,
  stale,
  updatedAt,
}: {
  metrics:
    { users: number; workspaces: number; monthDrafts: number } | undefined;
  command?: CommandMetrics;
  demo: boolean;
  stale: boolean;
  updatedAt: string;
}) {
  const cards = [
    {
      label: "Total users",
      value: number(metrics?.users),
      detail: "Provisioned customer accounts",
      Icon: Users,
    },
    {
      label: "Workspaces",
      value: number(metrics?.workspaces),
      detail: "Across your platform",
      Icon: Building2,
    },
    {
      label: "Drafts this month",
      value: number(demo ? metrics?.monthDrafts : command?.draftsCompleted),
      detail: "Completed · UTC calendar month",
      Icon: Sparkles,
    },
    {
      label: "Service uptime",
      value: command && !stale ? uptime(command.uptimeSeconds) : "—",
      detail: demo
        ? "Connect your API to monitor"
        : stale
          ? "Service check unavailable"
          : "Current API process · resets on restart",
      Icon: Activity,
    },
    {
      label: "AI tokens this month",
      value: number(command?.totalTokens),
      detail: command
        ? `${number(command.inputTokens)} input · ${number(command.outputTokens)} output`
        : "Tracking starts with connected usage",
      Icon: Gauge,
    },
    {
      label: "AI cost this month",
      value: command
        ? command.aiCalls > 0 && command.unpricedCalls === command.aiCalls
          ? "Unknown"
          : dollars(command.reportedCostUsd + command.estimatedCostUsd)
        : "—",
      detail: command
        ? `${command.estimatedCostUsd > 0 ? "Includes estimates" : "Provider-reported"}${command.unpricedCalls ? ` · ${command.unpricedCalls} unpriced calls` : " · USD"}`
        : "No live billing data in demo",
      Icon: Coins,
    },
  ];
  return (
    <section className="admin-command" aria-labelledby="command-title">
      <div className="admin-command-heading">
        <div>
          <h2 id="command-title">Command overview</h2>
          <p>Platform totals and AI usage, together in your user directory.</p>
        </div>
        <div className={`admin-live-indicator${stale ? " stale" : ""}`}>
          <span />
          {demo
            ? "Sample data · not live"
            : stale
              ? "Updates interrupted"
              : "Live · refreshes every 5s"}
          <small>
            {updatedAt
              ? `Last checked ${new Date(updatedAt).toLocaleTimeString()}`
              : demo
                ? "Connect your services to begin"
                : "Waiting for first snapshot"}
          </small>
        </div>
      </div>
      <div className="admin-stats admin-command-stats">
        {cards.map(({ label, value, detail, Icon }) => (
          <div className="admin-stat" key={label}>
            <span>
              {label}
              <Icon size={17} />
            </span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      {command && (
        <div className="admin-metering-note">
          <span>
            {number(command.aiCalls)} provider attempts ·{" "}
            {number(command.pendingCalls)} pending ·{" "}
            {number(command.failedCalls)} failed
          </span>
          <span>
            {dollars(command.reportedCostUsd)} reported +{" "}
            {dollars(command.estimatedCostUsd)} estimated
          </span>
          <p>
            Includes chat, embeddings, retries, and admin tests.{" "}
            {command.unmeteredCalls > 0
              ? `${command.unmeteredCalls} calls have missing token data. `
              : ""}
            Unpriced calls are excluded from cost totals. Estimates are not
            invoices. Usage before tracking was enabled is not included.
          </p>
        </div>
      )}
    </section>
  );
}
