# Watchthis

**Know when websites change.**

Watchthis is a website change monitoring tool. Paste a URL, Watchthis takes a snapshot of the page content, and barks when something changes.

## Stack

- **Next.js 15** — App Router, React Server Components
- **TypeScript** — strict mode
- **Tailwind CSS** — utility-first styling + CSS variable theming
- **Jest + React Testing Library** — TDD enforced via `prebuild` hook
- **pnpm** — package manager
- **Supabase** — Postgres + Auth + Storage (local via `supabase` CLI, prod on Supabase Cloud)
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
watchthis/
├── app/
│   ├── api/              # Route handlers (scrape, analyze, describe-change, …)
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

See `watchthis-prd-trd.md` for the full product and technical spec. Short version:

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

Set these env vars in **Project Settings → Environment Variables** (Production): `FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` — using your **cloud** Supabase values, not the local ones.

### Supabase (cloud)

First-time setup for your cloud project:

```bash
supabase login
supabase link --project-ref <your-project-ref>   # from the Supabase dashboard URL
supabase db push                                  # applies all migrations to cloud
```

Re-run `supabase db push` after creating a new migration. Cloud URL + keys live in **Supabase Dashboard → Project Settings → API**.

## License

MIT
