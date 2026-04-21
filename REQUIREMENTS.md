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
- Auto-focused on page load
- Pressing Enter submits the URL

**Watch button**
- Always visible; click submits the current input value [`Hero.test.tsx`]
- No-ops when input is empty

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

**Remove**
- "Remove website" link shown in the expanded footer [`WatchedSites.test.tsx`]
- Clicking it calls `onRemove` with the site ID [`WatchedSites.test.tsx`]

**Screenshot**
- Thumbnail shown in main row when `lastScreenshot` is present [`WatchedSites.test.tsx`]
- Clicking the thumbnail opens a full-screen modal [`WatchedSites.test.tsx`]
- Screenshot panel on the right of the history list also opens the modal on click

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
- Every fetch updates `lastChecked`; quiet fetches (first fetch, no change, cached) add no history entry
- When the server reports `newChange: true` with a major/minor classification, a history entry is appended using the snapshot's `change_description` [`WatchedSites.test.tsx`]
- Failed fetches log an `"error"` classified entry with the error message as description; the `error` field is also set on the site [`WatchedSites.test.tsx`]

---

## Storage (`lib/db`)

Supabase-backed. Each browser gets a Supabase anonymous session on first use;
per-user `watches` rows join shared `pages` rows via RLS. URL + label are
persisted; `getSites()` hydrates `lastContent` / `lastHash` / `lastScreenshot` /
`lastChecked` / `changeDescription` / `changed` from each page's `latest_snapshot_id`
when one exists. `history` is still React-state-only.

- `getSites()` returns `[]` when the current user has no watches [`db.test.ts`]
- `addSite(url)` creates a watch (and upserts the shared page) and returns it [`db.test.ts`]
- `addSite` with the same URL twice is idempotent — returns the same watch id [`db.test.ts`]
- `addSite` auto-prefixes `https://` when the protocol is missing [`db.test.ts`]
- `addSite` derives `label` from the hostname when the URL has no meaningful path slug [`db.test.ts`]
- `addSite` initialises ephemeral fields (`lastHash`, `lastContent`, `lastScreenshot`, `history`) to null/empty defaults [`db.test.ts`]
- `addSite` returns distinct ids for different URLs [`db.test.ts`]
- `getSites` hydrates `lastContent`, `lastHash`, `changeDescription`, `changed` from the page's latest snapshot when one exists [`db.test.ts`]
- `getSites` leaves ephemeral fields null when the page has no snapshot yet [`db.test.ts`]
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
- **60-second dedup:** if the page was fetched within the last 60s, returns the existing latest snapshot with `cached: true` and no Firecrawl call [`scrape.test.ts`]
- **`force: true`** bypasses the 60s dedup and triggers a fresh Firecrawl call [`scrape.test.ts`]
- **Hash-equal short-circuit:** when a new fetch's content hash matches the previous snapshot, no new snapshot row is inserted; `last_fetched_at` is bumped and the existing snapshot is returned with `newChange: false` [`scrape.test.ts`]
- **Hash-different:** a new snapshot row is inserted, `/api/describe-change` is called server-side to populate `change_description` / `change_classification` / `change_emoji`, and the response has `newChange: true` [`scrape.test.ts`]
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

## Nav

- Displays the "WatchThat" brand name [`Nav.test.tsx`]
- "How it works" link points to `#how` (home view only) [`Nav.test.tsx`]
- "Pricing" link points to `#pricing` (home view only) [`Nav.test.tsx`]
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

## Pricing

- Renders Free, Pro, and Enterprise plan names [`Pricing.test.tsx`]
- Section has `id="pricing"` for anchor navigation [`Pricing.test.tsx`]
- Pro plan marked as "Most popular" [`Pricing.test.tsx`]
- Free tier: 2 websites, 5 refreshes/day
- Pro tier: 1,000 websites, hourly refresh, stealth mode, CAPTCHA solving
- Enterprise: unlimited websites, custom intervals, advanced stealth, residential proxies, CAPTCHA solving

---

## Footer

- Renders a `<footer>` element [`Footer.test.tsx`]
- Renders the tagline [`Footer.test.tsx`]
