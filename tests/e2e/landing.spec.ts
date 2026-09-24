import { test, expect } from "@playwright/test";

test("public homepage offers working signup, pricing, FAQ and workspace navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Less typing.More human.",
  );
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Pricing", exact: true })
    .click();
  await expect(page.locator("#pricing")).toBeInViewport();
  await expect(page.locator("#pricing")).toContainText("1,000 drafts per seat");
  const faq = page.getByText("Will DraftPilot send messages for me?", {
    exact: true,
  });
  await faq.click();
  await expect(
    page.getByText("No. DraftPilot prepares a reply", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Start free", exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(
    page.getByRole("button", { name: "Create workspace", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("link", { name: "Explore the sample workspace" })
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A little less typing",
  );
  expect(errors).toEqual([]);
});

test("desktop scroll story advances and reduced motion stays fully readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/lenis/);
  await page
    .locator(".lp-story-step")
    .nth(1)
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(page.locator(".lp-story-display")).toHaveAttribute(
    "data-step",
    "1",
  );
  await page
    .locator(".lp-story-step")
    .nth(2)
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(page.locator(".lp-story-display")).toHaveAttribute(
    "data-step",
    "2",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).not.toHaveClass(/lenis/);
  await expect(page.locator(".lp-story-display")).not.toHaveAttribute(
    "data-step",
  );
  await expect(page.locator(".lp-last-call")).toHaveCSS("opacity", "1");
  await page.goto("/");
  await page.screenshot({
    path: "test-results/visual/landing-desktop.png",
    fullPage: true,
  });
});

test("mobile menu, FAQ and page fit without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("Menu navigation").click();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Pricing", exact: true })
    .click();
  await expect(page.locator("#pricing")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".lp-mobile-nav")).not.toHaveAttribute("open");
  await page.goto("/");
  await page.screenshot({
    path: "test-results/visual/landing-mobile.png",
    fullPage: true,
  });
});

test("homepage remains usable without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page
    .getByText("Do I need to bring an AI API key?", { exact: true })
    .click();
  await expect(
    page.getByText("No. The platform administrator configures", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Start for free", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/signup$/);
  await context.close();
});

test("dark mode and narrow screens retain readable content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({
    path: "test-results/visual/landing-dark.png",
    fullPage: true,
  });
});
