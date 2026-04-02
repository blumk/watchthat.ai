# Requirements

Living specification of what Watchdog currently does. Updated whenever behaviour changes.
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
- "Try with hellolingo.com →" link shown when no sites are being watched
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
- Remove button shown at the bottom of the expanded preview panel for sites with content [`WatchedSites.test.tsx`]
- Remove button shown inline (in the hover action group) for error sites that have no content and therefore cannot expand [`WatchedSites.test.tsx`]
- Clicking Remove calls `onRemove` with the site ID [`WatchedSites.test.tsx`]

**Preview panel**
- Expand (▾) button shown only when the site has content (`lastContent`, `lastHtml`, or `lastScreenshot`) [`WatchedSites.test.tsx`]
- Expand button hidden when no content is available [`WatchedSites.test.tsx`]
- Clicking ▾ expands the panel; clicking ▴ collapses it [`WatchedSites.test.tsx`]
- Panel shows content tabs: Markdown, HTML, Raw HTML, Screenshot (only tabs with data shown)
- Expanding one card collapses all others (accordion)

**Watch target**
- Edit (✦) button always visible in hover group [`WatchedSites.test.tsx`]
- Clicking it reveals a text input for the watch target [`WatchedSites.test.tsx`]
- When `watchTarget` and `lastExtractedValue` are set, the extracted value is displayed on the card [`WatchedSites.test.tsx`]

**Change history log**
- All fetches (including quiet/no-change checks) are appended as `ChangeEntry` records
- All history entries rendered in a scrollable list [`WatchedSites.test.tsx`]
- Each entry shows: classification dot, description text, relative time, exact timestamp
- Description text wraps (not truncated)
- Clicking an entry selects it [`WatchedSites.test.tsx`]
- Initial snapshot logged as "Initial snapshot taken." with `quiet` classification [`WatchedSites.test.tsx`]
- Change entries show the Claude-generated description [`WatchedSites.test.tsx`]
- Selected entry's screenshot shown in a fixed panel to the right (no flicker)

**Fetch**
- Clicking ↻ calls `POST /api/scrape` and then calls `onUpdate` with the result [`WatchedSites.test.tsx`]
- First fetch stores a baseline and logs a quiet "Initial snapshot taken." entry
- Subsequent fetches with no change log a quiet "No changes detected." entry
- Subsequent fetches with a change call `/api/describe-change` and log a major/minor entry

---

## Storage (`lib/storage`)

- `getSites()` returns `[]` when the store is empty [`storage.test.ts`]
- `addSite(url)` persists a new site and returns it [`storage.test.ts`]
- `addSite` auto-prefixes `https://` when the protocol is missing [`storage.test.ts`]
- `addSite` sets `label` to the URL hostname [`storage.test.ts`]
- `addSite` initialises `lastHash`, `error` to `null`; `changed` to `false`; `history` to `[]` [`storage.test.ts`]
- `addSite` generates a unique ID for each call [`storage.test.ts`]
- `updateSite(id, patch)` merges patch into the existing record [`storage.test.ts`]
- `updateSite` with an unknown ID is a no-op [`storage.test.ts`]
- `removeSite(id)` deletes the record [`storage.test.ts`]
- `removeSite` with an unknown ID is a no-op [`storage.test.ts`]
- Large fields (`lastScreenshot`, `lastHtml`, `lastRawHtml`, `ChangeEntry.screenshot`) are stripped before writing — session-only
- Legacy `watchdog-sites-v1` localStorage data is migrated to IndexedDB on first open

---

## API — `/api/scrape`

- `POST` with `{ url }` returns `{ markdown, html, rawHtml, screenshot }` [`scrape.test.ts`]
- Returns `400` when `url` is missing [`scrape.test.ts`]
- Returns `400` for an invalid URL (non-parseable or non-http/https protocol) [`scrape.test.ts`]
- Returns `500` when Firecrawl throws [`scrape.test.ts`]
- Client-side: reads response as text before JSON parsing; maps `FUNCTION_INVOCATION_TIMEOUT` (HTTP 504) and `FUNCTION_INVOCATION_FAILED` (HTTP 502) to readable error messages

---

## API — `/api/extract`

- `POST` with `{ markdown, watchTarget }` returns `{ value }` [`extract.test.ts`]
- Returns `400` when `markdown` is missing [`extract.test.ts`]
- Returns `400` when `watchTarget` is missing [`extract.test.ts`]
- Returns `500` when Claude throws [`extract.test.ts`]

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

- Displays the "Watchdog" brand name [`Nav.test.tsx`]
- "Features" link points to `#features` [`Nav.test.tsx`]
- "How it works" link points to `#how` [`Nav.test.tsx`]

---

## DogLogo

- Renders an SVG element [`DogLogo.test.tsx`]
- `size` prop sets `width` and `height`; defaults to `40` [`DogLogo.test.tsx`]
- `alert` prop shows tail-wag path; omitting it hides the path [`DogLogo.test.tsx`]

---

## FeatureCards

- Renders four feature card titles [`FeatureCards.test.tsx`]
- Section has `id="features"` for anchor navigation [`FeatureCards.test.tsx`]

---

## HowItWorks

- Renders the section heading [`HowItWorks.test.tsx`]
- Renders step titles for all three steps [`HowItWorks.test.tsx`]
- Renders step numbers 1, 2, 3 [`HowItWorks.test.tsx`]
- Section has `id="how"` for anchor navigation [`HowItWorks.test.tsx`]

---

## Footer

- Renders a `<footer>` element [`Footer.test.tsx`]
- Renders the tagline [`Footer.test.tsx`]
