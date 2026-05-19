# WatchThat

**Know when websites change.**

WatchThat is a website change monitoring tool. Paste a URL, WatchThat takes a snapshot of the page content, and barks when something changes.

## Stack

- **Next.js 15** — App Router, React Server Components
- **TypeScript** — strict mode
- **Tailwind CSS** — utility-first styling + CSS variable theming
- **Jest + React Testing Library** — TDD enforced via `prebuild` hook
- **pnpm** — package manager
- **Supabase** — Postgres + Auth + Storage (local via `supabase` CLI, prod on Supabase Cloud)
- **Sentry** — error monitoring, tracing, session replay, and AI span capture for Anthropic calls
- **Vercel** — zero-config deployment

## Getting Started

Prerequisites: Node 20+, `pnpm`, Docker Desktop, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
pnpm install
cp .env.example .env.local     # then fill in your API keys (see below)
supabase start                  # boots local Postgres + Auth + Storage (Docker)
pnpm dev                        # http://localhost:3000
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Var | Where to get it |
|---|---|
| `FIRECRAWL_API_KEY` | [firecrawl.dev](https://firecrawl.dev) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `NEXT_PUBLIC_SUPABASE_URL` | `supabase start` prints it (local: `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `supabase start` prints it (client-safe) |
| `SUPABASE_SECRET_KEY` | `supabase start` prints it (server-only, bypasses RLS — do NOT commit) |
| `CRON_SECRET` | Random string used to authenticate `/api/cron/scrape` calls from Supabase pg_cron. Must match the `cron_secret` entry in Supabase Vault. Generate with `openssl rand -hex 32`. |

`.env.local` is git-ignored. For production, set these in Vercel → Project Settings → Environment Variables using your cloud values instead.

### Local Supabase

Daily dev loop:

```bash
supabase start        # once per boot — migrations auto-apply
supabase db reset     # after editing a migration file
supabase stop         # when you're done
```

Studio (DB browser + SQL editor): http://127.0.0.1:54323

Migrations live in `supabase/migrations/`. Create a new one with `supabase migration new <name>`.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Run tests, then production build |
| `pnpm test` | Run tests in watch mode |
| `pnpm test:ci` | Run tests once (CI) |
| `pnpm start` | Start production server |

> `pnpm build` runs `jest --ci` first via `prebuild`. A failing test blocks the build.
>
> **Note for CI/CD:** Both `prebuild` and `test:ci` explicitly set `NODE_ENV=test`. This is required because Vercel (and most CI environments) set `NODE_ENV=production` before the build step, which causes React to load its production bundle — a bundle that doesn't support `act()` and will fail all RTL tests.

## Testing (TDD)

Tests live in `__tests__/` alongside each component. Every component has a corresponding test file. Write tests before (or alongside) new components.

```bash
pnpm test              # watch mode — runs on file change
pnpm test:ci           # single run, exits with code
```

When adding a new component:
1. Create `__tests__/MyComponent.test.tsx` first
2. Write failing tests for the expected behavior
3. Implement the component until tests pass
4. `pnpm build` will verify tests pass before shipping

## Project Structure

```
watchthat/
├── app/
│   ├── api/              # Route handlers (scrape, analyze, describe-change, …)
│   ├── developers/       # /developers — platform pitch (devs, agent builders, investors)
│   ├── layout.tsx        # Root layout, metadata
│   ├── page.tsx          # Home page
│   └── globals.css       # CSS variables + Tailwind base
├── components/           # UI components (see files for details)
├── lib/                  # App logic (storage, hashing, fixtures)
├── utils/supabase/       # Supabase client factories (browser, server, middleware, service-role)
├── middleware.ts         # Refreshes Supabase sessions on every request
├── supabase/
│   ├── config.toml       # Supabase CLI config
│   └── migrations/       # Versioned SQL migrations
├── __tests__/            # Component + route tests (Jest + RTL)
├── __mocks__/            # Jest module mocks
├── jest.config.js
├── jest.setup.ts
├── tailwind.config.ts
├── next.config.ts
└── tsconfig.json
```

## Theming

Dark/light mode is handled automatically via `prefers-color-scheme` and CSS custom properties defined in `globals.css`. No JavaScript required.

## Roadmap

See `watchthat-prd-trd.md` for the full product and technical spec. Short version:

- **V1.1** — Labels, URL validation, error retry, favicons
- **V1.2** — Browser push notifications, service worker polling
- **V2.0** — Backend API, database, automated polling, email/webhook alerts
- **V2.1** — CSS selector targeting, Playwright rendering, screenshot diffs
- **V2.2** — Tags/folders, bulk import, change history, share links
- **V3.0** — Multi-tenant, team workspaces, API access, integrations

## Deployment

### Vercel

Connect the GitHub repo in the Vercel dashboard or run:

```bash
npx vercel
```

Set these env vars in **Project Settings → Environment Variables** (Production): `FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` — using your **cloud** Supabase values, not the local ones. Also set:
- `SENTRY_AUTH_TOKEN` (from [sentry.io/settings/auth-tokens](https://sentry.io/settings/auth-tokens/), `project:releases` + `org:read` scopes) so production builds upload source maps.
- `CRON_SECRET` — must match the value of the `cron_secret` entry stored in Supabase Vault (see the auto-refresh setup below). Generate with `openssl rand -hex 32`.

### Supabase (cloud)

First-time setup for your cloud project:

```bash
supabase login
supabase link --project-ref <your-project-ref>   # from the Supabase dashboard URL
supabase db push                                  # applies all migrations to cloud
```

Re-run `supabase db push` after creating a new migration. Cloud URL + keys live in **Supabase Dashboard → Project Settings → API**.

### Auto-refresh (Supabase pg_cron)

Watched pages are re-scraped in the background on each user's chosen interval (default 24h, floor 1h). The scheduler is a Supabase pg_cron job that fires HTTP POSTs at `/api/cron/scrape`; that route delegates to `/api/scrape` so the existing hash / fact-extract / describe-change pipeline handles every refresh identically to a manual ↻ click.

**One-time setup after the first `supabase db push`:**

1. Generate a secret and store it in Supabase Vault (SQL editor):
   ```sql
   select vault.create_secret('<openssl rand -hex 32 output>', 'cron_secret');
   select vault.create_secret('https://<your-prod-host>',      'cron_base_url');
   ```
   > `vault.create_secret(value, name)` — values are encrypted at rest. To rotate later: `select vault.update_secret(id, new_value, name)` where `id` comes from `select id from vault.secrets where name = 'cron_secret'`.
2. Set `CRON_SECRET` in Vercel → Environment Variables to the **same** value as the `cron_secret` Vault entry.
3. **(If Vercel Deployment Protection is on)** Vercel → Project Settings → Deployment Protection → "Protection Bypass for Automation" → generate a token, then:
   ```sql
   select vault.create_secret('<bypass token>', 'vercel_bypass');
   ```
   The cron function sends this in `x-vercel-protection-bypass` so Vercel lets the request through to `/api/cron/scrape`. Skip if Deployment Protection is off — the function will send an empty header and Vercel will ignore it.

Until both Vault entries exist, the cron function logs a warning and no-ops on every tick — safe to apply the migration before populating Vault.

**How it works:**
- `watches.refresh_interval_seconds` — per-user choice (default 86400). DB CHECK constraint enforces a 1h floor.
- `pages.next_due_at` — when the cron should next scrape this page, maintained by triggers on `snapshots` (insert) and `watches` (insert/update/delete). NULL when the page has no active watchers.
- pg_cron job `refresh-due-pages` runs every 5 minutes. It picks up to 25 due pages (`next_due_at <= now()`), claims each by pushing `next_due_at` forward 10 min (built-in retry window), and fires `pg_net.http_post` to `${cron_base_url}/api/cron/scrape` with `X-Cron-Secret: ${cron_secret}` and `x-vercel-protection-bypass: ${vercel_bypass}` headers.
- The Vercel route validates the secret against `CRON_SECRET` (accepts either the `X-Cron-Secret` header or `Authorization: Bearer …`), looks up the page's URL, and calls `/api/scrape` internally. The snapshot-insert trigger then writes a fresh `next_due_at` based on `min(refresh_interval_seconds)` across watchers.

**Useful diagnostic queries (Supabase SQL editor):**

```sql
-- Recent cron runs (one row per 5-minute tick)
select jobname, start_time, end_time, status from cron.job_run_details
order by start_time desc limit 10;

-- Recent HTTP POSTs to /api/cron/scrape
select id, status_code, content, created from net._http_response
order by created desc limit 10;

-- Pages currently overdue
select id, url, next_due_at from pages
where next_due_at <= now() order by next_due_at limit 20;
```

## License

Source-available, all rights reserved. The code in this repository is published
for reference, review, and pull-request contribution only — it is **not** open
source and may not be used, copied, modified, redistributed, hosted as a
service, or trained on without prior written permission. See `LICENSE` for
the full notice.
