import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  startLocalApi,
  adminBearer,
  testBearer,
  weakAdminBearer,
} = require("./helpers/local-api.cjs");
const {
  measuredJSON,
  usageValues,
} = require("../packages/api/dist/ai-usage.js");
let api: any;
before(async () => {
  api = await startLocalApi();
});
after(async () => {
  await api?.close();
});
const overview = async (token = adminBearer) => {
  const r = await fetch(api.url + "/admin/overview", {
    headers: { Authorization: "Bearer " + token },
  });
  return { status: r.status, body: await r.json() };
};
test("live metrics are MFA-admin-only and reflect newly provisioned accounts", async () => {
  assert.equal((await overview(testBearer)).status, 403);
  assert.equal((await overview(weakAdminBearer)).status, 403);
  const initial = (await overview()).body;
  const user = crypto.randomUUID();
  await api.db.query("insert into auth.users(id) values($1)", [user]);
  await api.db.query(
    "select provision_workspace($1,'new@example.test','New team')",
    [user],
  );
  const next = (await overview()).body;
  assert.equal(next.metrics.users, initial.metrics.users + 1);
  assert.equal(next.metrics.workspaces, initial.metrics.workspaces + 1);
  assert.equal(next.command.service, "operational");
  assert.ok(next.command.uptimeSeconds >= 0);
  assert.ok(Number.isFinite(Date.parse(next.command.observedAt)));
});
test("paid attempts persist reported/estimated usage and missing or failed costs remain unknown", async () => {
  await measuredJSON("openrouter", "provider/model", "chat", async () =>
    Response.json({
      usage: {
        prompt_tokens: 40,
        completion_tokens: 10,
        total_tokens: 50,
        cost: 0.002,
      },
    }),
  );
  await measuredJSON("openai", "gpt-4o-mini", "chat", async () =>
    Response.json({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 40 },
      },
    }),
  );
  await measuredJSON(
    "openai",
    "text-embedding-3-small",
    "embedding",
    async () =>
      Response.json({ usage: { prompt_tokens: 500, total_tokens: 500 } }),
  );
  await measuredJSON("openai", "unknown-model", "chat", async () =>
    Response.json({
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    }),
  );
  await assert.rejects(
    measuredJSON(
      "openrouter",
      "provider/model",
      "chat",
      async () => new Response("not authorized", { status: 401 }),
    ),
  );
  const c = (await overview()).body.command;
  assert.equal(c.aiCalls, 5);
  assert.equal(c.totalTokens, 673);
  assert.equal(c.inputTokens, 641);
  assert.equal(c.outputTokens, 32);
  assert.equal(c.reportedCostUsd, 0.002);
  assert.ok(Math.abs(c.estimatedCostUsd - 0.000034) < 1e-10);
  assert.equal(c.unpricedCalls, 2);
  assert.equal(c.unmeteredCalls, 1);
  assert.equal(c.failedCalls, 1);
  assert.equal(c.pendingCalls, 0);
  const columns = (
    await api.db.query(
      "select column_name from information_schema.columns where table_name='ai_usage_events'",
    )
  ).rows.map((r: any) => r.column_name);
  assert.ok(!columns.some((c: string) => /key|secret|prompt|content/.test(c)));
});
test("ordinary database roles cannot read, write or aggregate platform telemetry", async () => {
  for (const role of ["anon", "authenticated"]) {
    await api.db.exec("set role " + role);
    try {
      for (const sql of [
        "select * from ai_usage_events",
        "select admin_live_metrics()",
        "delete from ai_usage_events",
        "update ai_usage_events set cost_usd=0",
        "insert into ai_usage_events(id,provider,model,kind) values(gen_random_uuid(),'openai','x','chat')",
      ])
        await assert.rejects(api.db.query(sql), /permission denied/);
    } finally {
      await api.db.exec("reset role");
    }
  }
});
test("ledger reservation failure blocks the provider request before spending", async () => {
  await api.db.exec(
    "alter table ai_usage_events rename to ai_usage_events_unavailable",
  );
  let calls = 0;
  try {
    await assert.rejects(
      measuredJSON("openai", "gpt-4o-mini", "chat", async () => {
        calls++;
        return Response.json({});
      }),
      /accounting is unavailable/,
    );
    assert.equal(calls, 0);
  } finally {
    await api.db.exec(
      "alter table ai_usage_events_unavailable rename to ai_usage_events",
    );
  }
});
test("invalid usage cannot invent free spend or negative tokens, cached tokens are capped", () => {
  assert.equal(
    usageValues("openrouter", "m", { usage: { cost: -5 } }).cost_usd,
    null,
  );
  assert.equal(
    usageValues("openai", "m", { usage: { total_tokens: -10 } }).total_tokens,
    null,
  );
  assert.equal(
    usageValues("openai", "unrecognized", {
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    }).cost_usd,
    null,
  );
  assert.equal(
    usageValues("openrouter", "m", { usage: { cost: 0, total_tokens: 0 } })
      .cost_usd,
    0,
  );
  const u = usageValues("openai", "gpt-4o-mini", {
    usage: {
      prompt_tokens: 100,
      completion_tokens: 0,
      prompt_tokens_details: { cached_tokens: 999 },
    },
  });
  assert.equal(u.cost_usd, 0.0000075);
});
