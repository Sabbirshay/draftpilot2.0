const url = process.env.API_PUBLIC_URL,
  secret = process.env.RETENTION_JOB_SECRET;
if (!url || !secret)
  throw new Error("Set API_PUBLIC_URL and RETENTION_JOB_SECRET.");
const response = await fetch(url.replace(/\/$/, "") + "/internal/retention", {
  method: "POST",
  headers: { Authorization: "Bearer " + secret },
  signal: AbortSignal.timeout(60000),
});
if (!response.ok) throw new Error(`Retention job failed: ${response.status}`);
console.log("Retention job completed.");
