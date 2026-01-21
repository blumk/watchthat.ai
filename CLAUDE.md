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

1. Clear cache and restart dev server: `pkill -f "next dev" 2>/dev/null; rm -rf .next && pnpm dev &`
2. Verify it loads: `sleep 8 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` — must return `200`

**Why clear `.next`?** Turbopack's incremental cache goes stale after significant module graph changes (e.g. removing imports, adding components). Symptom is "Internal Server Error" / React Client Manifest error despite a clean build. Always wipe it after a push.

**How to update it:**
- Edit the relevant section(s) in place — don't append to the bottom
- Reference the test file in `[square brackets]` next to each requirement
- If a requirement has no test yet, mark it `[untested]` as a prompt to add one

Do not rewrite the whole doc for minor changes — surgical edits only.

## Architecture

Next.js 15 App Router with Turbopack. `page.tsx` is a client component that owns `WatchedSite[]` state and passes callbacks down to `Hero` (adds sites) and `WatchedSites` (fetches/removes/updates).

**Fetching:** `POST /api/scrape` proxies to Firecrawl.dev and returns `{ markdown, html, rawHtml, screenshot }`. API key is server-side only. Firecrawl SDK v4 uses `.scrape()`, throws on error, returns `Document` directly. Full-page screenshot via `actions: [{ type: "screenshot", fullPage: true }]`; result at `result.actions.screenshots[0]`.

**Key constraint:** `pnpm build` runs `jest --ci` via `prebuild`. Failing tests block the build. Both scripts explicitly set `NODE_ENV=test` to avoid React production bundle issues with RTL's `act()`. A pre-push git hook runs lint → test:ci → build before every push.

**Component model:** Most components are Server Components. Client components: `Hero.tsx`, `WatchedSites.tsx`, `page.tsx`. New components default to server unless they need interactivity.

**State & storage:** `lib/storage.ts` wraps IndexedDB via the `idb` library. All functions are async. `lastHtml`, `lastRawHtml`, and `ChangeEntry.screenshot` are stripped before writing (unused / per-entry bloat). `lastScreenshot` is persisted. Site status (`sniffing | quiet | changed | error`) is derived at runtime, never persisted. Legacy `watchdog-sites-v1` localStorage data is auto-migrated on first open.

**Intelligence:** `POST /api/extract` (Claude Haiku) extracts a watch-target value from markdown. `POST /api/describe-change` (Claude Haiku) writes a plain-English change description. Both strip markdown code fences before JSON parsing the response.

**Testing:** TDD enforced. Tests live in `__tests__/`. API route tests need `/** @jest-environment node */` at the top. `fake-indexeddb/auto` and a `structuredClone` polyfill are configured in `jest.setup.ts`. Storage tests call `_clearAll()` in `beforeEach` to isolate state. When mocking Firecrawl, use `mockImplementation` in `beforeEach` (not module-level) because the instance is created per-request.

**Styling:** CSS custom properties (`--bg`, `--bg2`, `--bg3`, `--t1`–`--t3`, `--blue`, `--blue-g`, `--red`, `--green`) defined in `globals.css`. Dark mode is the default; light mode via `prefers-color-scheme`.

## Roadmap Context

See `watchdog-prd-trd.md` for the full spec and implementation findings. V2.0 adds backend, automated polling, and auth. Design decisions should account for this trajectory but not over-engineer prematurely.
