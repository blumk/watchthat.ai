import { test, expect } from "@playwright/test";

test("@smoke /developers renders h1, audience cards, mailto CTA", async ({ page }) => {
  const response = await page.goto("/developers");
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { name: /agentic platform/i }),
  ).toBeVisible();

  // Three audience-card tags. These are written into the page from a static
  // array — if any go missing the developers page has regressed.
  await expect(page.getByText("For developers", { exact: true })).toBeVisible();
  await expect(page.getByText("For agent builders", { exact: true })).toBeVisible();
  await expect(page.getByText("For investors", { exact: true })).toBeVisible();

  // Primary CTA is a mailto. Just assert the href shape.
  const platformAccess = page.getByRole("link", { name: /Get platform access/i });
  await expect(platformAccess).toBeVisible();
  await expect(platformAccess).toHaveAttribute(
    "href",
    /^mailto:hello@watchthat\.app/,
  );
});
