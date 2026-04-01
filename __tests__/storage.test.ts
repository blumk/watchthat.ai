import { getSites, saveSites, addSite, updateSite, removeSite } from "@/lib/storage";
import type { WatchedSite } from "@/lib/storage";

const STORAGE_KEY = "watchdog-sites-v1";

beforeEach(() => {
  localStorage.clear();
});

describe("getSites", () => {
  it("returns an empty array when storage is empty", () => {
    expect(getSites()).toEqual([]);
  });

  it("returns parsed sites from storage", () => {
    const sites: WatchedSite[] = [
      {
        id: "abc123",
        url: "https://example.com",
        label: "example.com",
        lastChecked: null,
        lastHash: null,
        lastContent: null,
        changed: false,
        error: null,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
    expect(getSites()).toEqual(sites);
  });
});

describe("saveSites", () => {
  it("persists sites to localStorage", () => {
    const sites: WatchedSite[] = [
      {
        id: "abc123",
        url: "https://example.com",
        label: "example.com",
        lastChecked: null,
        lastHash: null,
        lastContent: null,
        changed: false,
        error: null,
      },
    ];
    saveSites(sites);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(sites);
  });
});

describe("addSite", () => {
  it("adds a site with the given URL", () => {
    const site = addSite("https://example.com");
    const sites = getSites();
    expect(sites).toHaveLength(1);
    expect(sites[0].url).toBe("https://example.com");
    expect(site.url).toBe("https://example.com");
  });

  it("auto-prefixes https:// if missing", () => {
    const site = addSite("example.com");
    expect(site.url).toBe("https://example.com");
  });

  it("sets label to hostname", () => {
    const site = addSite("https://news.ycombinator.com/newest");
    expect(site.label).toBe("news.ycombinator.com");
  });

  it("initializes with null hash and no error", () => {
    const site = addSite("https://example.com");
    expect(site.lastHash).toBeNull();
    expect(site.error).toBeNull();
    expect(site.changed).toBe(false);
  });

  it("generates a unique id", () => {
    const a = addSite("https://a.com");
    const b = addSite("https://b.com");
    expect(a.id).not.toBe(b.id);
  });
});

describe("updateSite", () => {
  it("updates only the specified fields", () => {
    addSite("https://example.com");
    const sites = getSites();
    const id = sites[0].id;
    updateSite(id, { lastHash: "deadbeef", lastChecked: 1000 });
    const updated = getSites();
    expect(updated[0].lastHash).toBe("deadbeef");
    expect(updated[0].lastChecked).toBe(1000);
    expect(updated[0].url).toBe("https://example.com");
  });

  it("does nothing if id not found", () => {
    addSite("https://example.com");
    updateSite("nonexistent", { lastHash: "deadbeef" });
    expect(getSites()[0].lastHash).toBeNull();
  });
});

describe("removeSite", () => {
  it("removes the site with the given id", () => {
    addSite("https://example.com");
    addSite("https://other.com");
    const id = getSites()[0].id;
    removeSite(id);
    const remaining = getSites();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].url).toBe("https://other.com");
  });

  it("does nothing if id not found", () => {
    addSite("https://example.com");
    removeSite("nonexistent");
    expect(getSites()).toHaveLength(1);
  });
});
