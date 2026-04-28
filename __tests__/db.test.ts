/** @jest-environment jsdom */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/utils/supabase/database.types";
import {
  _clearAll,
  _setSessionForTests,
  addSite,
  getSites,
  removeSite,
  updateSite,
} from "@/lib/db";
import {
  installFetchMock,
  makeFakeClient,
  makeFakeState,
} from "./helpers/supabase-mock";

let state = makeFakeState();
let restoreFetch: () => void = () => {};

beforeEach(() => {
  state = makeFakeState();
  const client = makeFakeClient(state) as unknown as SupabaseClient<Database>;
  _setSessionForTests({ client, user: state.user });
  restoreFetch = installFetchMock(state);
});

afterEach(() => {
  restoreFetch();
  _setSessionForTests(null);
});

describe("getSites", () => {
  it("returns an empty array when the user has no watches", async () => {
    expect(await getSites()).toEqual([]);
  });

  it("hydrates lastContent / lastHash / changed from the latest snapshot", async () => {
    const site = await addSite("https://example.com");
    // Simulate a /api/scrape run: insert a snapshot and point the page at it.
    const snap = {
      id: "snap-test-1",
      page_id: state.pages[0].id,
      fetched_at: new Date().toISOString(),
      content_hash: "abc123",
      markdown: "# Hello",
      screenshot_path: "example/shot.png",
      prev_snapshot_id: null,
      change_description: "Price dropped from $99 to $79.",
      change_classification: "major" as const,
      change_emoji: "💰",
    };
    state.snapshots.push(snap);
    state.pages[0].latest_snapshot_id = snap.id;

    const sites = await getSites();
    expect(sites).toHaveLength(1);
    expect(sites[0].id).toBe(site.id);
    expect(sites[0].lastContent).toBe("# Hello");
    expect(sites[0].lastHash).toBe("abc123");
    expect(sites[0].changeDescription).toBe("Price dropped from $99 to $79.");
    expect(sites[0].changed).toBe(true);
  });

  it("leaves ephemeral fields null when the page has no snapshot yet", async () => {
    await addSite("https://fresh.com");
    const sites = await getSites();
    expect(sites[0].lastContent).toBeNull();
    expect(sites[0].lastHash).toBeNull();
    expect(sites[0].changed).toBe(false);
  });

  it("resolves lastContent from an earlier snapshot when the latest snapshot's markdown is null", async () => {
    // Simulates a hash-equal re-fetch: original snapshot carries the
    // markdown, newer snapshot with the same content_hash has markdown=null.
    await addSite("https://example.com");
    const pageId = state.pages[0].id;
    const original = {
      id: "snap-a",
      page_id: pageId,
      fetched_at: new Date(Date.now() - 60_000).toISOString(),
      content_hash: "hash-same",
      markdown: "# Original text",
      screenshot_path: "example/a.png",
      prev_snapshot_id: null,
      change_description: null,
      change_classification: "quiet" as const,
      change_emoji: null,
    };
    const duplicate = {
      id: "snap-b",
      page_id: pageId,
      fetched_at: new Date().toISOString(),
      content_hash: "hash-same",
      markdown: null,
      screenshot_path: "example/b.png",
      prev_snapshot_id: "snap-a",
      change_description: null,
      change_classification: "quiet" as const,
      change_emoji: null,
    };
    state.snapshots.push(original, duplicate);
    state.pages[0].latest_snapshot_id = duplicate.id;

    const sites = await getSites();
    expect(sites[0].lastHash).toBe("hash-same");
    expect(sites[0].lastContent).toBe("# Original text");
  });

  it("resolves watchTarget against the latest snapshot's facts and annotates history deltas", async () => {
    await addSite("https://example.com");
    const watch = state.watches[0];
    // Set the watch target — simulates the user picking "App rating".
    watch.watch_target = "app rating";
    const pageId = state.pages[0].id;

    const snapA = {
      id: "snap-f-1",
      page_id: pageId,
      fetched_at: new Date(Date.now() - 180_000).toISOString(),
      content_hash: "hash-a",
      markdown: "# v1",
      screenshot_path: null,
      prev_snapshot_id: null,
      change_description: null,
      change_classification: "quiet" as const,
      change_emoji: null,
      facts: {
        "MobileApplication.aggregateRating.ratingValue": "4.5",
        "MobileApplication.aggregateRating.reviewCount": "1217",
      },
    };
    const snapB = {
      id: "snap-f-2",
      page_id: pageId,
      fetched_at: new Date(Date.now() - 60_000).toISOString(),
      content_hash: "hash-b",
      markdown: "# v2",
      screenshot_path: null,
      prev_snapshot_id: "snap-f-1",
      change_description: "Rating dropped.",
      change_classification: "major" as const,
      change_emoji: "📉",
      facts: {
        "MobileApplication.aggregateRating.ratingValue": "4.4",
        "MobileApplication.aggregateRating.reviewCount": "1243",
      },
    };
    state.snapshots.push(snapA, snapB);
    state.pages[0].latest_snapshot_id = snapB.id;

    const [site] = await getSites();
    // Badge: the matched key + current value lifted from the latest snapshot.
    expect(site.trackedFact).toEqual({
      key: "MobileApplication.aggregateRating.ratingValue",
      value: "4.4",
      displayName: "Rating",
    });
    // History: initial entry shows just the "after" value (no prior seen);
    // the later entry shows a before → after delta.
    expect(site.history[0].trackedDelta).toEqual({
      displayName: "Rating",
      before: undefined,
      after: "4.5",
    });
    expect(site.history[1].trackedDelta).toEqual({
      displayName: "Rating",
      before: "4.5",
      after: "4.4",
    });
  });

  it("leaves trackedFact null when the watch target doesn't resolve against the facts", async () => {
    await addSite("https://example.com");
    state.watches[0].watch_target = "CEO name"; // no fact-bag counterpart
    const pageId = state.pages[0].id;
    state.snapshots.push({
      id: "snap-no-match",
      page_id: pageId,
      fetched_at: new Date().toISOString(),
      content_hash: "h",
      markdown: "# x",
      screenshot_path: null,
      prev_snapshot_id: null,
      change_description: null,
      change_classification: "quiet" as const,
      change_emoji: null,
      facts: { "Product.name": "Widget" },
    });
    state.pages[0].latest_snapshot_id = "snap-no-match";

    const [site] = await getSites();
    expect(site.trackedFact).toBeNull();
    // History entries carry no trackedDelta either.
    expect(site.history.every((e) => e.trackedDelta === undefined)).toBe(true);
  });

  it("hydrates history from past snapshots with change descriptions", async () => {
    await addSite("https://example.com");
    const pageId = state.pages[0].id;
    const t0 = new Date(Date.now() - 120_000).toISOString();
    const t1 = new Date(Date.now() - 60_000).toISOString();
    const t2 = new Date(Date.now() - 30_000).toISOString();
    const snapA = {
      id: "snap-h-1",
      page_id: pageId,
      fetched_at: t0,
      content_hash: "hash-a",
      markdown: "# v1",
      screenshot_path: null,
      prev_snapshot_id: null,
      // First snapshot ever: no change description — should NOT produce history
      change_description: null,
      change_classification: "quiet" as const,
      change_emoji: null,
    };
    const snapB = {
      id: "snap-h-2",
      page_id: pageId,
      fetched_at: t1,
      content_hash: "hash-b",
      markdown: "# v2",
      screenshot_path: "example/b.png",
      prev_snapshot_id: "snap-h-1",
      change_description: "Price dropped.",
      change_classification: "major" as const,
      change_emoji: "💰",
    };
    const snapC = {
      id: "snap-h-3",
      page_id: pageId,
      fetched_at: t2,
      content_hash: "hash-c",
      markdown: "# v3",
      screenshot_path: "example/c.png",
      prev_snapshot_id: "snap-h-2",
      change_description: "Copy tweak.",
      change_classification: "minor" as const,
      change_emoji: "✏️",
    };
    const snapQuiet = {
      id: "snap-h-4",
      page_id: pageId,
      fetched_at: new Date().toISOString(),
      content_hash: "hash-c", // same as C — hash-equal re-scrape
      markdown: "# v3",
      screenshot_path: "example/d.png",
      prev_snapshot_id: "snap-h-3",
      change_description: null,
      change_classification: "quiet" as const,
      change_emoji: null,
    };
    state.snapshots.push(snapA, snapB, snapC, snapQuiet);
    state.pages[0].latest_snapshot_id = snapQuiet.id;

    const sites = await getSites();
    // Earliest snapshot surfaces as an "Initial snapshot taken." quiet entry,
    // followed by the two changed snapshots. Mid-sequence quiet snapshots
    // (snapQuiet / hash-equal re-fetch) stay excluded.
    expect(sites[0].history).toHaveLength(3);
    expect(sites[0].history[0]).toMatchObject({
      id: "snap-h-1",
      description: "Initial snapshot taken.",
      classification: "quiet",
    });
    expect(sites[0].history[1]).toMatchObject({
      id: "snap-h-2",
      description: "Price dropped.",
      classification: "major",
      emoji: "💰",
    });
    expect(sites[0].history[2]).toMatchObject({
      id: "snap-h-3",
      description: "Copy tweak.",
      classification: "minor",
    });
  });
});

describe("addSite", () => {
  it("adds a watch for the given URL", async () => {
    const site = await addSite("https://example.com");
    const sites = await getSites();
    expect(sites).toHaveLength(1);
    expect(sites[0].url).toBe("https://example.com/");
    expect(site.url).toBe("https://example.com/");
  });

  it("is idempotent for the same URL", async () => {
    const first = await addSite("https://example.com");
    const second = await addSite("https://example.com");
    expect(second.id).toBe(first.id);
    expect(await getSites()).toHaveLength(1);
  });

  it("auto-prefixes https:// when missing", async () => {
    const site = await addSite("example.com");
    expect(site.url).toBe("https://example.com/");
  });

  it("derives a label from the hostname when no meaningful path slug exists", async () => {
    const site = await addSite("https://news.ycombinator.com/newest");
    expect(site.label).toBe("news.ycombinator.com");
  });

  it("initializes ephemeral fields to empty defaults", async () => {
    const site = await addSite("https://example.com");
    expect(site.lastHash).toBeNull();
    expect(site.lastContent).toBeNull();
    expect(site.lastScreenshot).toBeNull();
    expect(site.error).toBeNull();
    expect(site.changed).toBe(false);
    expect(site.history).toEqual([]);
  });

  it("returns distinct ids for different URLs", async () => {
    const a = await addSite("https://a.com");
    const b = await addSite("https://b.com");
    expect(a.id).not.toBe(b.id);
  });
});

describe("updateSite", () => {
  it("persists watchTarget updates", async () => {
    const site = await addSite("https://example.com");
    await updateSite(site.id, { watchTarget: "price" });
    const sites = await getSites();
    expect(sites[0].watchTarget).toBe("price");
  });

  it("silently ignores fields that live only in React state", async () => {
    const site = await addSite("https://example.com");
    await updateSite(site.id, { lastHash: "deadbeef", lastContent: "x" });
    const sites = await getSites();
    expect(sites[0].lastHash).toBeNull();
    expect(sites[0].lastContent).toBeNull();
  });

  it("does nothing when the id is unknown", async () => {
    await addSite("https://example.com");
    await expect(
      updateSite("nonexistent", { watchTarget: "foo" }),
    ).resolves.toBeUndefined();
  });
});

describe("removeSite", () => {
  it("removes the watch with the given id", async () => {
    const first = await addSite("https://example.com");
    await addSite("https://other.com");
    await removeSite(first.id);
    const remaining = await getSites();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].url).toBe("https://other.com/");
  });

  it("does nothing if the id is unknown", async () => {
    await addSite("https://example.com");
    await removeSite("nonexistent");
    expect(await getSites()).toHaveLength(1);
  });
});

describe("_clearAll", () => {
  it("clears every watch for the current user", async () => {
    await addSite("https://a.com");
    await addSite("https://b.com");
    await _clearAll();
    expect(await getSites()).toHaveLength(0);
  });
});
