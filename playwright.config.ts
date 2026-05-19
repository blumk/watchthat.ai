import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL points at the deployment under test.
//   - prod smoke: https://watchthat.ai
//   - PR preview: https://<branch>-watchthat.vercel.app (resolved in CI)
//   - local:      http://localhost:3000 (via the webServer block below)
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// Vercel cold starts can blow the default 30s nav timeout. The warmup curl in
// CI helps, but the bumped timeouts here are the safety net.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Cap workers in CI to stay under staging Supabase's connection limits.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["html"], ["github"]] : "list",
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  expect: { timeout: 10_000 },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Only start a local dev server when PLAYWRIGHT_LOCAL=1. CI runs against a
  // deployed URL so we never want Playwright booting Next here.
  webServer:
    process.env.PLAYWRIGHT_LOCAL === "1"
      ? {
          command: "pnpm dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          env: { E2E_MOCK: "1" },
        }
      : undefined,
});
