import { test, expect } from "@playwright/test";
test("desktop dashboard loads without browser errors and renders all navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1060 });
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A little less typing",
  );
  await expect(
    page.getByText("Sample data, real interactions.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Draft studio NEW" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/visual/dashboard-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("customers use extension setup and cannot generate through the web proxy", async ({
  page,
  request,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("button", { name: "Generate draft", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Set up extension", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Pair extension", exact: true }),
  ).toBeVisible();
  const r = await request.post("/api/backend/drafts/generate", {
    headers: { Origin: new URL(page.url()).origin },
    data: { threadContent: "Test customer question" },
  });
  expect(r.status()).toBe(403);
});
test("create, search, edit, use and delete a macro", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Macros", exact: true }).click();
  await page.getByRole("button", { name: "New macro" }).click();
  await page.getByLabel("Macro name").fill("Warranty coverage");
  await page
    .getByLabel("Response guidance")
    .fill(
      "Our warranty covers manufacturing defects for one year from purchase.",
    );
  await page.getByLabel("Tags").fill("warranty, product");
  await page.getByRole("button", { name: "Save macro" }).click();
  await page.getByLabel("Search macros").fill("Warranty");
  await expect(
    page.getByRole("heading", { name: "Warranty coverage" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Warranty coverage" }).click();
  await page.getByLabel("Macro name").fill("Warranty policy");
  await page.getByRole("button", { name: "Save macro" }).click();
  await page.getByRole("button", { name: "Use macro" }).click();
  await expect(
    page.getByRole("button", { name: "Pair extension", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Macros", exact: true }).click();
  await page.getByRole("button", { name: "Delete Warranty policy" }).click();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(
    page.getByRole("heading", { name: "Warranty policy" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete Warranty policy" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Warranty policy" }),
  ).toHaveCount(0);
});
test("knowledge ingestion is visible and deletable", async ({ page }) => {
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add knowledge", exact: true })
    .click();
  await page.getByLabel("Source name").fill("Support hours");
  await page
    .getByLabel("Source content")
    .fill(
      "Our customer support team is available Monday through Friday from 9 am to 5 pm UTC.",
    );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add knowledge" })
    .click();
  await expect(page.getByText("Support hours", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Support hours" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Support hours", { exact: true })).toHaveCount(0);
});
test("settings save, search keyboard shortcut and honest integration statuses", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Workspace name").fill("Support Collective");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    page.getByRole("button", { name: /Support Collective Demo workspace/ }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search pages and macros…").fill("integrations");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Integrations" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Outlook", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Universal capture", { exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Pair extension", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("connected account");
});
test("mobile extension setup remains within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Integrations", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/visual/studio-mobile.png",
    fullPage: true,
  });
});
test("cross-origin auth and API mutations are rejected before configuration lookup", async ({
  request,
}) => {
  for (const url of ["/api/auth/login", "/api/backend/macros"]) {
    const r = await request.post(url, {
      headers: { Origin: "https://attacker.example" },
      data: {},
    });
    expect(r.status()).toBe(403);
  }
  const r = await request.get("/api/backend/not-allowed");
  expect(r.status()).toBe(404);
});
test("security headers deny framing and avoid unsafe script execution in production", async ({
  request,
}) => {
  const r = await request.get("/");
  expect(r.headers()["x-frame-options"]).toBe("DENY");
  expect(r.headers()["x-content-type-options"]).toBe("nosniff");
  expect(r.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(r.headers()["content-security-policy"]).toContain("object-src 'none'");
  expect(r.headers()["content-security-policy"]).toContain("nonce-");
});
test("extension detects redacted context, inserts plain text, and protects existing compose text", async ({
  page,
}) => {
  await page.route("https://mail.google.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body></body></html>",
    }),
  );
  await page.goto("https://mail.google.com/mail/u/0/#inbox/test");
  await page.setContent(
    '<h2 class="hP">Order question</h2><div class="a3s aiL">Email alice@example.com about order tracking.</div><div role="textbox" g_editable="true" contenteditable="true" style="width:300px;height:100px"></div><button id="send">Send</button>',
  );
  await page.evaluate(() => {
    (window as any).chrome = {
      runtime: {
        id: "test-extension",
        onMessage: {
          addListener: (fn: any) => {
            (window as any).handler = fn;
          },
        },
      },
    };
    (window as any).sendCount = 0;
    document.getElementById("send")!.onclick = () => {
      (window as any).sendCount++;
    };
  });
  await page.addScriptTag({ path: "packages/extension/dist/content.js" });
  const read = await page.evaluate(
    () =>
      new Promise<any>((resolve) =>
        (window as any).handler(
          { type: "READ_CONTEXT" },
          { id: "test-extension" },
          resolve,
        ),
      ),
  );
  expect(read.text).not.toContain("alice@example.com");
  expect(read.text).toContain("[EMAIL]");
  const result = await page.evaluate(
    () =>
      new Promise<any>((resolve) =>
        (window as any).handler(
          {
            type: "INSERT_DRAFT",
            text: "<img src=x onerror=alert(1)>\nHello there.",
          },
          { id: "test-extension" },
          resolve,
        ),
      ),
  );
  expect(result.ok).toBe(true);
  expect(await page.locator("[role=textbox] img").count()).toBe(0);
  expect(await page.locator("[role=textbox]").innerText()).toContain(
    "<img src=x",
  );
  const blocked = await page.evaluate(
    () =>
      new Promise<any>((resolve) =>
        (window as any).handler(
          { type: "INSERT_DRAFT", text: "Replace existing text" },
          { id: "test-extension" },
          resolve,
        ),
      ),
  );
  expect(blocked.error).toContain("already contains text");
  expect(await page.evaluate(() => (window as any).sendCount)).toBe(0);
  await page
    .locator("h2")
    .evaluate((el) => (el.textContent = "Different conversation"));
  const changed = await page.evaluate(
    () =>
      new Promise<any>((resolve) =>
        (window as any).handler(
          { type: "INSERT_DRAFT", text: "Old draft" },
          { id: "test-extension" },
          resolve,
        ),
      ),
  );
  expect(changed.error).toContain("conversation changed");
});
test("team roles and removal work without removing the owner", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByLabel("Role for jamie@example.com").selectOption("admin");
  await expect(page.getByLabel("Role for jamie@example.com")).toHaveValue(
    "admin",
  );
  await expect(
    page.getByRole("button", { name: "Remove alex@example.com" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Remove jamie@example.com" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByText("jamie@example.com", { exact: true }),
  ).toHaveCount(0);
});
test("spreadsheet knowledge imports locally and oversized files are rejected", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add knowledge", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "Policy.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Topic,Guidance\nReturns,Unused items can be returned within 30 days\nShipping,Check your confirmation email for tracking",
    ),
  });
  await expect(page.getByLabel("Source content")).toHaveValue(/Unused items/);
  await expect(page.getByLabel("Source name")).toHaveValue("Policy");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add knowledge" })
    .click();
  await expect(page.getByText("Policy", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Add knowledge", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "too-large.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(512001, 65),
  });
  await expect(page.getByRole("status")).toContainText("smaller than 500 KB");
});
test("password recovery form validates inputs without pretending to send in demo", async ({
  page,
}) => {
  await page.goto("/reset");
  await expect(
    page.getByRole("heading", { name: "Let’s get you back in." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("test@example.com");
  await page.getByRole("button", { name: "Send recovery code" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Authentication is unavailable",
  );
});
test("XLSX policies import through the isolated spreadsheet worker", async ({
  page,
}) => {
  const { createRequire } = await import("node:module");
  const XLSX = createRequire(process.cwd() + "/package.json")(
    process.cwd() + "/packages/web/node_modules/xlsx",
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["Topic", "Guidance"],
      ["Warranty", "Manufacturing defects are covered for one year."],
    ]),
    "Policies",
  );
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add knowledge", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "Warranty.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await expect(page.getByLabel("Source content")).toHaveValue(
    /Manufacturing defects/,
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("This is not a zip file"),
  });
  await expect(page.getByRole("status")).toContainText(
    "not a supported XLSX archive",
  );
});

test("dedicated customer signup and login routes expose recovery and no playground", async ({
  page,
}) => {
  await page.goto("/signup");
  await expect(page.getByLabel("Workspace name")).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveAttribute(
    "minlength",
    "12",
  );
  await page.goto("/login");
  await expect(page.getByLabel("Workspace name")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Forgot/ })).toHaveAttribute(
    "href",
    "/reset",
  );
});

test("password recovery requires matching passwords before submitting the verified code", async ({
  page,
}) => {
  const bodies: any[] = [];
  await page.route("**/api/auth/reset-request", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );
  await page.route("**/api/auth/recover", (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.goto("/reset");
  await page.getByLabel("Email address").fill("test@example.com");
  await page.getByRole("button", { name: "Send recovery code" }).click();
  await page.getByLabel("Recovery code").fill("123456");
  await page
    .getByLabel("New password", { exact: true })
    .fill("New-password-123");
  await page.getByLabel("Confirm new password").fill("Different-password-123");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Passwords do not match",
  );
  expect(bodies).toHaveLength(0);
  await page.getByLabel("Confirm new password").fill("New-password-123");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re ready to return." }),
  ).toBeVisible();
  expect(bodies[0]).toEqual({
    email: "test@example.com",
    code: "123456",
    password: "New-password-123",
  });
  await expect(
    page.getByRole("link", { name: "Back to sign in" }),
  ).toHaveAttribute("href", "/login");
});
