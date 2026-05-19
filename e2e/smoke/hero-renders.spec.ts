import { test, expect } from "@playwright/test";

test("@smoke home loads with hero, URL input, Watch button", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/WatchThat|Watchthat|Watch That/i);

  // Headline is split across <br> tags — match a stable fragment.
  await expect(page.getByRole("heading", { name: /We monitor/i })).toBeVisible();

  // Rotating term is one of these (whichever the interval landed on).
  await expect(
    page.locator("h1").filter({ hasText: /so you don.t have to/i }),
  ).toBeVisible();

  await expect(
    page.getByRole("textbox", { name: "Website URL to watch" }),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: "Watch", exact: true })).toBeVisible();
});
