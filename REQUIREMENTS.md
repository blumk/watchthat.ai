# Requirements

Living specification of what WatchThat currently does. Updated whenever behaviour changes.
Each requirement maps to one or more tests — the tests are the authoritative source of truth;
this doc is the human-readable summary.

---

## Hero / Landing page

**Headline**
- Displays "We monitor" and "so you don't have to." as fixed text [`Hero.test.tsx`]
- Rotating term (e.g. "websites", "job postings") shown between the two fixed lines; first term visible on initial render [`Hero.test.tsx`]

**URL input**
- Text input with placeholder `https://example.com` [`Hero.test.tsx`]
- Not auto-focused — keeping the on-screen keyboard collapsed on mobile until the user taps in
- Pressing Enter submits the URL

**Watch button**
- Always visible; click submits the current input value [`Hero.test.tsx`]
- No-ops when input is empty
- Submitting a URL the system has seen before (page row + at least one snapshot already exist) skips the WatchSetup loading screen entirely — `addSite` + `getSites` resolve from cached server-side data and the user lands on the watchlist with the full change log already populated. New URLs continue to flow through the WatchSetup chat for onboarding [untested]

**Demo**
- "Try with news.ycombinator.com →" link shown when no sites are being watched
- Hidden once any site is added

**Watch list header**
- "My watch list" label appears above the site cards once the first site is added
- Hidden when no sites are watched

---

## Site card list (`WatchedSites`)

**Empty state**
- Renders nothing (no DOM output) when `sites` is empty [`WatchedSites.test.tsx`]

**Card content**
- Displays the site's hostname label [`WatchedSites.test.tsx`]
- Shows a relative timestamp ("X ago") for the last check when the site is quiet [`WatchedSites.test.tsx`]
- Shows a relative timestamp when a change has been detected [`WatchedSites.test.tsx`]
- Shows "Error" indicator when the site has an error [`WatchedSites.test.tsx`]
- When the watch's `watchTarget` resolved against the fact bag, shows a small tracked-value badge under the label (e.g. `Rating 4.5`). Hidden when `trackedFact` is null [`WatchedSites.test.tsx`]
- History entries whose snapshot moved the tracked value are prefixed with a mono `Display X → Y · ` marker in front of the description; the initial entry's prefix shows just the first-seen value [`WatchedSites.test.tsx`]

**Remove**
- "Remove website" link shown in the expanded footer [`WatchedSites.test.tsx`]
- Clicking it calls `onRemove` with the site ID [`WatchedSites.test.tsx`]

**Screenshot**
- Thumbnail shown in main row when `lastScreenshot` is present [`WatchedSites.test.tsx`]
- Clicking the thumbnail opens a full-screen modal [`WatchedSites.test.tsx`]
- Screenshot panel on the right of the history list also opens the modal on click

**Share button**
- Each expanded card footer shows a "Share ↗" button next to Download / Edit
- Clicking it copies `${origin}/p/<pageId>` to the clipboard; button label flips to "Copied ✓" briefly [`WatchedSites.test.tsx`]
- Hidden when the site has no `pageId` (e.g. the demo example site)

**Full-screen modal (`ScreenshotModal`)**
- Full-black backdrop; pan/zoom/pinch on the image [`ScreenshotModal.test.tsx`]
- Top bar frames the modal: "Screenshot browser" label, current entry description (≥768px), keyboard hint (≥768px), prominent × close button [`ScreenshotModal.test.tsx`]
- Desktop (≥768px): right rail lists every history entry with a screenshot; clicking a row pins that screenshot; hovering previews it without changing the pin [`ScreenshotModal.test.tsx`]
- All entry screenshots are preloaded into a hidden layer on mount so keyboard / hover / click navigation is flicker-free [`ScreenshotModal.test.tsx`]
- Keyboard: `Escape` closes, `ArrowUp`/`ArrowLeft` steps to the previous entry, `ArrowDown`/`ArrowRight` steps to the next — both navigate from whichever entry is currently previewed (hover or pin); clamped at the ends [`ScreenshotModal.test.tsx`]
- Counter (`N / total`) in the controls bar reflects the currently displayed entry [`ScreenshotModal.test.tsx`]

**Change history log**
- All fetches (including quiet/no-change checks) are appended as `ChangeEntry` records
- Changelog hidden by default; a chevron button (▾/▴) expands/collapses it [`WatchedSites.test.tsx`]
- When collapsed, the latest entry description shown as a subtitle below the site label [`WatchedSites.test.tsx`]
- All history entries rendered in a scrollable list when expanded [`WatchedSites.test.tsx`]
- Each entry shows: classification dot, description text, relative time, exact timestamp
- Description text wraps (not truncated)
- Clicking an entry selects it [`WatchedSites.test.tsx`]
- Initial snapshot logged as "Initial snapshot taken." with `quiet` classification [`WatchedSites.test.tsx`]
- Change entries show the Claude-generated description [`WatchedSites.test.tsx`]
- Selected entry's screenshot shown in a panel to the right; clicking opens the full-screen modal

**Fetch**
- Clicking ↻ calls `POST /api/scrape` and then calls `onUpdate` with a patch derived from the returned `snapshot` [`WatchedSites.test.tsx`]
- Every fetch updates `lastChecked`
- The first-ever fetch (when `lastHash === null`) logs an "Initial snapshot taken." quiet entry carrying the screenshot, so the original state stays visible in the log after later changes [`WatchedSites.test.tsx`]
- Intermediate quiet fetches (no change, cached) add no history entry; instead an ephemeral "No change detected." quiet row is shown in the expanded log until the next real entry (change / initial / error) lands. Not persisted. [`WatchedSites.test.tsx`]
- When the server reports `newChange: true` with a major/minor classification, a history entry is appended using the snapshot's `change_description` [`WatchedSites.test.tsx`]
- Failed fetches log an `"error"` classified entry with the error message as description; the `error` field is also set on the site [`WatchedSites.test.tsx`]

---

## Storage (`lib/db`)

Supabase-backed. Each browser gets a Supabase anonymous session on first use;
per-user `watches` rows join shared `pages` rows via RLS. URL + label are
persisted; `getSites()` hydrates `lastContent` / `lastHash` / `lastScreenshot` /
`lastChecked` / `changeDescription` / `changed` from each page's `latest_snapshot_id`
when one exists, and hydrates `history` from the page's past snapshots
(those with a `change_description` and classification `major`/`minor`) so the
change log is consistent across clients watching the same page.

- `getSites()` returns `[]` when the current user has no watches [`db.test.ts`]
- `addSite(url)` creates a watch (and upserts the shared page) and returns it [`db.test.ts`]
- `addSite` with the same URL twice is idempotent — returns the same watch id [`db.test.ts`]
- `addSite` auto-prefixes `https://` when the protocol is missing [`db.test.ts`]
- `addSite` derives `label` from the hostname when the URL has no meaningful path slug [`db.test.ts`]
- `addSite` initialises ephemeral fields (`lastHash`, `lastContent`, `lastScreenshot`, `history`) to null/empty defaults [`db.test.ts`]
- `addSite` returns distinct ids for different URLs [`db.test.ts`]
- `getSites` hydrates `lastContent`, `lastHash`, `changeDescription`, `changed` from the page's latest snapshot when one exists [`db.test.ts`]
- `getSites` leaves ephemeral fields null when the page has no snapshot yet [`db.test.ts`]
- `getSites` resolves `lastContent` from an earlier snapshot with the same `(page_id, content_hash)` when the latest snapshot's `markdown` is `NULL` (hash-equal re-inserts store `markdown = NULL` to avoid duplicating text server-side) [`db.test.ts`]
- `getSites` hydrates `history` from past snapshots (chronological ascending). The earliest snapshot per page always appears as an "Initial snapshot taken." quiet entry carrying its screenshot; subsequent snapshots are included only when `change_description` is non-null and classification is `major` or `minor`. Mid-sequence quiet snapshots stay excluded [`db.test.ts`]
- `getSites` resolves the watch's `watchTarget` string against the latest snapshot's fact bag (see `lib/watch-target-match`). On match, `site.trackedFact = { key, value, displayName }` and history entries whose snapshot's fact-bag value for that key differs from the last-seen value are annotated with `trackedDelta = { displayName, before?, after }`. Unmatched targets leave both fields unset so the UI falls back to its normal rendering [`db.test.ts`, `watch-target-match.test.ts`]
- `updateSite(id, { watchTarget })` persists `watch_target` on the watch row [`db.test.ts`]
- `updateSite` silently ignores patch fields that only live in React state [`db.test.ts`]
- `updateSite` with an unknown id is a no-op [`db.test.ts`]
- `removeSite(id)` deletes the watch (RLS-scoped to the current user) [`db.test.ts`]
- `removeSite` with an unknown id is a no-op [`db.test.ts`]
- `_clearAll()` deletes every watch for the current user [`db.test.ts`]

---

## API — `/api/scrape`

- `POST` with `{ url, force? }` returns `{ snapshot, cached, newChange }` where `snapshot` is a row from `snapshots` decorated with a public `screenshot_url` [`scrape.test.ts`]
- Returns `400` when `url` is missing [`scrape.test.ts`]
- Returns `400` for an invalid URL (non-parseable or non-http/https protocol) [`scrape.test.ts`]
- Returns `500` when Firecrawl throws [`scrape.test.ts`]
- **5-minute dedup:** if the page was fetched within the last 5 minutes, returns the existing latest snapshot with `cached: true` and no Firecrawl call. Caps scrape frequency per URL across all users. [`scrape.test.ts`]
- **`force: true`** bypasses the dedup window and triggers a fresh Firecrawl call [`scrape.test.ts`]
- **Past the dedup window, every scrape inserts a new snapshot** — even when the markdown hash matches the previous one. Keeps the screenshot fresh (markdown hashing misses visual-only changes like rotating banners/ads). `last_fetched_at` and `latest_snapshot_id` always update. [`scrape.test.ts`]
- **Hash-equal re-fetch:** new snapshot row still inserts, but `/api/describe-change` is skipped (saves tokens); `change_classification` is `"quiet"`, `change_description` is `null`, response `newChange: false`. `snapshots.markdown` is written as `NULL` on the new row (byte-for-byte duplicate of an earlier row would bloat the DB); readers resolve the text via the earliest prior snapshot with the same `(page_id, content_hash)`. [`scrape.test.ts`]
- **Hash-different re-fetch:** `/api/describe-change` is called server-side to populate `change_description` / `change_classification` / `change_emoji`; response `newChange: true`. When the previous snapshot row has `markdown = NULL` (itself a hash-equal re-insert), the scrape route resolves the text via `(page_id, content_hash)` before calling describe-change. [`scrape.test.ts`]
- **Structured-data fact bag:** the scrape route also asks Firecrawl for `rawHtml` and runs `extractFacts` (see `lib/facts`) to pull a safelisted projection of JSON-LD + OpenGraph/Twitter meta into a flat `{ "Type.path": "value" }` bag. The bag is folded into the content hash via `sha256(markdown + "\n--\n" + factsBlob)` so 4.5 → 4.4 or 1217 → 1243 flips the hash even when rendered markdown rounds them away. The diff between the prev and new bags is passed to describeChange so the description can quote exact before→after values. Stored on the snapshot row as `facts jsonb`. [`scrape.test.ts`, `facts.test.ts`]
- **Screenshots** are downloaded from Firecrawl's CDN and uploaded to the `screenshots` Supabase Storage bucket; `snapshot.screenshot_url` is the public URL [`scrape.test.ts`]
- URL normalization (trailing slash, host casing) dedups across callers [`scrape.test.ts`]
- If `describe-change` throws, a fallback description is stored (`"Page content changed."`, classification `minor`) and the snapshot still inserts [`scrape.test.ts`]
- Client-side: reads response as text before JSON parsing; maps `FUNCTION_INVOCATION_TIMEOUT` (HTTP 504) and `FUNCTION_INVOCATION_FAILED` (HTTP 502) to readable error messages

---

## API — `/api/describe-change`

- `POST` with `{ oldValue, newValue, watchTarget, url }` returns `{ description, classification }` [`describe-change.test.ts`]
- Returns `400` when any required field is missing [`describe-change.test.ts`]
- Returns `500` when Claude throws [`describe-change.test.ts`]
- Strips markdown code fences from Claude's response before JSON parsing

---

## Hashing (`lib/hash`)

- `hashString` returns an 8-character hex string [`hash.test.ts`]
- Deterministic: same input → same output [`hash.test.ts`]
- Different inputs → different hashes [`hash.test.ts`]
- Handles empty string [`hash.test.ts`]
- Produces different hashes for similar inputs (collision resistance) [`hash.test.ts`]

---

## Share page (`/p/<pageId>`)

Public, read-only view of a page's screenshot + change history. No login required; UUIDs (122 bits) act as the access token. Data read via service role so the visitor doesn't need an RLS-granting watch row.

- `/p/<uuid>` renders the page label, source URL (linked), last-checked timestamp, current screenshot, and a clickable change-log rail. Clicking a rail entry swaps the displayed screenshot in place [untested — manual]
- `/p/<malformed>` returns 404 without hitting the DB (regex pre-validates) [untested — manual]
- `/p/<valid-but-unknown-uuid>` returns 404 after the page lookup misses [untested — manual]
- Page emits `<meta name="robots" content="noindex,nofollow">` to keep share URLs out of search engines
- Render is `force-dynamic` — no stale cache across snapshot updates
- **7-day history window:** only entries with `timestamp >= now − 7 days` render. The rail header says "last 7 days"; older entries collapse into a "N older entries hidden — Watch to see full history →" panel inside the rail. The full history remains accessible only via the visitor's own watch.
- **"Watch this →" CTA:** every share page renders a footer card linking to `/?watch=<encoded-url>`. The empty-state (no recent entries) also surfaces the same CTA. Clicking it lands the visitor on the home view with the URL pre-filled in the Hero input; the `?watch=` param is stripped from the URL bar on arrival.

---

## Nav

- Displays the "WatchThat" brand name [`Nav.test.tsx`]
- "How it works" link points to `#how` (home view only) [`Nav.test.tsx`]
- "Pricing" link points to `#pricing` (home view only) [`Nav.test.tsx`]
- "Developers" link points to `/developers` (always visible on home view) [`Nav.test.tsx`]
- "My Watch List" tab hidden until first site is added [`Nav.test.tsx`]
- "My Watch List" tab switches to watchlist view; anchor links shown grayed out on watchlist view [`Nav.test.tsx`]
- Clicking the logo/brand switches back to home view [`Nav.test.tsx`]

---

## DogLogo

- Renders an SVG element [`DogLogo.test.tsx`]
- `size` prop sets `width` and `height`; defaults to `40` [`DogLogo.test.tsx`]
- `alert` prop shows tail-wag path; omitting it hides the path [`DogLogo.test.tsx`]

---

## HowItWorks

- Renders the section heading [`HowItWorks.test.tsx`]
- Renders step titles for all three steps [`HowItWorks.test.tsx`]
- Renders step numbers 1, 2, 3 [`HowItWorks.test.tsx`]
- Section has `id="how"` for anchor navigation [`HowItWorks.test.tsx`]

---

## Developers page (`/developers`)

- Dedicated route pitching WatchThat as an agentic platform to developers and investors [`DevelopersPage.test.tsx`]
- `<h1>` elevator-pitch headline frames WatchThat as an agentic platform that "remembers the web" [`DevelopersPage.test.tsx`]
- Hero copy positions smart web monitoring as the first product and signals the platform is "built for more" [`DevelopersPage.test.tsx`]
- Renders three audience cards: "For developers", "For agent builders", "For investors" [`DevelopersPage.test.tsx`]
- Embeds the animated `PlatformDiagram` as the architecture visual [`DevelopersPage.test.tsx`]
- Primary contact CTA is a `mailto:hello@watchthat.app` link [`DevelopersPage.test.tsx`]
- Includes a link back to the consumer app ("See the consumer app") [`DevelopersPage.test.tsx`]

---

## PlatformDiagram

- Renders three tier labels: "Ingest", "Platform", "Subscribe" [`PlatformDiagram.test.tsx`]
- Ingest tier lists web crawlers, REST & GraphQL, and MCP servers [`PlatformDiagram.test.tsx`]
- Platform tier lists Agents, Memory, and Intelligence — the agentic framing; Agents are described as watching "like humans do" [`PlatformDiagram.test.tsx`]
- Subscribe tier lists REST API, MCP tool, and Feed & email [`PlatformDiagram.test.tsx`]
- Root element has `role="img"` with an accessible label describing the architecture for screen readers [`PlatformDiagram.test.tsx`]
- Horizontal flow connectors animate dots between tiers via CSS keyframes (visual only; untested)

---

## Pricing

- Renders Free, Pro, and Enterprise plan names [`Pricing.test.tsx`]
- Section has `id="pricing"` for anchor navigation [`Pricing.test.tsx`]
- Pro plan marked as "Most popular" [`Pricing.test.tsx`]
- Free tier: 2 websites, 5 refreshes/day
- Pro tier: 1,000 websites, hourly refresh, stealth mode, CAPTCHA solving
- Enterprise: unlimited websites, custom intervals, advanced stealth, residential proxies, CAPTCHA solving

---

## Observability (Sentry)

- `@sentry/nextjs` is initialised across all three runtimes via `instrumentation-client.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts`; `instrumentation.ts` dispatches by `NEXT_RUNTIME` and exports `onRequestError = Sentry.captureRequestError` so unhandled server request errors are reported automatically [untested]
- `app/global-error.tsx` reports root-layout / render errors via `Sentry.captureException` [untested]
- `next.config.ts` is wrapped with `withSentryConfig` (source-map upload, widened client upload, automatic Vercel cron monitors). Client events go directly to Sentry ingestion — no tunnel route [untested]
- Session Replay is enabled on the client (10% of sessions, 100% of error sessions) [untested]
- **Profiling** — `sentry.server.config.ts` wires `nodeProfilingIntegration` with `profileSessionSampleRate: 1.0` and `profileLifecycle: "trace"` (profiles attach to active spans). Browser profiling is enabled via `browserProfilingIntegration` + `profileSessionSampleRate: 1.0`; `next.config.ts` sets `Document-Policy: js-profiling` header on every response so the browser's self-profiler can start. Edge runtime is not profiled (native bindings unavailable). [untested]
- AI Monitoring: Anthropic clients in `lib/describe-change.ts` and `app/api/analyze/route.ts` are wrapped with `Sentry.instrumentAnthropicAiClient({ recordInputs: true, recordOutputs: true })`, producing `gen_ai.*` spans with prompts, responses, and token counts in Sentry traces [untested]
- Source maps upload on production builds when `SENTRY_AUTH_TOKEN` is set (locally via `.env.sentry-build-plugin`, which is gitignored)

---

## Footer

- Renders a `<footer>` element [`Footer.test.tsx`]
- Renders the tagline [`Footer.test.tsx`]
- Renders a "Good-bot disclaimer" small-print paragraph explaining low-frequency crawling and respect for copyright [`Footer.test.tsx`]
