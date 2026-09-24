import { test, expect } from "@playwright/test";
test("admin preview manages user restrictions and quotas with audit reasons", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Your users, in focus." }),
  ).toBeVisible();
  await expect(page.getByText("Interactive preview.")).toBeVisible();
  await page
    .getByRole("button", { name: "Manage jamie@example.com", exact: true })
    .click();
  await page.getByLabel("Monthly user quota").fill("250");
  await page.getByLabel("Block draft generation only").check();
  await expect(
    page.getByRole("button", { name: "Save user controls" }),
  ).toBeDisabled();
  await page
    .getByLabel("Reason for change")
    .fill("Limit requested by the support manager");
  await page.getByRole("button", { name: "Save user controls" }).click();
  const row = page.getByRole("row").filter({ hasText: "jamie@example.com" });
  await expect(row).toContainText("210 / 250");
  await expect(row).toContainText("Drafting blocked");
  await page.getByRole("button", { name: "Activity log", exact: true }).click();
  await expect(
    page.getByText("Limit requested by the support manager", { exact: true }),
  ).toBeVisible();
});
test("admin preview manually upgrades a workspace and restores billing entitlements", async ({
  page,
}) => {
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "Manage taylor@example.com", exact: true })
    .click();
  await page.getByLabel("Use a manual plan override").check();
  await page
    .getByRole("combobox", { name: "Plan", exact: true })
    .selectOption("team");
  await page.getByLabel("Seats", { exact: true }).fill("5");
  await page.getByLabel("Workspace monthly quota").fill("5000");
  await page
    .getByLabel("Reason for change")
    .fill("Approved complimentary Team pilot");
  await page.getByRole("button", { name: "Save workspace plan" }).click();
  await page
    .getByRole("button", { name: "Workspaces & plans", exact: true })
    .click();
  const row = page.getByRole("row").filter({ hasText: "Northstar Goods" });
  await expect(row).toContainText("Manual override");
  await expect(row).toContainText("5,000");
  await page
    .getByRole("button", { name: "Manage Northstar Goods", exact: true })
    .click();
  await page.getByLabel("Use a manual plan override").uncheck();
  await page
    .getByLabel("Reason for change")
    .fill("Pilot complete; resume normal billing");
  await page.getByRole("button", { name: "Save workspace plan" }).click();
  await expect(row).toContainText("Free plan");
  await expect(row).toContainText("38 / 50");
});
test("admin pipeline preview saves controls, exposes no fake live connection and fits mobile", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "AI pipeline", exact: true }).click();
  await expect(page.getByText("Not connected", { exact: true })).toHaveCount(3);
  await page.getByLabel("Pause all new draft generation").check();
  await page.getByLabel("Maximum output tokens").fill("450");
  await page
    .getByLabel("Reason for change")
    .fill("Scheduled pipeline maintenance window");
  await page.getByRole("button", { name: "Save pipeline settings" }).click();
  await expect(page.getByRole("status")).toContainText("Sample changes saved");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Generation policy" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/visual/draftpilot-admin-mobile.png",
    fullPage: true,
  });
});
test("admin directory search and dashboard render without console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin");
  await page.screenshot({
    path: "test-results/visual/draftpilot-admin-desktop.png",
    fullPage: true,
  });
  await page.getByRole("textbox", { name: "Search directory" }).fill("taylor");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: /Manage .*@/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});
