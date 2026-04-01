# Watchdog — Product & Technical Requirements

**Know when websites change.**

| | |
|---|---|
| Version | 1.0 |
| Date | March 31, 2026 |
| Status | Draft |
| Classification | Internal |

---

## Part 1: Product Requirements

### 1. Executive Summary

Watchdog is a website change monitoring tool that lets users subscribe to any URL and receive alerts when the page's content changes. Users paste a URL, Watchdog takes an initial content snapshot, and on subsequent checks it compares the current state against the stored baseline. When a difference is detected, the user sees exactly what changed through an inline diff view.

The product addresses a real, underserved need: knowing when a webpage updates without manually revisiting it. Use cases range from tracking competitor pricing pages, monitoring government regulation updates, following job board postings, watching for restocks on product pages, and detecting unauthorized changes to one's own sites.

### 2. Problem Statement

The web is dynamic but human attention is finite. People and businesses need to know when specific pages change, but the existing solutions fall into two extremes:

- **Enterprise monitoring tools** (Distill.io, Visualping, ChangeTower) — complex setup, subscription fatigue, feature bloat. Most users need 10% of what these offer.
- **Manual checking** — bookmarking a page and revisiting it periodically. Error-prone, time-consuming, and unsustainable at scale.

Watchdog fills the gap: a fast, focused, zero-configuration tool. Paste a URL, get alerted. No account required for the MVP.

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

**Tagline:** Know when websites change.

**Core principles:**

- **Zero friction.** Paste a URL and you're done. No signup, no config, no learning curve.
- **Clarity over complexity.** Show what changed, not a wall of data. The diff view is the product.
- **Reliable by default.** If a site is reachable, Watchdog should monitor it. Handle CORS, JS rendering, and encoding gracefully.
- **Personality.** The "watchdog" brand is friendly and clear. The dog barks when something changes. Users remember it.

### 5. Feature Requirements

#### 5.1 MVP (Current Prototype)

| Feature | Description | Priority |
|---------|-------------|----------|
| URL input (hero search bar) | Prominent search bar in hero section. User pastes a URL and clicks "Watch." Auto-prefixes `https://` if missing. | P0 |
| Automatic first snapshot | On add, Watchdog immediately fetches the page, extracts text content, generates a hash, and stores the baseline. | P0 |
| Manual re-check | Per-site "Fetch" button and global "Sniff All" to re-check on demand. | P0 |
| Change detection | Compares new content hash to stored hash. If different, status becomes "Woof! Changed." | P0 |
| Inline diff view | Expandable diff panel showing added/modified content with green "+" markers. Up to 10 changes shown, remainder summarized. | P0 |
| Acknowledge alerts | User can dismiss a change alert, resetting the site to "Watching" state with the new content as the baseline. | P0 |
| Persistent storage | Watched sites, content snapshots, and hashes persist across browser sessions via localStorage. | P0 |
| Status system | Six states: New, Watching, Sniffing, All Quiet, Woof! Changed, Error. Each with distinct color and icon. | P0 |
| Remove site | One-click removal from the watched list. | P1 |
| Responsive design | Fully responsive from 320px mobile to desktop. Dark/light theme support. | P1 |

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

1. User lands on Watchdog landing page. Sees hero headline, search bar, feature cards.
2. Pastes a URL into the search bar and clicks "Watch" (or presses Enter).
3. Page auto-scrolls to dashboard. Site appears with "Sniffing…" status.
4. After 1–3 seconds, status changes to "All quiet" with a green checkmark. Baseline captured.
5. User returns later and clicks "Fetch" or "Sniff All." If content changed, sees "Woof! Changed" with a red badge.
6. Clicks the change count to expand the diff view. Reviews changes, clicks "Acknowledge."

#### 6.2 Returning User

1. Opens Watchdog. Previously watched sites load from persistent storage.
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
| Frontend | Next.js 15 (App Router, RSC) | Component-based, TDD enforced |
| Styling | Tailwind CSS + CSS variables | `prefers-color-scheme` for auto dark/light |
| Storage | localStorage | JSON serialized. Key: `watchdog-sites-v1` |
| Networking | Firecrawl.dev API via Next.js API route | Handles CORS, JS rendering, returns clean markdown |
| Hashing | djb2 (client-side) | 32-bit hash of markdown content |

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

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique ID: `Date.now().toString(36)` + random chars |
| url | string | Full URL with protocol. Auto-prefixed with `https://` if missing |
| label | string | User-defined display name. Falls back to hostname |
| lastChecked | number \| null | Unix timestamp (ms) of last fetch attempt |
| lastHash | string \| null | djb2 hex hash of markdown content |
| lastContent | string \| null | Full markdown content of last successful fetch |
| error | string \| null | Error message from last failed fetch |

Status (`new | sniffing | quiet | changed | error`) is derived at runtime, not persisted.

#### 9.2 V2 Schema Extensions

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
| POST | `/api/scrape` | Scrape a URL via Firecrawl. Body: `{ url: string }`. Returns `{ markdown: string }` |

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
| Time to first snapshot | <4s | Firecrawl fetch + hash |
| Concurrent site checks | ≥20 sites | Limited by browser connection pool |
| Storage per site | <500KB | Depends on page markdown length |
| Total storage limit | <5MB | localStorage constraint |

### 14. Error Handling

| Error Scenario | Current Handling | V2 Improvement |
|---------------|-----------------|----------------|
| CORS blocked | Handled by Firecrawl | N/A |
| HTTP 4xx/5xx | Shows HTTP status in error message | Retry with exponential backoff. Auto-pause after 5 consecutive failures |
| Network offline | Generic error shown | Detect `navigator.onLine`, queue checks for when connectivity returns |
| Firecrawl API down | Fetch fails | Fallback strategy; cache last known content |
| Content too large | May exceed storage limit | Truncate to 500KB. Warn user |
| Invalid URL | Fetch fails | Client-side URL validation before adding |

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
| False positives from dynamic content (timestamps, ads) | High | Medium | CSS selector targeting in V2. Firecrawl's markdown extraction already filters much of this |
| localStorage limits exceeded | Low | Medium | Monitor storage usage. Implement LRU eviction for content |
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

---

*This PRD/TRD is a living document and will be updated as the product evolves.*
