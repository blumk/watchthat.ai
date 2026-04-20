# Watchthis — Product & Technical Requirements

**Know when websites change.**

| | |
|---|---|
| Version | 1.1 |
| Date | April 2, 2026 |
| Status | Draft |
| Classification | Internal |

---

## Part 1: Product Requirements

### 1. Executive Summary

Watchthis is a website change monitoring tool that lets users subscribe to any URL and receive alerts when the page's content changes. Users paste a URL, Watchthis takes an initial content snapshot, and on subsequent checks it compares the current state against the stored baseline. When a difference is detected, the user sees exactly what changed through an inline diff view.

The product addresses a real, underserved need: knowing when a webpage updates without manually revisiting it. Use cases range from tracking competitor pricing pages, monitoring government regulation updates, following job board postings, watching for restocks on product pages, and detecting unauthorized changes to one's own sites.

### 2. Problem Statement

The web is dynamic but human attention is finite. People and businesses need to know when specific pages change, but the existing solutions fall into two extremes:

- **Enterprise monitoring tools** (Distill.io, Visualping, ChangeTower) — complex setup, subscription fatigue, feature bloat. Most users need 10% of what these offer.
- **Manual checking** — bookmarking a page and revisiting it periodically. Error-prone, time-consuming, and unsustainable at scale.

Watchthis fills the gap: a fast, focused, zero-configuration tool. Paste a URL, get alerted. No account required for the MVP.

### 3. Target Users

| Persona | Use Case | Frequency |
|---------|----------|-----------|
| Product Manager | Monitor competitor feature/pricing pages | Daily |
| Job Seeker | Watch specific company career pages for new postings | Multiple/day |
| Developer | Track changelog or docs pages for upstream dependencies | Weekly |
| Compliance Officer | Monitor regulatory body pages for policy updates | Daily |
| E-commerce Buyer | Watch product pages for restock or price drops | Multiple/day |
| SEO Specialist | Detect unauthorized content changes on managed sites | Daily |
| Journalist / Researcher | Track institutional pages for newsworthy updates | Variable |

### 4. Product Vision

**Tagline:** We monitor [rotating: websites | job postings | ticket drops | …] so you don't have to.

**Core principles:**

- **Zero friction.** Paste a URL and you're done. No signup, no config, no learning curve.
- **Clarity over complexity.** Show what changed, not a wall of data. The diff view is the product.
- **Reliable by default.** If a site is reachable, Watchthis should monitor it. Handle CORS, JS rendering, and encoding gracefully.
- **Personality.** The "watchthis" brand is friendly and clear. The dog barks when something changes. Users remember it.

### 5. Feature Requirements

#### 5.1 MVP (Current Prototype)

| Feature | Description | Priority |
|---------|-------------|----------|
| URL input (hero search bar) | Prominent search bar in hero section. User pastes a URL and clicks "Watch." Auto-prefixes `https://` if missing. | P0 |
| Automatic first snapshot | On add, Watchthis immediately fetches the page, extracts text content, generates a hash, and stores the baseline. | P0 |
| Manual re-check | Per-site "Fetch" (↻) button to re-check on demand. | P0 |
| Change detection | Compares new content hash to stored hash. If different, status becomes "Changed" with a red timestamp. | P0 |
| Semantic watch target | Per-site "watch target" field (e.g. "the Pro plan price"). Uses Claude Haiku to extract a specific value on each check and detect changes to that value only. | P0 |
| Change history log | Every fetch appended as a `ChangeEntry` (description, classification: major/minor/quiet, timestamp, screenshot). Scrollable per-site history panel with screenshot viewer. | P0 |
| Claude-generated descriptions | When a change is detected, Claude Haiku writes a one-sentence plain-English description (e.g. "The Pro plan price increased from $99 to $149.") | P0 |
| Full-page screenshots | Firecrawl `actions` API captures a full-page screenshot on each fetch. Shown in the history panel. Not persisted across sessions (session memory only). | P0 |
| Persistent storage | Site configs, hashes, and change history persist across sessions via IndexedDB. | P0 |
| Status system | Four states: sniffing, quiet, changed, error. Status derived at runtime, never persisted. | P0 |
| Remove site | Remove button shown at the bottom of an expanded card (or inline for error sites with no content). | P1 |
| Demo mode | "Try with news.ycombinator.com →" button pre-loads an example site when no sites are watched. | P1 |
| Responsive design | Fully responsive. Dark mode default; light mode via `prefers-color-scheme`. | P1 |

#### 5.2 V2 (Planned)

| Feature | Description | Priority |
|---------|-------------|----------|
| Automated polling | Background checks on a user-defined interval (e.g., every 5m, 1h, 6h, 24h). Requires service worker or backend. | P0 |
| Push notifications | Browser push notifications when a change is detected during polling. | P0 |
| Email/webhook alerts | Send change alerts via email or POST to a webhook URL. Requires backend infrastructure. | P1 |
| Custom labels | User-editable labels for watched sites. | P1 |
| CSS selector targeting | Monitor only a specific section of a page instead of full page text. | P1 |
| Change history | Store a timeline of all detected changes per site, not just the latest. | P2 |
| Screenshot diffing | Visual screenshot comparison in addition to text diffing. | P2 |
| Bulk import | Import a list of URLs (CSV, paste multiple lines). | P2 |
| Folders / tags | Organize watched sites into groups. | P2 |
| Public share links | Generate a shareable read-only dashboard link. | P3 |

### 6. User Flows

#### 6.1 First-Time User

1. User lands on Watchthis landing page. Sees hero headline, search bar, feature cards.
2. Pastes a URL into the search bar and clicks "Watch" (or presses Enter).
3. Page auto-scrolls to dashboard. Site appears with "Sniffing…" status.
4. After 1–3 seconds, status changes to "All quiet" with a green checkmark. Baseline captured.
5. User returns later and clicks "Fetch" or "Sniff All." If content changed, sees "Woof! Changed" with a red badge.
6. Clicks the change count to expand the diff view. Reviews changes, clicks "Acknowledge."

#### 6.2 Returning User

1. Opens Watchthis. Previously watched sites load from persistent storage.
2. Clicks "Sniff All" to re-check all sites simultaneously.
3. Sites with changes display red indicators. Nav shows alert dot.
4. Can add new URLs from the same hero search bar without disrupting the existing dashboard.

### 7. Success Metrics

| Metric | Target (MVP) | Measurement |
|--------|-------------|-------------|
| Sites added per session | ≥2 | Storage analytics |
| Return rate (7-day) | ≥40% | Returning visitors with existing stored sites |
| Time to first watch | <10 seconds | From page load to first URL submitted |
| Change detection accuracy | >95% | True positives / (true positives + false negatives) |
| Error rate (fetch failures) | <15% | Error status sites / total sites checked |

---

## Part 2: Technical Requirements

### 8. Architecture Overview

The MVP is a single-page React application with no backend. All logic runs client-side. This is a deliberate architectural decision: it minimizes infrastructure cost, eliminates auth complexity, and enables the fastest possible time-to-value for users.

#### 8.1 Current Architecture (MVP)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 15 (App Router, RSC) with Turbopack | Component-based, TDD enforced |
| Styling | Tailwind CSS + CSS variables | `prefers-color-scheme` for auto dark/light |
| Storage | IndexedDB via `idb` | Async, no practical size limit. Session-only fields (screenshots, raw HTML) stripped before persisting. One-time migration from legacy `watchthis-sites-v1` localStorage key. |
| Scraping | Firecrawl.dev API via Next.js API route (`/api/scrape`) | Handles CORS, JS rendering, returns markdown + HTML + full-page screenshot |
| Intelligence | Anthropic Claude Haiku via `/api/extract` and `/api/describe-change` | Extracts watch-target values; generates plain-English change descriptions |
| Hashing | djb2 (client-side) | 32-bit hash of markdown content or extracted value |
| Quality gate | Pre-push hook: `tsc --noEmit` → `jest --ci` → `next build` | Blocks push on any failure |

#### 8.2 Target Architecture (V2+)

| Component | Technology Options | Purpose |
|-----------|-------------------|---------|
| Backend API | Node.js (Hono/Express) or Go | Manages polling schedules, stores snapshots, sends alerts |
| Task Queue | BullMQ (Redis) or SQS | Schedules and distributes polling jobs |
| Headless Browser | Playwright pool | Renders JS-heavy pages (Firecrawl handles this in MVP) |
| Database | PostgreSQL + Redis | Postgres for site configs, change history. Redis for job queue |
| Object Storage | S3 / R2 | Stores full page snapshots and screenshots |
| Notifications | Web Push API, SendGrid, webhooks | Multi-channel alerting |
| Auth | Clerk or Auth.js | Required once we persist user data server-side |
| CDN / Edge | Cloudflare Workers | Landing page, static assets, edge-cached API responses |

### 9. Data Model

#### 9.1 Site Object (MVP)

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| id | string | ✓ | Unique ID: `Date.now().toString(36)` + random chars |
| url | string | ✓ | Full URL with protocol. Auto-prefixed with `https://` if missing |
| label | string | ✓ | Hostname derived from URL |
| lastChecked | number \| null | ✓ | Unix timestamp (ms) of last fetch attempt |
| lastHash | string \| null | ✓ | djb2 hex hash of full markdown (used when no watch target) |
| lastContent | string \| null | ✓ | Full markdown of last successful fetch |
| lastHtml | string \| null | ✗ | Rendered HTML — session-only, too large to persist |
| lastRawHtml | string \| null | ✗ | Raw HTML — session-only, too large to persist |
| lastScreenshot | string \| null | ✗ | Base64 full-page screenshot — session-only (can be several MB) |
| watchTarget | string \| null | ✓ | Plain-English description of what to extract, e.g. "the Pro plan price" |
| lastExtractedValue | string \| null | ✓ | Claude's extracted value, e.g. "$99/month" |
| lastExtractedHash | string \| null | ✓ | djb2 hash of `lastExtractedValue` (change comparison key when watch target is set) |
| changeDescription | string \| null | ✓ | Claude-generated description of the latest change |
| changed | boolean | ✓ | Whether an unacknowledged change is present |
| error | string \| null | ✓ | Error message from last failed fetch |
| history | ChangeEntry[] | ✓ (partial) | Fetch log — descriptions/timestamps persisted; screenshots stripped |

Status (`sniffing | quiet | changed | error`) is derived at runtime from persisted fields, never stored.

#### 9.2 ChangeEntry Object

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| id | string | ✓ | `Date.now().toString(36)` + random |
| timestamp | number | ✓ | Unix ms |
| description | string | ✓ | Claude-generated or default ("Initial snapshot taken.", "No changes detected.") |
| classification | `"major" \| "minor" \| "quiet"` | ✓ | Claude-assigned or default. `quiet` = no change / first fetch |
| oldValue | string | ✓ | Previous extracted value (watch target mode only) |
| newValue | string | ✓ | New extracted value (watch target mode only) |
| screenshot | string \| null | ✗ | Base64 screenshot at time of fetch — session-only |

#### 9.3 V2 Schema Extensions

| Field | Type | Description |
|-------|------|-------------|
| userId | string | Foreign key to users table |
| pollInterval | number | Polling frequency in minutes (5, 15, 60, 360, 1440) |
| cssSelector | string \| null | Optional CSS selector to scope monitoring |
| notifyEmail | boolean | Whether to send email alerts |
| notifyWebhook | string \| null | Webhook URL for POST notifications |
| notifyPush | boolean | Whether to send browser push notifications |
| changeHistory | Snapshot[] | Timeline of historical snapshots |
| tags | string[] | User-defined tags for organization |
| screenshotUrl | string \| null | S3/R2 URL of latest page screenshot |
| lastStatusCode | number \| null | HTTP status code of last fetch |
| consecutiveErrors | number | Count of sequential failures. Auto-pause after threshold |

### 10. Core Algorithms

#### 10.1 Content Extraction

With Firecrawl, content extraction is handled server-side. Firecrawl returns clean markdown, eliminating the need for client-side HTML parsing. This solves the JS-rendering limitation inherent in the original `allorigins.win` + `textContent` approach.

#### 10.2 Hashing (djb2)

The djb2 algorithm produces a 32-bit hash stored as an 8-character hexadecimal string. Not cryptographic, but excellent distribution for change detection with minimal computation. Collision probability is approximately 1 in 4 billion for random inputs — acceptable for this use case.

#### 10.3 Word-Level Diffing (V2+)

For the MVP, hash comparison is sufficient (changed vs. not changed). A full diff view is planned for a later iteration. The algorithm will split old and new content into word arrays and walk them in parallel with a 30-word lookahead window. Trade-off: greedy, not LCS. Fast (O(n·k)) but may produce suboptimal diffs for heavily restructured content. V2 should consider patience diff or Myers diff for better accuracy.

### 11. API Design

#### 11.1 MVP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scrape` | Scrape URL via Firecrawl. Returns `{ markdown, html, rawHtml, screenshot }`. 300s timeout (Vercel free tier serverless limit). |
| POST | `/api/extract` | Claude Haiku extraction. Body: `{ markdown, watchTarget }`. Returns `{ value }`. |
| POST | `/api/describe-change` | Claude Haiku description. Body: `{ oldValue, newValue, watchTarget, url }`. Returns `{ description, classification }`. |

**Scrape timeout notes:** Vercel free tier serverless functions allow up to 300s (5 minutes) — this is the configured timeout. The 10s limit applies to *Edge* functions, not Node.js serverless. Complex pages (e.g. CNN.com) regularly take 10–20s. Client parses Vercel infrastructure error codes (`FUNCTION_INVOCATION_TIMEOUT`, `FUNCTION_INVOCATION_FAILED`) for readable error messages when the body is HTML rather than JSON.

#### 11.2 V2 REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sites` | Add a new site to watch |
| GET | `/api/sites` | List all watched sites for the authenticated user |
| GET | `/api/sites/:id` | Get a single site with latest status and changes |
| DELETE | `/api/sites/:id` | Remove a watched site |
| PATCH | `/api/sites/:id` | Update site config (label, interval, selector, notifications) |
| POST | `/api/sites/:id/check` | Trigger an immediate check for a specific site |
| POST | `/api/sites/check-all` | Trigger checks for all user sites |
| GET | `/api/sites/:id/history` | Get change history with pagination |
| POST | `/api/sites/:id/acknowledge` | Acknowledge current change, reset to watching state |
| POST | `/api/webhooks/test` | Send a test payload to the user's configured webhook |

### 12. Security & Privacy

- **No server-side data in MVP.** All data lives in the user's browser storage. No PII collected or transmitted.
- **API key protection.** Firecrawl API key is server-side only (Next.js API route), never exposed to the client.
- **Content storage.** Full page markdown is stored client-side. For sites with sensitive content, this is a consideration. V2 should offer a "hash-only" mode.
- **Rate limiting (V2).** Backend must enforce per-user rate limits. Suggested: max 100 sites per user, minimum 5-minute poll interval.
- **Authentication (V2).** Required before any server-side persistence. OAuth (Google/GitHub) preferred.
- **Webhook validation (V2).** Outbound webhooks should include HMAC signatures.

### 13. Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Initial page load (LCP) | <1.5s | Static Next.js page |
| Time to first snapshot | 5–20s | Firecrawl fetch (varies widely by page complexity; CNN ~15s, simple pages ~3s) |
| Concurrent site checks | ≥20 sites | Limited by browser connection pool |
| Storage per site | <100KB | Markdown + metadata only. HTML/screenshots not persisted. |
| Total storage limit | No hard limit | IndexedDB uses disk quota (~60% of free disk, browser-managed) |

### 14. Error Handling

| Error Scenario | Current Handling | V2 Improvement |
|---------------|-----------------|----------------|
| CORS blocked | Handled by Firecrawl | N/A |
| HTTP 4xx/5xx | Shows HTTP status in error message | Retry with exponential backoff. Auto-pause after 5 consecutive failures |
| Network offline | Generic error shown | Detect `navigator.onLine`, queue checks for when connectivity returns |
| Firecrawl API down | Fetch fails with error card | Fallback strategy; cache last known content |
| Vercel function timeout | Client parses `FUNCTION_INVOCATION_TIMEOUT` from HTML body; shows readable message | Upgrade to Vercel Pro for `maxDuration = 25` config |
| Vercel function crash | Client parses `FUNCTION_INVOCATION_FAILED` from HTML body | Alert + retry |
| Scrape response too large | IndexedDB handles arbitrary size; screenshots/HTML not persisted anyway | N/A |
| localStorage quota exceeded | **Fixed by migrating to IndexedDB.** Root cause: base64 full-page screenshots for complex pages (e.g. CNN) easily exceeded the 5MB localStorage cap, causing `QuotaExceededError` to bubble up as an opaque "Error" status on the site card. | N/A — resolved |
| Invalid URL | Fetch fails | Client-side URL validation before adding |
| Claude returns JSON wrapped in markdown fences | `describe-change` strips ` ```json … ``` ` before `JSON.parse` | N/A — resolved |

### 15. Testing Strategy

#### 15.1 Unit Tests

- `hashString`: verify deterministic output, collision resistance for similar inputs
- `storage`: getSites, addSite, updateSite, removeSite round-trips
- URL normalization: missing protocol, trailing slashes, query params, unicode

#### 15.2 Integration Tests

- Add site → verify storage write → reload → verify site appears with correct status
- Check site → verify hash stored → re-check → verify change detected or not
- Remove site → verify storage updated, UI reflects removal
- Error scenarios: Firecrawl failure, empty response

#### 15.3 E2E Tests

- Full user flow: land → paste URL → watch → see status → re-check → acknowledge
- Responsive: verify layout at 320px, 768px, 1280px breakpoints
- Persistence: add sites → close tab → reopen → verify sites restored

### 16. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Firecrawl API goes down or rate limits | Medium | High | Cache last known content. Add error state with retry |
| False positives from dynamic content (timestamps, ads) | High | Medium | Watch target field mitigates this for specific values. Full-page hash mode still prone to noise. |
| Scrape timeout on complex pages | High | Medium | 300s server timeout. Client shows readable timeout message. Users can retry or simplify URL. |
| Claude API unavailable | Low | Medium | Both API routes fall back to generic messages; scrape still completes |
| IndexedDB quota exceeded | Very Low | Low | Browser-managed quota (~60% of free disk). Practically unlimited for this use case. |
| JS-rendered pages return empty content | Low | High | Firecrawl handles JS rendering natively |
| Legal/ToS concerns with scraping | Low | High | Respect robots.txt. Add rate limiting. Provide opt-out for site owners |

### 17. Roadmap

| Phase | Timeline | Deliverables |
|-------|----------|-------------|
| MVP (current) | Complete | Landing page, manual monitoring, basic change detection, localStorage persistence |
| V1.1 — Polish | Week 1–2 | Custom labels, URL validation, error retry, content truncation, favicon display |
| V1.2 — Notifications | Week 3–4 | Browser push notifications, service worker for background polling |
| V2.0 — Backend | Week 5–8 | API server, database, automated polling, email alerts, webhooks |
| V2.1 — Precision | Week 9–10 | CSS selector targeting, screenshot diffs, diff view |
| V2.2 — Organization | Week 11–12 | Tags/folders, bulk import, change history timeline, public share links |
| V3.0 — Scale | Month 4+ | Multi-tenant, team workspaces, API access, Slack/Discord integrations |

### 18. Implementation Findings (April 2026)

Decisions and discoveries made during the V1 build that aren't obvious from the code.

#### 18.1 Why we switched from localStorage to IndexedDB

Root cause: `localStorage.setItem` throws a synchronous `QuotaExceededError` when the total payload exceeds 5MB. This error bubbled up through `updateSite` → `fetchSite` and was caught by the generic error handler, setting `error` state on the site card — so the user saw "Error" even though the scrape succeeded.

The trigger was full-page screenshots. Firecrawl's `actions` API returns a base64-encoded PNG of the full page. For a complex page like CNN.com, this is 2–5MB. A single fetch for one site could push the total localStorage over the limit.

**Fix:** Migrated to IndexedDB via the `idb` library (v8). Key properties:
- No practical size limit (browser-managed disk quota)
- Async API — doesn't block the main thread
- Large fields (`lastScreenshot`, `lastHtml`, `lastRawHtml`, `ChangeEntry.screenshot`) are stripped before writing — they are kept in React state for the current session only. The user can re-fetch to restore them.
- One-time migration: on first `openDB`, the legacy `watchthis-sites-v1` key is read from localStorage, imported into IndexedDB, and the localStorage key is deleted.

**Test setup:** `fake-indexeddb/auto` added to `jest.setup.ts`. `fake-indexeddb` v6 requires `structuredClone`, which jsdom doesn't expose even on Node 17+. A JSON-based polyfill is added to the setup file.

#### 18.2 Why we use `tsc --noEmit` for lint instead of ESLint

ESLint 10 (released after `eslint-config-next` v16 was written) broke the config: `FlatCompat` caused circular JSON serialization, and `eslint-plugin-react`'s `getFilename` method no longer existed. Debugging the ESLint config was not worth the time for a project this size.

TypeScript's own type-checker (`tsc --noEmit`) catches the same class of errors that matter here (type mismatches, missing imports, unused variables when `noUnusedLocals` is set) and runs faster. This is the configured `pnpm lint` command.

#### 18.3 Pre-push quality gate

A pre-push git hook at `.git/hooks/pre-push` runs `pnpm lint` → `pnpm test:ci` → `pnpm build` in sequence before any push reaches the remote. This catches regressions before they land in production. The `prebuild` script in `package.json` also runs `jest --ci`, so the build itself is gated on tests passing — a second layer of protection.

Both scripts explicitly set `NODE_ENV=test`. This was required to avoid React's production bundle optimizations conflicting with `@testing-library/react`'s `act()` wrapper.

#### 18.4 Firecrawl screenshot API

Firecrawl v4 does not support `screenshot@fullPage` as a format string (it returns `BAD_REQUEST`). Full-page screenshots require the `actions` API:

```typescript
actions: [{ type: "screenshot", fullPage: true }]
```

The result is at `result.actions.screenshots[0]`, not in the main result object. The `actions` field is typed as `unknown` in the SDK and must be cast.

#### 18.5 Vercel serverless vs Edge function timeouts

The 10-second timeout applies to **Edge functions**, not Node.js serverless functions. Vercel free tier serverless functions allow up to **300 seconds**. The `maxDuration` export in route files only raises the limit on Pro+; on free tier the default is already 300s for serverless. Complex pages regularly take 10–20 seconds to scrape; this is within the free tier limit.

When Vercel does kill a function, the response body is HTML (not JSON), so `response.json()` throws. The client now reads the body as text first, then checks for Vercel error strings (`FUNCTION_INVOCATION_TIMEOUT`, `FUNCTION_INVOCATION_FAILED`) before falling back to `JSON.parse`.

#### 18.6 Claude response format

Claude Haiku sometimes wraps JSON responses in markdown code fences (` ```json … ``` `), even when instructed not to. The `describe-change` route strips these before `JSON.parse` with:

```typescript
const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
```

---

*This PRD/TRD is a living document and will be updated as the product evolves.*
