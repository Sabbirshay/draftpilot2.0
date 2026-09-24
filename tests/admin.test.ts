import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  startLocalApi,
  testBearer,
  adminBearer,
  weakAdminBearer,
  adminId,
  userId,
} = require("./helpers/local-api.cjs");
let api: any;
let extensionBearer: string;
before(async () => {
  api = await startLocalApi();
  extensionBearer = "dp_" + "e".repeat(48);
  const { createHash } = await import("node:crypto");
  await api.db.query(
    "insert into extension_tokens(user_id,team_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",
    [
      userId,
      api.team,
      createHash("sha256").update(extensionBearer).digest("hex"),
    ],
  );
});
after(async () => {
  await api?.close();
});
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  token = adminBearer,
) {
  const r = await fetch(api.url + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const why = "Support-approved account change";
test("admin rejects ordinary users, missing MFA, and forged metadata", async () => {
  assert.equal(
    (await call("/admin/overview", "GET", undefined, testBearer)).status,
    403,
  );
  assert.equal(
    (await call("/admin/overview", "GET", undefined, weakAdminBearer)).status,
    403,
  );
  assert.equal((await call("/admin/overview")).status, 200);
  assert.equal(
    (
      await call("/admin/users/" + userId, "PATCH", {
        reason: why,
        platformAdmin: true,
      })
    ).status,
    400,
  );
});
test("individual quota is atomic, idempotent and refunds failed attempts once", async () => {
  assert.equal(
    (
      await call("/admin/users/" + userId, "PATCH", {
        reason: why,
        monthly_limit: 1,
      })
    ).status,
    200,
  );
  const request = crypto.randomUUID();
  const first = await api.db.query("select reserve_draft($1,$2,$3,$4) r", [
    api.team,
    userId,
    request,
    "gmail",
  ]);
  assert.equal(
    (
      await api.db.query("select reserve_draft($1,$2,$3,$4) r", [
        api.team,
        userId,
        request,
        "gmail",
      ])
    ).rows[0].r.existing,
    true,
  );
  await assert.rejects(
    api.db.query("select reserve_draft($1,$2,$3,$4)", [
      api.team,
      userId,
      crypto.randomUUID(),
      "gmail",
    ]),
    /USER_QUOTA_EXCEEDED/,
  );
  const id = first.rows[0].r.record.id;
  await api.db.query("select fail_draft($1,$2)", [api.team, id]);
  await api.db.query("select fail_draft($1,$2)", [api.team, id]);
  assert.equal(
    (
      await api.db.query(
        "select draft_count from user_usage where user_id=$1",
        [userId],
      )
    ).rows[0].draft_count,
    0,
  );
  assert.equal(
    (
      await api.db.query("select draft_count from usage where team_id=$1", [
        api.team,
      ])
    ).rows[0].draft_count,
    0,
  );
  await call("/admin/users/" + userId, "PATCH", {
    reason: why,
    monthly_limit: null,
  });
});
test("draft-only restriction leaves workspace readable and blocks generation", async () => {
  await call("/admin/users/" + userId, "PATCH", {
    reason: why,
    generation_blocked: true,
  });
  assert.equal(
    (await call("/workspace", "GET", undefined, testBearer)).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/drafts/generate",
        "POST",
        {
          threadContent: "Can I return my order?",
          requestId: crypto.randomUUID(),
        },
        testBearer,
      )
    ).status,
    403,
  );
  await call("/admin/users/" + userId, "PATCH", {
    reason: why,
    generation_blocked: false,
  });
});
test("suspension immediately rejects existing web sessions, revokes extensions and denies RLS reads", async () => {
  await api.db.query(
    "insert into extension_tokens(team_id,user_id,token_hash,expires_at) values($1,$2,'fixture',now()+interval '1 day')",
    [api.team, userId],
  );
  await call("/admin/users/" + userId, "PATCH", {
    reason: why,
    suspended: true,
  });
  assert.equal(
    (await call("/workspace", "GET", undefined, testBearer)).status,
    403,
  );
  assert.ok(
    (
      await api.db.query(
        "select revoked_at from extension_tokens where token_hash='fixture'",
      )
    ).rows[0].revoked_at,
  );
  await api.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    userId,
  ]);
  await api.db.exec("set role authenticated");
  try {
    assert.equal((await api.db.query("select * from teams")).rows.length, 0);
    await assert.rejects(
      api.db.query("select * from user_controls"),
      /permission denied/,
    );
    await assert.rejects(
      api.db.query("select admin_overview('',0)"),
      /permission denied/,
    );
  } finally {
    await api.db.exec("reset role");
  }
  await call("/admin/users/" + userId, "PATCH", {
    reason: why,
    suspended: false,
  });
  assert.equal(
    (await call("/workspace", "GET", undefined, testBearer)).status,
    200,
  );
});
test("manual grants survive payment updates; removal restores current billing entitlements", async () => {
  await api.db.query(
    "update teams set stripe_customer_id='cus_fixture' where id=$1",
    [api.team],
  );
  assert.equal(
    (
      await call("/admin/workspaces/" + api.team, "PATCH", {
        reason: why,
        manual_override: { plan: "team", seats: 10, limit: 12000 },
      })
    ).status,
    200,
  );
  await api.db.query(
    "select apply_subscription('evt_paid',100,'cus_fixture','sub_fixture',true,3)",
  );
  let t = (await api.db.query("select * from teams where id=$1", [api.team]))
    .rows[0];
  assert.equal(t.monthly_draft_limit, 12000);
  assert.equal(t.billing_limit, 3000);
  await api.db.query(
    "select apply_subscription('evt_cancel',101,'cus_fixture','sub_fixture',false,1)",
  );
  t = (await api.db.query("select * from teams where id=$1", [api.team]))
    .rows[0];
  assert.equal(t.plan, "team");
  assert.equal(t.billing_plan, "free");
  await call("/admin/workspaces/" + api.team, "PATCH", {
    reason: why,
    manual_override: null,
  });
  t = (await api.db.query("select * from teams where id=$1", [api.team]))
    .rows[0];
  assert.equal(t.plan, "free");
  assert.equal(t.monthly_draft_limit, 50);
  await api.db.query(
    "select apply_subscription('evt_stale',99,'cus_fixture','sub_fixture',true,3)",
  );
  assert.equal(
    (await api.db.query("select plan from teams where id=$1", [api.team]))
      .rows[0].plan,
    "free",
  );
  assert.equal(
    (
      await api.db.query(
        "select apply_subscription('evt_cancel',101,'cus_fixture','sub_fixture',false,1) result",
      )
    ).rows[0].result,
    false,
  );
});
test("pipeline controls pause before quota consumption and fail closed without allowed providers", async () => {
  await api.db.query(
    "update extension_tokens set revoked_at=null where user_id=$1",
    [userId],
  );
  const p = (await call("/admin/pipeline")).data;
  assert.equal(JSON.stringify(p).includes("API_KEY"), false);
  const settings = {
    generation_paused: true,
    max_output_tokens: 400,
    ai_config: p.ai_config,
    reason: why,
  };
  assert.equal((await call("/admin/pipeline", "PATCH", settings)).status, 200);
  const before = (
    await api.db.query("select draft_count from usage where team_id=$1", [
      api.team,
    ])
  ).rows[0].draft_count;
  assert.equal(
    (
      await call(
        "/drafts/generate",
        "POST",
        {
          threadContent: "Can I return my order?",
          requestId: crypto.randomUUID(),
        },
        extensionBearer,
      )
    ).status,
    503,
  );
  settings.generation_paused = false;
  settings.ai_config.fallback_enabled = false;
  settings.ai_config.openai_enabled = false;
  settings.ai_config.openrouter_enabled = false;
  await call("/admin/pipeline", "PATCH", settings);
  assert.equal(
    (
      await call(
        "/drafts/generate",
        "POST",
        {
          threadContent: "Can I return my order?",
          requestId: crypto.randomUUID(),
        },
        extensionBearer,
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await api.db.query("select draft_count from usage where team_id=$1", [
        api.team,
      ])
    ).rows[0].draft_count,
    before,
  );
  settings.ai_config.fallback_enabled = true;
  await call("/admin/pipeline", "PATCH", settings);
  const probe = await call("/admin/pipeline/test", "POST");
  assert.equal(probe.status, 200);
  assert.equal(probe.data.liveProvider, false);
  assert.match(probe.data.draft, /37 days/);
});
test("invalid changes never mutate or create audit success records; successful changes record before/after", async () => {
  const count = (await api.db.query("select count(*)::int n from audit_events"))
    .rows[0].n;
  assert.equal(
    (
      await call("/admin/users/" + userId, "PATCH", {
        reason: "x",
        monthly_limit: -1,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/admin/workspaces/" + api.team, "PATCH", {
        reason: why,
        manual_override: { plan: "team", seats: 0, limit: 10 },
      })
    ).status,
    400,
  );
  assert.equal(
    (await api.db.query("select count(*)::int n from audit_events")).rows[0].n,
    count,
  );
  const log = (
    await api.db.query(
      "select details from audit_events where action='platform.user.update' order by id limit 1",
    )
  ).rows[0].details;
  assert.equal(log.reason, why);
  assert.equal(log.after.monthly_limit, 1);
  assert.ok(log.before);
});
test("validated signed Stripe lifecycle grants paid seats and cancellation restores free limits", async () => {
  const {
    BillingController,
  } = require("../packages/api/dist/billing.controller.js");
  const Stripe = require("../packages/api/node_modules/stripe");
  const client = new Stripe("sk_test_fixture_only");
  const controller = new BillingController();
  const secret = "whsec_fixture_not_a_real_secret";
  const oldSecret = process.env.STRIPE_WEBHOOK_SECRET,
    oldPrice = process.env.STRIPE_TEAM_PRICE_ID;
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.STRIPE_TEAM_PRICE_ID = "price_team_fixture";
  const subscription = {
    id: "sub_lifecycle",
    customer: "cus_fixture",
    status: "active",
    items: { data: [{ price: { id: "price_team_fixture" }, quantity: 4 }] },
  };
  controller.client = () => ({
    webhooks: client.webhooks,
    subscriptions: { retrieve: async () => subscription },
  });
  async function deliver(id: string, created: number, type: string) {
    const payload = JSON.stringify({
      id,
      created,
      type,
      data: { object: subscription },
    });
    const sig = client.webhooks.generateTestHeaderString({ payload, secret });
    return controller.webhook({ rawBody: Buffer.from(payload) }, sig);
  }
  try {
    await assert.rejects(
      controller.webhook({ rawBody: Buffer.from("{}") }, "forged"),
      /Invalid webhook signature/,
    );
    await deliver("evt_lifecycle_paid", 200, "customer.subscription.updated");
    let t = (await api.db.query("select * from teams where id=$1", [api.team]))
      .rows[0];
    assert.equal(t.plan, "team");
    assert.equal(t.seat_limit, 4);
    assert.equal(t.monthly_draft_limit, 4000);
    subscription.status = "canceled";
    await deliver(
      "evt_lifecycle_deleted",
      201,
      "customer.subscription.deleted",
    );
    t = (await api.db.query("select * from teams where id=$1", [api.team]))
      .rows[0];
    assert.equal(t.plan, "free");
    assert.equal(t.seat_limit, 1);
  } finally {
    if (oldSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = oldSecret;
    if (oldPrice === undefined) delete process.env.STRIPE_TEAM_PRICE_ID;
    else process.env.STRIPE_TEAM_PRICE_ID = oldPrice;
  }
});
test("admin audit write failure rolls back the associated mutation", async () => {
  await api.db.exec(
    "alter table audit_events add constraint audit_failure_fixture check(action<>'platform.user.update') not valid",
  );
  try {
    assert.equal(
      (
        await call("/admin/users/" + userId, "PATCH", {
          reason: why,
          monthly_limit: 123,
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await api.db.query(
          "select monthly_limit from user_controls where user_id=$1",
          [userId],
        )
      ).rows[0].monthly_limit,
      null,
    );
  } finally {
    await api.db.exec(
      "alter table audit_events drop constraint audit_failure_fixture",
    );
  }
});
test("parallel distinct reservations cannot exceed an individual cap", async () => {
  const used = (
    await api.db.query("select draft_count from user_usage where user_id=$1", [
      userId,
    ])
  ).rows[0].draft_count;
  await call("/admin/users/" + userId, "PATCH", {
    reason: why,
    monthly_limit: used + 1,
  });
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      api.db.query("select reserve_draft($1,$2,$3,$4)", [
        api.team,
        userId,
        crypto.randomUUID(),
        "gmail",
      ]),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    (
      await api.db.query(
        "select draft_count from user_usage where user_id=$1",
        [userId],
      )
    ).rows[0].draft_count,
    used + 1,
  );
});
test("workspace removal cannot erase suspension; former accounts remain administrable", async () => {
  await call("/admin/users/" + userId, "PATCH", {
    reason: why,
    suspended: true,
  });
  await api.db.query("delete from users where id=$1", [userId]);
  assert.equal(
    (await call("/workspace", "GET", undefined, testBearer)).status,
    403,
  );
  const overview = (await call("/admin/overview")).data;
  assert.equal(
    overview.users.find((u: any) => u.id === userId).suspended,
    true,
  );
  assert.equal(
    (
      await call("/admin/users/" + userId, "PATCH", {
        reason: why,
        suspended: false,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api.db.query(
        "select suspended from user_controls where user_id=$1",
        [userId],
      )
    ).rows[0].suspended,
    false,
  );
});
