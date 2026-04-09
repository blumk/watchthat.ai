# WatchThat — Supabase backend (Phase 1: data layer)

## Context

Today the whole app is client-only: `lib/storage.ts` (166 lines, IndexedDB via `idb`) is the single source of truth, and `/api/scrape`, `/api/analyze`, `/api/describe-change` are stateless passthroughs. Every browser is an island — snapshots, screenshots, and change history live only in that one device's IndexedDB. This blocks V2 work (auth, polling, notifications, sharing) and forces every user to pay the Firecrawl cost for the same URL.

**This push replaces IndexedDB with Supabase as the single source of truth** and introduces a shared-content model so fetches for the same URL within a short window are deduped across users. It does **not** add sign-up/UI, polling, or notifications — those are separate phases.

### Decisions locked in
- **Scope:** data layer only (schema + APIs + Supabase setup + default AI change summary).
- **IndexedDB:** removed entirely. `idb` dep goes with it. Existing local data is not migrated (app is pre-release).
- **Hosting:** Vercel + Supabase cloud. Local dev uses the `supabase` CLI (Docker) so migrations can be iterated without touching prod.
- **Sharing model:** URLs and snapshots are **global, shared resources**. If user A fetched `cnn.com` within the last ~60s, user B's request returns the cached snapshot (no Firecrawl call).
- **Identity:** Supabase **Anonymous Auth** — every browser gets a real `auth.uid()` with no sign-up flow. Upgrading an anon account to email/OAuth later is a one-liner. This is the right shape even though we're not building sign-in UI yet.
- **Default AI summary:** every new snapshot that differs from the previous one runs `/api/describe-change` server-side and stores the result on the snapshot row. Per-user custom watch targets are Phase 2.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js client)                 │
│                                                                  │
│  page.tsx ──► lib/db.ts (Supabase JS, anon key + anon JWT)       │
│                 │                                                │
│                 │ RLS-scoped reads of own watches                │
│                 │ Public reads of pages / snapshots              │
│                 ▼                                                │
└─────────────────┬────────────────────────────────────────────────┘
                  │ fetch("/api/watches", ...)
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Next.js API routes (Vercel)                   │
│                                                                  │
│  /api/watches          CRUD user↔page subscriptions              │
│  /api/watches/refresh  force refresh (bypasses 60s dedup)        │
│  /api/scrape           (internal) fetch+persist, 60s dedup       │
│  /api/analyze          unchanged (watch-target suggestions)      │
│  /api/describe-change  unchanged (called from /api/scrape)       │
│                                                                  │
│  Uses: SUPABASE_SERVICE_ROLE_KEY (write-through, bypasses RLS)   │
│        FIRECRAWL_API_KEY, ANTHROPIC_API_KEY (existing)           │
└─────────────────┬────────────────────────────────────────────────┘
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
┌──────────────────┐   ┌─────────────────────────────────────────┐
│    Firecrawl     │   │            Supabase (cloud)             │
│ scrape + shot    │   │                                         │
└──────────────────┘   │  Postgres:                              │
                       │    pages, snapshots, watches            │
                       │  Storage bucket: "screenshots"          │
                       │  Auth: anonymous sessions               │
                       │  RLS: watches.user_id = auth.uid()      │
                       └─────────────────────────────────────────┘
```

Read path (cheap, client-direct):
```
client ── supabase-js ──► pages / snapshots / watches (RLS)
```
Write path (expensive, always through API):
```
client ── fetch /api/watches ──► Next.js route ── service-role ──► Supabase
                                       │
                                       └── Firecrawl (only if cache miss)
                                       └── Anthropic (only on diff)
```

---

## Data model

Three tables + one storage bucket. All timestamps are `timestamptz`.

### `pages` (global, shared)
| col | type | notes |
|---|---|---|
| `id` | uuid pk | default `gen_random_uuid()` |
| `url` | text **unique** | normalized (lowercase host, trimmed trailing slash, protocol-forced `https://`) |
| `label` | text | default-derived from URL on insert |
| `last_fetched_at` | timestamptz | drives the 60s dedup window |
| `latest_snapshot_id` | uuid fk → `snapshots.id` on delete set null |
| `created_at` | timestamptz default `now()` |

Index: `unique (url)`.

### `snapshots` (global, append-only)
| col | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `page_id` | uuid fk → `pages.id` on delete cascade | |
| `fetched_at` | timestamptz | |
| `content_hash` | text | sha256 of normalized markdown |
| `markdown` | text | raw markdown |
| `screenshot_path` | text null | Supabase Storage key; full URL built client-side |
| `prev_snapshot_id` | uuid fk → `snapshots.id` null | chain for diff lookup |
| `change_description` | text null | AI summary (null on first snapshot) |
| `change_classification` | text null | `major` \| `minor` \| `quiet` \| `error` |
| `change_emoji` | text null | |

Indexes: `(page_id, fetched_at desc)`, `(content_hash)`.

### `watches` (per-user subscription)
| col | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk → `auth.users.id` on delete cascade | |
| `page_id` | uuid fk → `pages.id` on delete cascade | |
| `created_at` | timestamptz default `now()` |
| `last_seen_snapshot_id` | uuid fk → `snapshots.id` null | "unread" marker |
| `watch_target` | text null | reserved, Phase 2 |

Constraints: `unique (user_id, page_id)`.

### RLS
- `pages`, `snapshots`: `select` public (anon role); `insert/update` only via service role (API routes).
- `watches`: `select/insert/update/delete` where `user_id = auth.uid()`. No cross-user reads.
- Storage bucket `screenshots`: public read, service-role write.

### The 60s dedup (the key trick)
In `/api/scrape`, inside a single transaction:
```
select last_fetched_at, latest_snapshot_id from pages where url = $1 for update;
if last_fetched_at > now() - interval '60 seconds':
    return the cached snapshot row, mark response.cached = true
else:
    firecrawl ── new markdown + screenshot
    hash = sha256(markdown)
    if hash == latest_snapshot.content_hash:
        update pages.last_fetched_at = now()
        return the existing snapshot (content unchanged, timer reset)
    else:
        upload screenshot → Storage
        call describe-change(old=latest.markdown, new=markdown, url)
        insert snapshot
        update pages.last_fetched_at, pages.latest_snapshot_id
        return the new snapshot
```
`for update` serializes two browsers hitting the same URL at the same second. The second one waits, sees the first's fresh row, returns cached.

---

## APIs

### Existing (kept)
- `POST /api/analyze` — unchanged.
- `POST /api/describe-change` — unchanged; now called server-to-server from `/api/scrape`.

### Rewritten
- `POST /api/scrape`
  - **Before:** `{ url } → { markdown, html, rawHtml, screenshot }` (stateless).
  - **After:** `{ url, force?: boolean } → { snapshot, cached: boolean }` where `snapshot` is a full `snapshots` row. `html` and `rawHtml` are dropped (already stripped before persist; nothing reads them). Screenshot is a Storage URL, not base64.

### New
- `POST /api/watches` — `{ url } → { watch, snapshot }`. Normalizes URL, upserts page, ensures snapshot exists (triggers `/api/scrape` internally), creates watch for current user.
- `GET  /api/watches` — returns caller's watches joined with latest snapshot. (Could be client-direct via supabase-js + RLS; API wrapper kept for symmetry and so we can add rate limits later.)
- `DELETE /api/watches/:id` — RLS-guarded.
- `POST /api/watches/:id/refresh` — force re-scrape (bypasses 60s dedup, still respects hash-equality short-circuit).

All server routes read `Authorization: Bearer <anon JWT>` from the client, validate via `supabase.auth.getUser()`, then use a service-role client for DB writes.

---

## Files to change

### New
- `supabase/migrations/0001_init.sql` — tables, indexes, RLS policies, screenshots bucket.
- `supabase/config.toml` — `supabase init` output, checked in.
- `lib/supabase/client.ts` — browser client factory (anon key, auto-refresh).
- `lib/supabase/server.ts` — Next.js server client + service-role client factory.
- `lib/db.ts` — replacement for `lib/storage.ts`; same function names (`getSites`, `addSite`, `updateSite`, `removeSite`) so callers barely change. Implemented against supabase-js.
- `lib/url.ts` — URL normalization (extracted from current `addSite`).
- `lib/hash.ts` — sha256 helper for `content_hash`.
- `app/api/watches/route.ts`, `app/api/watches/[id]/route.ts`, `app/api/watches/[id]/refresh/route.ts`.
- `.env.example` — document `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` alongside existing `FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`.

### Modified
- `app/api/scrape/route.ts` — becomes the persistence path described above. Firecrawl call logic reused.
- `app/layout.tsx` or a new `app/providers.tsx` — ensure an anonymous session exists on first paint (`supabase.auth.signInAnonymously()` if no session).
- `app/page.tsx`, `components/WatchedSites.tsx`, `components/Hero.tsx`, `components/WatchSetup.tsx` — swap `lib/storage` import for `lib/db`. Field shapes need tweaks: `lastScreenshot` (base64) → `screenshotUrl` (Storage URL); `history` derived from `snapshots` query, not stored inline on the watch.
- `REQUIREMENTS.md` — update state/storage section.
- `README.md` — add Supabase local setup steps.
- `package.json` — add `@supabase/supabase-js`, `@supabase/ssr`; remove `idb`.

### Deleted
- `lib/storage.ts`
- `__tests__/storage.test.ts` (replaced by `__tests__/db.test.ts`)

### Reused (don't recreate)
- `lib/example-site.ts` — still useful for test fixtures; tweak shape to new `WatchedSite`.
- URL-label scoring algorithm currently inside `addSite` — extract into `lib/url.ts`, keep behavior.
- Firecrawl invocation block in current `/api/scrape/route.ts` — lift verbatim into the new flow.
- `/api/describe-change` — no changes; just a new caller.

---

## Testing

TDD is enforced (`pnpm build` runs Jest first). Approach:

1. **Unit tests** — mock `@supabase/supabase-js` client. Replaces the `fake-indexeddb` setup in `jest.setup.ts`. New helper `__tests__/helpers/supabase-mock.ts` returns a chainable query builder that records calls + returns seeded data.
2. **API route tests** — `/** @jest-environment node */`. Mock both supabase client and firecrawl. Verify:
   - 60s dedup returns `cached: true` without calling Firecrawl.
   - Hash-equal re-scrape returns existing snapshot, updates `last_fetched_at`.
   - Hash-different re-scrape calls `describe-change`, inserts snapshot, updates `latest_snapshot_id`.
   - Force refresh bypasses the 60s check.
   - `watches` routes enforce ownership via injected fake JWT.
3. **Integration test (new, optional gate)** — `pnpm test:integration` runs against `supabase start` localhost. Not in `pnpm build`'s prebuild, only in CI. Seed schema via migration files, assert full watch flow.

---

## Phased execution

Small PRs. Each leaves `main` green.

1. **Supabase bootstrap** — `supabase init`, first migration, `.env.example`, `lib/supabase/*`. No UI changes.
2. **`lib/db.ts` parity with `lib/storage.ts`** — same function signatures, Supabase-backed. Swap imports. Tests for `lib/db.ts` match old storage tests where behavior is unchanged. App still works end-to-end.
3. **Rewrite `/api/scrape` with dedup + snapshot persistence.** `page.tsx` and `WatchedSites.tsx` consume the new response shape.
4. **`/api/watches` + `refresh`.** Existing UI flows move from "add site then call scrape" to "call /api/watches which does both."
5. **Screenshot storage migration** — base64 → Supabase Storage URL. Delete `lastScreenshot` column equivalents from client state.
6. **Cleanup** — remove `idb`, `lib/storage.ts`, old storage tests; update `REQUIREMENTS.md` and `README.md`.

---

## Verification

- `pnpm test:ci` passes (unit + route tests).
- `pnpm build` passes (prebuild runs tests).
- `pnpm dev`, then `sleep 8 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns `200` (per CLAUDE.md post-push ritual).
- Manual browser walkthrough:
  - First visit: anonymous session created, no existing watches, Hero renders.
  - Add `https://news.ycombinator.com` → snapshot appears with AI change description on first-ever fetch it says something like "Initial snapshot".
  - In a second browser (incognito), add the same URL within 60s → server logs show `cached: true`, no Firecrawl call, snapshot ID matches.
  - Wait 60s+, force refresh → Firecrawl called, if content unchanged a new snapshot is **not** inserted (hash match), `last_fetched_at` bumps.
  - Change a small watched page (or point at a time-varying endpoint), refresh → new snapshot inserted, `change_description` populated, UI reflects change.
  - Remove a watch → row gone, the shared `pages`/`snapshots` stay (another user may still be watching).

---

## Out of scope (explicit non-goals for this push)

- Sign-up / login UI (anon session is enough).
- Automated polling (cron, pg_cron, service workers).
- Email / push / webhook notifications.
- Per-user custom watch targets (`watch_target` column exists but nothing writes to it).
- Diff UI beyond the existing description string.
- Backfill of existing IndexedDB users — app is pre-release, wipe is acceptable.
