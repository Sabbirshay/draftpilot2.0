import { readFileSync, existsSync } from "node:fs";
const required = [
  "APP_URL",
  "API_PUBLIC_URL",
  "API_INTERNAL_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_TEAM_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
  "RETENTION_JOB_SECRET",
  "EXTENSION_ORIGINS",
];
const issues = [];
for (const key of required)
  if (!process.env[key]) issues.push(`${key} is missing.`);
for (const key of ["APP_URL", "API_PUBLIC_URL", "SUPABASE_URL"])
  if (process.env[key]) {
    try {
      const url = new URL(process.env[key]);
      if (url.protocol !== "https:") issues.push(`${key} must use HTTPS.`);
    } catch {
      issues.push(`${key} is not a valid URL.`);
    }
  }
if (
  Buffer.from(process.env.AI_KEY_ENCRYPTION_KEY || "", "base64").length !== 32
)
  issues.push("AI_KEY_ENCRYPTION_KEY must be a 32-byte base64 server secret.");
const daily = Number(process.env.AI_DAILY_CALL_LIMIT || "1000");
if (!Number.isInteger(daily) || daily < 1 || daily > 100000)
  issues.push("AI_DAILY_CALL_LIMIT must be between 1 and 100000.");
if ((process.env.RETENTION_JOB_SECRET || "").length < 32)
  issues.push("RETENTION_JOB_SECRET must contain at least 32 characters.");
if (process.env.DRAFTPILOT_DEMO === "1")
  issues.push("Disable demo mode before customer launch.");
if (!existsSync("packages/web/public/draftpilot-extension.zip"))
  issues.push("Build the extension package.");
const manifest = "packages/extension/dist/manifest.json";
if (existsSync(manifest)) {
  const data = JSON.parse(readFileSync(manifest, "utf8"));
  if (data.host_permissions.some((p) => p.startsWith("http:")))
    issues.push("Rebuild the extension with the production HTTPS API origin.");
}
if (issues.length) {
  console.error(
    "NOT READY FOR CUSTOMER LAUNCH\n" + issues.map((i) => "- " + i).join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    "Configuration checks passed. Complete the live verification and operational checks in LAUNCH.md before launch.",
  );
