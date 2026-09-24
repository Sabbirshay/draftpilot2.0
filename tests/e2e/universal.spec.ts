import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import {
  cp,
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// @ts-ignore JS harness deliberately replaces only hosted Auth/PostgREST transport.
import { startLocalApi, testBearer } from "../helpers/local-api.cjs";
let api: any,
  browser: BrowserContext,
  worker: Worker,
  extensionId: string,
  temp: string;
const policy =
  "Returns are eligible within 37 days when the item is unused. Request a return label in the account portal.";
const zendesk = "https://acme.zendesk.com/agent/tickets/37",
  generic = "https://support.example.test/case/11";
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  api = await startLocalApi();
  const uploaded = await fetch(api.url + "/knowledge", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + testBearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Returns policy", content: policy }),
  });
  expect(uploaded.status).toBe(200);
  temp = await mkdtemp(join(tmpdir(), "draftpilot-extension-test-"));
  const extension = join(temp, "extension");
  await cp(resolve("packages/extension/dist"), extension, { recursive: true });
  async function patch(dir: string) {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, file.name);
      if (file.isDirectory()) await patch(path);
      else if (file.name.endsWith(".js"))
        await writeFile(
          path,
          (await readFile(path, "utf8")).replaceAll(
            "http://localhost:3001",
            api.url,
          ),
        );
    }
  }
  await patch(extension);
  const manifest = JSON.parse(
    await readFile(join(extension, "manifest.json"), "utf8"),
  );
  // Fixture-only access simulates the host permission granted by a real toolbar action.
  // Release manifest retains activeTab and never includes these fixture origins.
  manifest.host_permissions.push(
    api.url + "/*",
    "https://acme.zendesk.com/*",
    "https://support.example.test/*",
    "https://app.crisp.chat/*",
    "https://outlook.office.com/*",
    "https://outlook.office365.com/*",
    "https://outlook.live.com/*",
    "https://inbox.mevrik.com/*",
  );
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest));
  browser = await chromium.launchPersistentContext(join(temp, "profile"), {
    headless: true,
    channel: "chromium",
    ignoreDefaultArgs: ["--disable-extensions"],
    env: {
      ...process.env,
      XDG_CONFIG_HOME: join(temp, "config"),
      XDG_CACHE_HOME: join(temp, "cache"),
    },
    executablePath:
      process.env.EXTENSION_CHROME_PATH ||
      process.env.CHROME_PATH ||
      chromium.executablePath(),
    args: [
      "--no-sandbox",
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
    viewport: { width: 1440, height: 1000 },
  });
  worker =
    browser.serviceWorkers()[0] ||
    (await browser.waitForEvent("serviceworker"));
  extensionId = worker.url().split("/")[2];
  const pair = await fetch(api.url + "/extension/pair", {
    method: "POST",
    headers: { Authorization: "Bearer " + testBearer },
  }).then((r) => r.json());
  const settings = await browser.newPage();
  await settings.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await settings
    .locator("details")
    .evaluate((el) => el.setAttribute("open", ""));
  await settings.getByLabel("Pairing code").fill(pair.code);
  await settings.getByRole("button", { name: "Connect securely" }).click();
  await expect(settings.locator("#mode")).toHaveText("Workspace connected");
  await settings.close();
});
test.afterAll(async () => {
  await browser?.close();
  await api?.close();
  if (temp) await rm(temp, { recursive: true, force: true });
});
async function pageFor(url: string, fixture: string) {
  const page = await browser.newPage();
  await page.route(url.split("#")[0], (route) =>
    route.fulfill({
      contentType: "text/html",
      path: resolve("tests/fixtures", fixture),
    }),
  );
  await page.goto(url);
  return page;
}
async function show(page: Page) {
  const url = page.url();
  await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url === url)!;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tab.id!, { type: "SHOW_PANEL" });
  }, url);
  await expect(
    page.getByRole("dialog", { name: "DraftPilot reply assistant" }),
  ).toBeVisible();
}
async function select(page: Page, selector: string) {
  await page.locator(selector).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(range);
  });
}
async function generate(page: Page) {
  await page
    .getByRole("button", { name: "Generate draft", exact: true })
    .click();
  await expect(page.getByLabel("Review your draft")).toHaveValue(/37 days/);
}
test("Zendesk: uploaded knowledge → actual API/quota → workspace tone → reviewed in-page insertion", async () => {
  const page = await pageFor(zendesk, "zendesk.html");
  await show(page);
  await expect(page.getByLabel("Customer message")).toHaveValue(/\[EMAIL\]/);
  await generate(page);
  await expect(page.getByLabel("Review your draft")).toHaveValue(
    /sorry this has been frustrating/,
  );
  await expect(page.locator("#sources")).toContainText("Returns policy");
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Ticket reply" }),
  ).toContainText("37 days");
  await expect(page.getByRole("status")).toContainText(
    "Inserted as plain text",
  );
  expect(await page.evaluate(() => (window as any).sent)).toBe(0);
  expect(await page.evaluate(() => (window as any).inputs)).toBeGreaterThan(0);
  const stored = await api.db.query(
    "select generated_draft,channel from draft_history where status='draft'",
  );
  expect(stored.rows[0].generated_draft).toContain(policy);
  expect(stored.rows[0].channel).toBe("zendesk");
  await page.screenshot({ path: "test-results/visual/universal-zendesk.png" });
  await page.close();
});
for (const host of [
  "outlook.office.com",
  "outlook.office365.com",
  "outlook.live.com",
]) {
  test(`${host}: reads open email without selection and inserts a grounded reply`, async () => {
    const page = await pageFor(
      `https://${host}/mail/inbox/id/37`,
      "outlook.html",
    );
    await show(page);
    await expect(page.getByLabel("Customer message")).toHaveValue(
      /return my unused order/,
    );
    await expect(page.getByLabel("Customer message")).toHaveValue(/\[EMAIL\]/);
    await expect(page.getByLabel("Customer message")).not.toHaveValue(
      /Unrelated|Hidden|unsent/,
    );
    await generate(page);
    await page
      .getByRole("button", { name: "Insert at chat box", exact: true })
      .click();
    await expect(page.locator("#reply")).toContainText("37 days");
    await expect(page.getByRole("status")).toContainText(
      "Inserted as plain text",
    );
    expect(await page.evaluate(() => (window as any).sent)).toBe(0);
    expect(await page.evaluate(() => (window as any).inputs)).toBeGreaterThan(
      0,
    );
    const stored = await api.db.query(
      "select channel from draft_history order by created_at desc limit 1",
    );
    expect(stored.rows[0].channel).toBe("outlook");
    await page.close();
  });
}
test("Outlook refuses stale conversation drafts and protects existing reply text", async () => {
  const page = await pageFor(
    "https://outlook.office.com/mail/inbox/id/38",
    "outlook.html",
  );
  await show(page);
  await generate(page);
  await page.locator("#reply").fill("My existing reply");
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("already contains text");
  await expect(page.locator("#reply")).toHaveText("My existing reply");
  await page.locator("#reply").fill("");
  await page
    .locator("#customer")
    .evaluate(
      (el) =>
        (el.textContent =
          "A different customer message in the same reading pane."),
    );
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("conversation changed");
  await expect(page.locator("#reply")).toBeEmpty();
  await page.close();
});
test("generic fallback: selected text → grounded draft → native textarea, without clipboard", async () => {
  const page = await pageFor(generic, "generic.html");
  await select(page, "#customer");
  await show(page);
  await expect(page.getByLabel("Customer message")).toHaveValue(/\[SECRET\]/);
  await generate(page);
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(page.locator("#reply")).toHaveValue(/37 days/);
  await expect(page.getByRole("status")).toContainText(
    "Inserted as plain text",
  );
  expect(await page.evaluate(() => (window as any).sent)).toBe(0);
  await page.screenshot({ path: "test-results/visual/universal-generic.png" });
  await page.close();
});
test("generic message picker and explicit reply target support multiple editors without overwriting", async () => {
  const page = await pageFor(generic, "generic.html");
  await page.locator("main").evaluate((el) => {
    const area = document.createElement("textarea");
    area.id = "second";
    area.value = "Existing human reply";
    el.append(area);
  });
  await show(page);
  await page.getByRole("button", { name: "Pick message", exact: true }).click();
  await page.locator("#customer").click();
  await generate(page);
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("will not guess");
  await page
    .getByRole("button", { name: "Choose reply box", exact: true })
    .click();
  await page.locator("#second").click();
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("already contains text");
  await expect(page.locator("#second")).toHaveValue("Existing human reply");
  await page
    .getByRole("button", { name: "Choose reply box", exact: true })
    .click();
  await page.locator("#reply").click();
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(page.locator("#reply")).toHaveValue(/37 days/);
  await page.close();
});
test("changed customer messages invalidate the prepared draft", async () => {
  const page = await pageFor(zendesk, "zendesk.html");
  await show(page);
  await generate(page);
  await page
    .locator('[data-test-id="comment-body"]')
    .evaluate((el) => (el.textContent = "Different customer's request"));
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("conversation changed");
  await expect(page.getByRole("textbox", { name: "Ticket reply" })).toBeEmpty();
  await page.close();
});
test("tone override is honored, synthetic page clicks cannot generate, and closing hides panel", async () => {
  const page = await pageFor(generic, "generic.html");
  await select(page, "#customer");
  await show(page);
  const count = api.requests.filter(
    (r: any) => r.path === "/drafts/generate",
  ).length;
  await page
    .getByRole("button", { name: "Generate draft", exact: true })
    .evaluate((el) => (el as HTMLElement).click());
  expect(
    api.requests.filter((r: any) => r.path === "/drafts/generate").length,
  ).toBe(count);
  await page.getByLabel("Reply tone").selectOption("professional");
  await generate(page);
  await expect(page.getByLabel("Review your draft")).toHaveValue(/^Hello,/);
  await page
    .getByRole("button", { name: "Close DraftPilot", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "DraftPilot reply assistant" }),
  ).toBeHidden();
  await page.close();
});
test("replaced reply boxes and changed URLs reject stale insertion", async () => {
  const page = await pageFor(generic, "generic.html");
  await select(page, "#customer");
  await show(page);
  await generate(page);
  await page
    .getByRole("button", { name: "Choose reply box", exact: true })
    .click();
  await page.locator("#reply").click();
  await page
    .locator("#reply")
    .evaluate((el) => el.replaceWith(el.cloneNode(true)));
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("reply box changed");
  await page.evaluate(() => history.pushState({}, "", "#another-customer"));
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("conversation changed");
  await expect(page.locator("#reply")).toHaveValue("");
  await page.close();
});

for (const [platform, url] of [
  ["crisp", "https://app.crisp.chat/website/test/inbox/chat-one"],
  ["mevrik", "https://inbox.mevrik.com:4220/inbox"],
]) {
  test(`${platform}: watches incoming messages, ignores agent messages and inserts only on click`, async () => {
    await api.db.query("delete from rate_limits");
    const page = await pageFor(url, "live-inbox.html");
    await show(page);
    await page
      .getByRole("button", { name: "Pick message", exact: true })
      .click();
    await page.locator('[data-message-id="initial"] p').click();
    await page
      .getByRole("button", { name: "Watch customer replies", exact: true })
      .click();
    await expect(page.getByLabel("Review your draft")).toHaveValue(/37 days/);
    await expect(page.locator("#reply")).toHaveValue("");
    const before = api.requests.filter(
      (r: any) => r.path === "/drafts/generate",
    ).length;
    await page
      .getByRole("button", { name: "Add agent reply", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add customer reply", exact: true })
      .click();
    await expect(page.getByLabel("Customer message")).toHaveValue(
      /return label/,
      { timeout: 12000 },
    );
    await expect(page.getByLabel("Review your draft")).toHaveValue(/37 days/, {
      timeout: 12000,
    });
    expect(
      api.requests.filter((r: any) => r.path === "/drafts/generate").length,
    ).toBe(before + 1);
    expect(
      api.requests.filter((r: any) => r.path === "/drafts/generate").at(-1).body
        .channel,
    ).toBe(platform);
    expect(
      api.requests.filter((r: any) => r.path === "/drafts/generate").at(-1).body
        .threadContent,
    ).not.toContain("Agent-only reply");
    await page
      .getByRole("button", { name: "Insert at chat box", exact: true })
      .click();
    await expect(page.locator("#reply")).toHaveValue(/37 days/);
    expect(await page.evaluate(() => (window as any).sent)).toBe(0);
    await page.screenshot({ path: `test-results/visual/watch-${platform}.png` });
    await page
      .getByRole("button", { name: "Switch conversation", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Conversation changed",
    );
    await expect(
      page.getByRole("button", { name: "Watch customer replies", exact: true }),
    ).toBeVisible();
    await page.close();
  });
}

test("watcher preserves manually edited drafts and refuses unknown sender layouts", async () => {
  await api.db.query("delete from rate_limits");
  const page = await pageFor(
    "https://app.crisp.chat/website/test/inbox/chat-two",
    "live-inbox.html",
  );
  await show(page);
  await page.getByRole("button", { name: "Pick message", exact: true }).click();
  await page.locator('[data-message-id="initial"] p').click();
  await page
    .getByRole("button", { name: "Watch customer replies", exact: true })
    .click();
  await expect(page.getByLabel("Review your draft")).toHaveValue(/37 days/);
  await page.getByLabel("Review your draft").fill("My carefully edited reply.");
  await page
    .getByRole("button", { name: "Add customer reply", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "edited draft is preserved",
  );
  await expect(page.getByLabel("Review your draft")).toHaveValue(
    "My carefully edited reply.",
  );
  await page
    .getByRole("button", { name: "Insert at chat box", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Generate a draft for the current context",
  );
  await page.close();
  const other = await pageFor(generic, "generic.html");
  await select(other, "#customer");
  await show(other);
  await other
    .getByRole("button", { name: "Watch customer replies", exact: true })
    .click();
  await expect(other.getByRole("status")).toContainText(
    "distinguishable incoming-message layout",
  );
  await other.close();
});

test("revoked sessions cannot quietly fall back to ungrounded local generation", async () => {
  await fetch(api.url + "/extension/sessions", {
    method: "DELETE",
    headers: { Authorization: "Bearer " + testBearer },
  });
  const page = await pageFor(generic, "generic.html");
  await select(page, "#customer");
  await show(page);
  await page
    .getByRole("button", { name: "Generate draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Extension session expired",
  );
  await expect(page.getByLabel("Review your draft")).toBeHidden();
  await page.close();
});
