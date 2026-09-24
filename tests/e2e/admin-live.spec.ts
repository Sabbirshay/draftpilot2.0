import { test, expect } from "@playwright/test";
const {
  startLocalApi,
  adminBearer,
  testBearer,
  userId,
} = require("../helpers/local-api.cjs");
let api: any;
const origin = process.env.ADMIN_TEST_URL;
test.beforeAll(async () => {
  if (origin) api = await startLocalApi();
});
test.afterAll(async () => {
  await api?.close();
});
test("admin UI persists a restriction through the real controller and database", async ({
  page,
}) => {
  test.skip(
    !origin,
    "Set ADMIN_TEST_URL to a configured-mode local web server.",
  );
  await page.route("**/api/backend/admin/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const response = await fetch(
      api.url + url.pathname.replace("/api/backend", "") + url.search,
      {
        method: request.method(),
        headers: {
          Authorization: "Bearer " + adminBearer,
          "Content-Type": "application/json",
        },
        body: request.postData() || undefined,
      },
    );
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  await page.goto(origin + "/admin");
  await expect(
    page.getByRole("button", { name: "Manage agent@example.com" }),
  ).toBeVisible();
  await expect(page.getByText("Interactive preview.")).toHaveCount(0);
  await page.getByRole("button", { name: "Manage agent@example.com" }).click();
  await page.getByLabel("Monthly user quota").fill("7");
  await page.getByLabel("Block draft generation only").check();
  await page
    .getByLabel("Reason for change")
    .fill("Real local controller verification");
  await page.getByRole("button", { name: "Save user controls" }).click();
  await expect(page.getByRole("status")).toContainText("Changes saved");
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "agent@example.com" }),
  ).toContainText("Drafting blocked");
  const control = (
    await api.db.query("select * from user_controls where user_id=$1", [userId])
  ).rows[0];
  expect(control.monthly_limit).toBe(7);
  expect(control.generation_blocked).toBe(true);
  const response = await fetch(api.url + "/drafts/generate", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + testBearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      threadContent: "Can I return this order?",
      requestId: crypto.randomUUID(),
    }),
  });
  expect(response.status).toBe(403);
  await page.getByRole("button", { name: "Activity log", exact: true }).click();
  await expect(
    page.getByText("Real local controller verification", { exact: true }),
  ).toBeVisible();
});
test("ordinary account cannot load protected admin data in the UI", async ({
  page,
}) => {
  test.skip(
    !origin,
    "Set ADMIN_TEST_URL to a configured-mode local web server.",
  );
  await page.route("**/api/backend/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const r = await fetch(
      api.url + url.pathname.replace("/api/backend", "") + url.search,
      { headers: { Authorization: "Bearer " + testBearer } },
    );
    await route.fulfill({
      status: r.status,
      contentType: "application/json",
      body: await r.text(),
    });
  });
  await page.goto(origin + "/admin");
  await expect(
    page.getByRole("heading", { name: "Verify administrator access" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage agent@example.com" }),
  ).toHaveCount(0);
  await expect(page.locator("p[role=alert]")).toContainText(
    "administrator account with MFA",
  );
});

test("admin connects a key, tests and activates a model, and uses the private playground", async ({
  page,
}) => {
  test.skip(!origin, "Set ADMIN_TEST_URL to the configured local web server.");
  const originalFetch = globalThis.fetch;
  process.env.AI_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const outgoing: any[] = [];
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (!url.startsWith("https://api.openai.com/"))
      return originalFetch(input, init);
    if (url.endsWith("/models"))
      return Response.json({ data: [{ id: "gpt-4o-mini" }] });
    const body = JSON.parse(init.body);
    outgoing.push(body);
    return Response.json({
      choices: [
        {
          message: {
            content:
              "Hello, returns are accepted within 37 days. Customer Support Team",
          },
        },
      ],
    });
  }) as typeof fetch;
  try {
    await page.route("**/api/backend/admin/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      const r = await originalFetch(
        api.url + url.pathname.replace("/api/backend", "") + url.search,
        {
          method: req.method(),
          headers: {
            Authorization: "Bearer " + adminBearer,
            "Content-Type": "application/json",
          },
          body: req.postData() || undefined,
        },
      );
      await route.fulfill({
        status: r.status,
        contentType: "application/json",
        body: await r.text(),
      });
    });
    await page.goto(origin + "/admin");
    await page
      .getByRole("button", { name: "AI pipeline", exact: true })
      .click();
    const connection = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Provider connection & global model",
      }),
    });
    await connection
      .getByLabel("API token")
      .fill("sk_browser_fixture_not_a_real_secret");
    await connection
      .getByLabel("Change reason", { exact: true })
      .fill("Verify operator connection workflow");
    await connection
      .getByRole("button", { name: "Validate key & load models" })
      .click();
    await expect(connection.getByRole("status")).toContainText("Key validated");
    await expect(connection.getByLabel("API token")).toHaveValue("");
    await connection
      .getByLabel("Universal AI model")
      .selectOption("gpt-4o-mini");
    await expect(
      connection.getByRole("button", { name: "Activate for all users" }),
    ).toBeDisabled();
    await connection
      .getByRole("button", { name: "Run live model test" })
      .click();
    await expect(connection.getByRole("status")).toContainText(
      "Live provider test passed",
    );
    await connection
      .getByRole("button", { name: "Activate for all users" })
      .click();
    await expect(
      connection.getByText("Active model:", { exact: false }),
    ).toContainText("gpt-4o-mini");
    const playground = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Private AI playground" }),
    });
    await playground
      .getByLabel("Test customer question")
      .fill("Can I return my order after two weeks?");
    await playground.getByLabel("Test tone").selectOption("empathetic");
    await playground
      .getByRole("button", { name: "Test saved pipeline" })
      .click();
    await expect(playground.getByRole("status")).toContainText("Live provider");
    expect(JSON.stringify(outgoing.at(-1))).toContain("empathetic");
    expect(JSON.stringify(outgoing.at(-1))).toContain("after two weeks");
    const rows = (await api.db.query("select ciphertext from ai_credentials"))
      .rows;
    expect(rows[0].ciphertext).not.toContain("sk_browser_fixture");
    await page.screenshot({
      path: "test-results/visual/draftpilot-ai-pipeline.png",
      fullPage: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AI_KEY_ENCRYPTION_KEY;
  }
});

test("Users command overview refreshes database changes, preserves editing, and marks outages", async ({
  page,
}) => {
  test.skip(!origin, "Set ADMIN_TEST_URL to a configured local server.");
  let outage = false,
    revoked = false;
  await page.route("**/api/backend/admin/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.endsWith("/overview") && (outage || revoked)) {
      await route.fulfill({
        status: revoked ? 403 : 503,
        json: { message: "Service check unavailable" },
      });
      return;
    }
    const response = await fetch(
      api.url + url.pathname.replace("/api/backend", "") + url.search,
      {
        method: request.method(),
        headers: {
          Authorization: "Bearer " + adminBearer,
          "Content-Type": "application/json",
        },
        body: request.postData() || undefined,
      },
    );
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  await page.goto(origin + "/admin");
  const overview = page.getByRole("region", { name: "Command overview" });
  await expect(overview).toBeVisible();
  await expect(overview).toContainText("Live · refreshes every 5s");
  const initial = Number(
    await overview
      .locator(".admin-stat")
      .filter({ hasText: "Total users" })
      .locator("strong")
      .innerText(),
  );
  await page.getByRole("button", { name: "Manage agent@example.com" }).click();
  await page.getByLabel("Monthly user quota").fill("17");
  const user = crypto.randomUUID();
  await api.db.query("insert into auth.users(id) values($1)", [user]);
  await api.db.query(
    "select provision_workspace($1,'realtime@example.test','Live team')",
    [user],
  );
  await api.db.query(
    "insert into ai_usage_events(id,provider,model,kind,status,input_tokens,output_tokens,total_tokens,cost_usd,cost_basis) values(gen_random_uuid(),'openrouter','test/model','chat','completed',500,100,600,0.014,'reported')",
  );
  await expect(
    overview
      .locator(".admin-stat")
      .filter({ hasText: "Total users" })
      .locator("strong"),
  ).toHaveText(String(initial + 1), { timeout: 9000 });
  await expect(page.getByLabel("Monthly user quota")).toHaveValue("17");
  await expect(overview).toContainText("$0.014");
  outage = true;
  await expect(overview).toContainText("Updates interrupted", {
    timeout: 9000,
  });
  await expect(
    overview.locator(".admin-stat").filter({ hasText: "Service uptime" }),
  ).toContainText("Service check unavailable");
  outage = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(overview).toContainText("Live · refreshes every 5s");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Close controls", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/visual/admin-command-mobile.png",
    fullPage: true,
  });
  revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(overview).toHaveCount(0);
  await expect(
    page.getByText("Administrator access expired", { exact: false }),
  ).toBeVisible();
});
