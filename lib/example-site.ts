import type { WatchedSite } from "@/lib/db";

// Placeholder snapshot for the "Try with news.ycombinator.com" demo. The UI
// only surfaces url / label / lastChecked / history / lastScreenshot, so we
// keep lastContent as a short stub — real content lands after the first fetch.
export const EXAMPLE_SITE: WatchedSite = {
  id: "example-hackernews",
  pageId: "example-hackernews-page",
  url: "https://news.ycombinator.com/",
  label: "news.ycombinator.com",
  lastChecked: 1745136000000,
  lastHash: "a1b2c3d4",
  lastContent: `# Hacker News

[new](https://news.ycombinator.com/newest) | [past](https://news.ycombinator.com/front) | [comments](https://news.ycombinator.com/newcomments) | [ask](https://news.ycombinator.com/ask) | [show](https://news.ycombinator.com/show) | [jobs](https://news.ycombinator.com/jobs) | [submit](https://news.ycombinator.com/submit)

A social news website focusing on computer science and entrepreneurship. Run by Y Combinator.

The top 30 story slots rotate as stories gain or lose points. Watching this page picks up front-page changes: new stories reaching the top, ranking shifts, and story removals.
`,
  lastHtml: null,
  lastRawHtml: null,
  lastScreenshot: null,
  changeDescription: null,
  changed: false,
  error: null,
  history: [
    {
      id: "example-hn-initial",
      timestamp: 1745136000000,
      description: "Initial snapshot taken.",
      classification: "quiet",
    },
  ],
  watchTarget: null,
  targetNotes: null,
  refreshInterval: null,
  nextDueAt: null,
  trackedFact: null,
  paused: false,
};
