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
