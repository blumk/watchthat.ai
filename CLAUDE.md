# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:3000
pnpm test         # Run tests in watch mode
pnpm test:ci      # Run tests once (CI mode, exits with code)
pnpm build        # Run tests then production build (tests block build on failure)
```

Run a single test file:
```bash
npx jest --testPathPattern="ComponentName"
```

Note: `pnpm test:ci -- --testPathPattern=X` doesn't work due to script arg forwarding; use `npx jest` directly for filtered runs.

## Architecture

Next.js 15 App Router with manual change monitoring. `page.tsx` is a client component that owns the `WatchedSite[]` state and passes callbacks down to `Hero` (adds sites) and `WatchedSites` (fetches/removes).

**Fetching:** `POST /api/scrape` proxies requests to Firecrawl.dev and returns `{ markdown }`. The API key is server-side only (`FIRECRAWL_API_KEY` in `.env.local`). The Firecrawl SDK v4 uses `.scrape()` (not `.scrapeUrl()`), throws on error, and returns `Document` directly.

**Key constraint:** `pnpm build` runs `jest --ci` via `prebuild`. Failing tests block the build. Both scripts explicitly set `NODE_ENV=test` to avoid React production bundle issues with RTL's `act()`.

**Component model:** Most components are Server Components. Client components: `Hero.tsx` (URL input + state), `WatchedSites.tsx` (fetch/remove interactions), `page.tsx` (shared state owner). New components should default to server unless they need interactivity.

**State & storage:** `lib/storage.ts` wraps localStorage (key: `watchdog-sites-v1`). `lib/hash.ts` provides djb2 hashing. Site status (`sniffing | quiet | changed | error`) is derived at runtime — only `changed: boolean` is persisted to distinguish a detected change from a baseline.

**Testing:** TDD enforced. Tests live in `__tests__/`. API route tests need `/** @jest-environment node */` at the top (jsdom doesn't have `Request`). When mocking Firecrawl in tests, use `mockImplementation` in `beforeEach` (not a module-level const) because the instance is created per-request.

**Styling:** CSS custom properties (`--bg`, `--bg2`, `--bg3`, `--t1`–`--t3`, `--blue`, `--blue-g`, `--red`, `--green`) defined in `globals.css`. Dark mode is the default; light mode applies via `prefers-color-scheme`.

## Roadmap Context

See `watchdog-prd-trd.md` for the full spec. The app currently implements V1 manual monitoring (paste URL → snapshot → re-check → see changed/quiet). V2.0 adds backend, automated polling, and auth. Design decisions should account for this trajectory but not over-engineer prematurely.
