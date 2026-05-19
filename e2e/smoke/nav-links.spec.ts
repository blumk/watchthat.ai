import { test, expect } from "@playwright/test";

test("@smoke nav exposes How it works, Pricing, Developers", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByRole("navigation");
  await expect(nav).toBeVisible();

  await expect(nav.getByRole("link", { name: "How it works" })).toHaveAttribute(
    "href",
    "#how",
  );
  await expect(nav.getByRole("link", { name: "Pricing" })).toHaveAttribute(
    "href",
    "#pricing",
  );
  await expect(nav.getByRole("link", { name: "Developers" })).toHaveAttribute(
    "href",
    "/developers",
  );

  // Brand button exists and is clickable.
  await expect(nav.getByRole("button", { name: "WatchThat" })).toBeVisible();
});
