import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const {
  startLocalApi,
  adminBearer,
  weakAdminBearer,
  testBearer,
  userId,
} = require("./helpers/local-api.cjs");
const vault = require("../packages/api/dist/provider-vault.js");
let api: any;
const originalFetch = globalThis.fetch;
const secret = "sk_fixture_" + randomBytes(24).toString("hex");
let calls: any[] = [];
before(async () => {
  process.env.AI_KEY_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  api = await startLocalApi();
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (!url.startsWith("https://api.openai.com/"))
      return originalFetch(input, init);
    calls.push({ url, body: init?.body });
    if (url.endsWith("/models"))
      return Response.json({
        data: [
          { id: "gpt-4o-mini" },
          { id: "text-embedding-3-small" },
          { id: "gpt-realtime" },
        ],
      });
    return Response.json({
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      choices: [
        {
          message: {
            content:
              "Hi there, returns are accepted within 37 days. Customer Support Team",
          },
        },
      ],
    });
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.AI_KEY_ENCRYPTION_KEY;
  delete process.env.AI_DAILY_CALL_LIMIT;
  await api?.close();
});
async function call(path: string, body?: unknown, token = adminBearer) {
  const r = await originalFetch(api.url + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const reason = "Verify secure provider integration";
let revision: string;
test("vault uses randomized authenticated encryption, rejects tampering and provider swapping", () => {
  const a = vault.encryptKey("openai", secret),
    b = vault.encryptKey("openai", secret);
  assert.notEqual(a, b);
  assert.ok(!a.includes(secret));
  assert.equal(vault.decryptKey("openai", a), secret);
  assert.throws(() => vault.decryptKey("openrouter", a));
  assert.throws(() => vault.decryptKey("openai", a.slice(0, -8) + "AAAAAAAA"));
  const master = process.env.AI_KEY_ENCRYPTION_KEY;
  delete process.env.AI_KEY_ENCRYPTION_KEY;
  assert.throws(() => vault.encryptKey("openai", secret));
  process.env.AI_KEY_ENCRYPTION_KEY = master;
});
test("customer and non-MFA admin cannot access or write provider credentials", async () => {
  for (const token of [testBearer, weakAdminBearer]) {
    assert.equal(
      (await call("/admin/providers", undefined, token)).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/admin/providers/openai/connect",
          { key: secret, reason },
          token,
        )
      ).status,
      403,
    );
  }
  assert.equal(calls.length, 0);
});
test("connection persists only ciphertext, response and audit never disclose secret", async () => {
  const r = await call("/admin/providers/openai/connect", {
    key: secret,
    reason,
  });
  assert.equal(r.status, 200);
  revision = r.data.revision;
  assert.deepEqual(r.data.models, [{ id: "gpt-4o-mini", name: "gpt-4o-mini" }]);
  const status = await call("/admin/providers");
  assert.equal(status.status, 200);
  assert.ok(!JSON.stringify(status).includes(secret));
  assert.ok(!JSON.stringify(status).includes("ciphertext"));
  const row = (await api.db.query("select * from ai_credentials")).rows[0];
  assert.equal(vault.decryptKey("openai", row.ciphertext), secret);
  const events = (await api.db.query("select details from audit_events")).rows;
  assert.ok(!JSON.stringify(events).includes(secret));
  assert.ok(!JSON.stringify(events).includes(row.ciphertext));
});
test("model must be catalogued and live-tested before global activation", async () => {
  const selection = { model: "gpt-4o-mini", revision };
  assert.equal(
    (await call("/admin/providers/openai/activate", { ...selection, reason }))
      .status,
    400,
  );
  assert.equal(
    (
      await call("/admin/providers/openai/test", {
        ...selection,
        model: "made-up-model",
      })
    ).status,
    400,
  );
  const probe = await call("/admin/providers/openai/test", selection);
  assert.equal(probe.status, 200);
  assert.equal(probe.data.liveProvider, true);
  assert.match(probe.data.draft, /37 days/);
  assert.equal(
    (await call("/admin/providers/openai/activate", { ...selection, reason }))
      .status,
    200,
  );
  const active = await vault.activeCredential();
  assert.equal(active.model, selection.model);
  assert.equal(active.key, secret);
  const outgoing = JSON.parse(
    calls.find((c) => c.url.endsWith("/chat/completions")).body,
  );
  assert.equal(outgoing.max_completion_tokens, 256);
});
test("web credentials cannot generate; extension uses the global model and knowledge", async () => {
  const body = {
    threadContent: "What is the return window?",
    requestId: crypto.randomUUID(),
  };
  assert.equal((await call("/drafts/generate", body, testBearer)).status, 403);
  const token = "dp_" + randomBytes(32).toString("hex");
  await api.db.query(
    "insert into extension_tokens(user_id,team_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",
    [userId, api.team, createHash("sha256").update(token).digest("hex")],
  );
  await api.db.query("select add_knowledge($1,'Returns',$2::jsonb)", [
    api.team,
    JSON.stringify(["Returns are accepted within 37 days."]),
  ]);
  const r = await call("/drafts/generate", body, token);
  assert.equal(r.status, 200);
  assert.match(r.data.draft, /37 days/);
  const outgoing = JSON.parse(
    calls.filter((c) => c.url.endsWith("/chat/completions")).at(-1).body,
  );
  assert.equal(outgoing.model, "gpt-4o-mini");
  assert.match(JSON.stringify(outgoing.messages), /37 days/);
  assert.match(JSON.stringify(outgoing.messages), /empathetic/);
  const before = (await call("/admin/overview")).data.command;
  assert.ok(before.totalTokens >= 240);
  assert.ok(before.estimatedCostUsd > 0);
  assert.equal(before.draftsCompleted, 1);
  const repeated = await call("/drafts/generate", body, token);
  assert.equal(repeated.status, 200);
  const after = (await call("/admin/overview")).data.command;
  assert.equal(after.aiCalls, before.aiCalls);
  assert.equal(after.draftsCompleted, before.draftsCompleted);
  await api.db.query("delete from draft_history where id=$1", [r.data.id]);
  assert.equal((await call("/admin/overview")).data.command.draftsCompleted, 1);
});
test("daily provider limit is atomic and fails closed before a paid call", async () => {
  await api.db.exec("delete from ai_call_usage");
  process.env.AI_DAILY_CALL_LIMIT = "2";
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => vault.reserveProviderCall()),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  const n = calls.length;
  const r = await call("/admin/pipeline/test", {});
  assert.equal(r.status, 429);
  assert.equal(calls.length, n);
  delete process.env.AI_DAILY_CALL_LIMIT;
});
test("rotation invalidates activation and previously tested revision", async () => {
  const r = await call("/admin/providers/openai/connect", {
    key: secret + "new",
    reason,
  });
  assert.equal(r.status, 200);
  assert.equal(
    (
      await call("/admin/providers/openai/activate", {
        model: "gpt-4o-mini",
        revision,
        reason,
      })
    ).status,
    400,
  );
  await assert.rejects(() => vault.activeCredential());
  assert.equal(
    (await api.db.query("select generation_paused from platform_settings"))
      .rows[0].generation_paused,
    true,
  );
});
test("anonymous and authenticated database roles cannot read keys or reserve paid calls", async () => {
  for (const role of ["anon", "authenticated"]) {
    await api.db.exec("set role " + role);
    try {
      await assert.rejects(() => api.db.query("select * from ai_credentials"));
      await assert.rejects(() => api.db.query("select reserve_ai_call(10)"));
    } finally {
      await api.db.exec("reset role");
    }
  }
});

test("OpenRouter validates inference keys and restricts the catalog to text output", async () => {
  const urls: string[] = [];
  const fetcher = (async (url: any) => {
    urls.push(String(url));
    return Response.json(
      String(url).endsWith("/key")
        ? { data: { is_management_key: false } }
        : {
            data: [
              {
                id: "vendor/chat",
                name: "Chat",
                architecture: { output_modalities: ["text"] },
              },
              {
                id: "vendor/image",
                architecture: { output_modalities: ["image"] },
              },
            ],
          },
    );
  }) as typeof fetch;
  assert.deepEqual(await vault.discoverModels("openrouter", secret, fetcher), [
    { id: "vendor/chat", name: "Chat" },
  ]);
  assert.deepEqual(urls, [
    "https://openrouter.ai/api/v1/key",
    "https://openrouter.ai/api/v1/models",
  ]);
  await assert.rejects(() =>
    vault.discoverModels("openrouter", secret, async () =>
      Response.json({ data: { is_management_key: true } }),
    ),
  );
});
test("provider errors and oversized bodies are bounded and do not echo tokens", async () => {
  const error = await vault
    .discoverModels(
      "openai",
      secret,
      async () => new Response(secret, { status: 401 }),
    )
    .catch((e: Error) => e);
  assert.ok(!error.message.includes(secret));
  await assert.rejects(() =>
    vault.boundedJSON(new Response(" ".repeat(2000001))),
  );
});
