# e2e

Playwright tests. Two suites:

- `smoke/` — runs against prod after deploy. Read-only-ish; the one mutating spec scrapes an app-owned `/api/test-fixture/prod-canary` URL.
- `full/` — runs against the Vercel preview before merge. Mutates real (staging) Supabase. Firecrawl + Anthropic are stubbed via `E2E_MOCK=1`.

## Local

```
pnpm e2e:install   # one-time browser download
pnpm e2e           # runs everything against http://localhost:3000 with E2E_MOCK=1
pnpm e2e:smoke     # smoke specs only
pnpm e2e:full      # full specs only (needs staging Supabase env vars in .env.test)
```

`pnpm e2e` boots `next dev` itself via Playwright's `webServer` block. If you'd rather run it against an already-running server, drop `PLAYWRIGHT_LOCAL=1`.

## Pointing at a different deployment

```
E2E_BASE_URL=https://your-preview.vercel.app pnpm exec playwright test --grep @smoke
```

## Tags

Every spec is tagged with `@smoke` or `@full`. The CI workflows filter by tag.
