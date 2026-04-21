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

## Requirements doc

`REQUIREMENTS.md` is the living plain-English specification of what the app currently does.
It maps one-to-one with the test suite — every behaviour listed there should have a covering test, and every non-trivial test should appear there.

**When to update it:**
- After adding, changing, or removing any user-visible behaviour
- After adding or removing tests
- After a push — re-read the relevant sections and remove anything stale, add anything missing

## After every push

1. Start the dev server: `pnpm dev` (automatically clears `.next` cache before starting)
2. Verify it loads: `sleep 8 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` — must return `200`

**How to update it:**
- Edit the relevant section(s) in place — don't append to the bottom
- Reference the test file in `[square brackets]` next to each requirement
- If a requirement has no test yet, mark it `[untested]` as a prompt to add one

Do not rewrite the whole doc for minor changes — surgical edits only.

## Architecture

Next.js 15 App Router (webpack dev bundler — Turbopack removed due to stale manifest bugs). `page.tsx` is a client component that owns `WatchedSite[]` state and passes callbacks down to `Hero` (adds sites) and `WatchedSites` (fetches/removes/updates).

**Fetching:** `POST /api/scrape` returns `{ snapshot, cached, newChange }`. It normalizes the URL, upserts a shared `pages` row, and either (a) returns the existing latest snapshot if the page was fetched within the 5-minute dedup window (`cached: true`, no Firecrawl call), or (b) calls Firecrawl, uploads a fresh screenshot to Supabase Storage, always inserts a new `snapshots` row (even on hash-equal — keeps the screenshot current since markdown hashing misses visual-only changes), and updates `pages.latest_snapshot_id` + `last_fetched_at`. `describeChange` is only called when the sha256 markdown hash differs from the previous snapshot; hash-equal snapshots get `classification: "quiet"`, `change_description: null`, and skip the Claude call. `force: true` bypasses the 5-min dedup. Firecrawl SDK v4 uses `.scrape()`, throws on error, returns `Document` directly. Full-page screenshot via `actions: [{ type: "screenshot", fullPage: true }]`; result at `result.actions.screenshots[0]`.

**Key constraint:** `pnpm build` runs `jest --ci` via `prebuild`. Failing tests block the build. Both scripts explicitly set `NODE_ENV=test` to avoid React production bundle issues with RTL's `act()`. A pre-push git hook (`scripts/hooks/pre-push`, installed via `scripts/install-hooks.sh`) runs `scan:secrets` → `lint` → `test:ci` → `build` before every push.

**Component model:** Most components are Server Components. Client components: `Hero.tsx`, `WatchedSites.tsx`, `page.tsx`. New components default to server unless they need interactivity.

**State & storage:** `lib/db.ts` is Supabase-backed. `getSites`/`updateSite`/`removeSite`/`_clearAll` call supabase-js directly under RLS; `addSite` goes through `POST /api/watches` because inserting into the shared `pages` table requires the service-role key. Anonymous auth is bootstrapped lazily on the first `lib/db` call (`supabase.auth.signInAnonymously()`). `getSites` hydrates `lastContent` / `lastHash` / `lastScreenshot` / `lastChecked` / `changeDescription` / `changed` from each page's `latest_snapshot_id`, and `history` from past snapshots with a non-null `change_description` and classification `major`/`minor` (one query with `.in('page_id', …)` then grouped client-side). Site status (`sniffing | quiet | changed | error`) is derived at runtime, never persisted.

**Intelligence:** `POST /api/extract` (Claude Haiku) extracts a watch-target value from markdown. `POST /api/describe-change` (Claude Haiku) writes a plain-English change description. Both strip markdown code fences before JSON parsing the response.

**Testing:** TDD enforced. Tests live in `__tests__/`. API route tests need `/** @jest-environment node */` at the top. `lib/db` tests use the in-memory Supabase fake at `__tests__/helpers/supabase-mock.ts` (`_setSessionForTests` injects a fake client + user; `installFetchMock` intercepts `/api/watches`). When mocking Firecrawl, use `mockImplementation` in `beforeEach` (not module-level) because the instance is created per-request.

**Styling:** CSS custom properties (`--bg`, `--bg2`, `--bg3`, `--t1`–`--t3`, `--blue`, `--blue-g`, `--red`, `--green`) defined in `globals.css`. Dark mode is the default; light mode via `prefers-color-scheme`.

## Roadmap Context

See `watchthat-prd-trd.md` for the full spec and implementation findings. V2.0 adds backend, automated polling, and auth. Design decisions should account for this trajectory but not over-engineer prematurely.
