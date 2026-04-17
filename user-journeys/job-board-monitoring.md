# Job board monitoring

## Persona

A person interested in working at Company A who checks their careers page
every morning for new postings.

## Today, without WatchThat

- Opens the company's careers portal manually each morning.
- Career portals rarely offer deep links — the user has to re-apply filters
  (location, team, level) and re-sort by timestamp on every visit.
- Easy to miss a posting that goes up mid-day, or to give up after a few quiet
  weeks.

## With WatchThat (today)

- User pastes the careers page URL once.
- WatchThat takes a snapshot and polls for changes.
- When a posting appears, WatchThat generates a plain-English description of
  the change (e.g. "A new Senior Backend Engineer role was added.") and
  classifies it as major/minor.
- User gets the change entry in their watch list without opening the portal.

## Future

- **V1.2 — Browser push notifications:** user is alerted the moment a new
  posting appears, no polling by hand.
- **V2.0 — Email/webhook alerts + automated server-side polling:** works even
  when the user's browser isn't open.
- **V2.1 — CSS selector targeting:** watch only the job list region, ignoring
  marketing copy or cookie banners.
- **V3.0+ — UI interaction / API payload monitoring:** navigate portals that
  require filter selection or sorting before the real content is visible;
  watch the underlying API response instead of the rendered page when the
  company's site has one.
