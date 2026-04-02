import { getSites, addSite, updateSite, removeSite, _clearAll } from "@/lib/storage";

beforeEach(async () => {
  await _clearAll();
});

describe("getSites", () => {
  it("returns an empty array when storage is empty", async () => {
    expect(await getSites()).toEqual([]);
  });
});

describe("addSite", () => {
  it("adds a site with the given URL", async () => {
    const site = await addSite("https://example.com");
    const sites = await getSites();
    expect(sites).toHaveLength(1);
    expect(sites[0].url).toBe("https://example.com");
    expect(site.url).toBe("https://example.com");
  });

  it("auto-prefixes https:// if missing", async () => {
    const site = await addSite("example.com");
    expect(site.url).toBe("https://example.com");
  });

  it("sets label to hostname", async () => {
    const site = await addSite("https://news.ycombinator.com/newest");
    expect(site.label).toBe("news.ycombinator.com");
  });

  it("initializes with null hash and no error", async () => {
    const site = await addSite("https://example.com");
    expect(site.lastHash).toBeNull();
    expect(site.error).toBeNull();
    expect(site.changed).toBe(false);
    expect(site.history).toEqual([]);
  });

  it("generates a unique id", async () => {
    const a = await addSite("https://a.com");
    const b = await addSite("https://b.com");
    expect(a.id).not.toBe(b.id);
  });
});

describe("updateSite", () => {
  it("updates only the specified fields", async () => {
    await addSite("https://example.com");
    const sites = await getSites();
    const id = sites[0].id;
    await updateSite(id, { lastHash: "deadbeef", lastChecked: 1000 });
    const updated = await getSites();
    expect(updated[0].lastHash).toBe("deadbeef");
    expect(updated[0].lastChecked).toBe(1000);
    expect(updated[0].url).toBe("https://example.com");
  });

  it("does nothing if id not found", async () => {
    await addSite("https://example.com");
    await updateSite("nonexistent", { lastHash: "deadbeef" });
    expect((await getSites())[0].lastHash).toBeNull();
  });
});

describe("removeSite", () => {
  it("removes the site with the given id", async () => {
    await addSite("https://example.com");
    await addSite("https://other.com");
    const id = (await getSites())[0].id;
    await removeSite(id);
    const remaining = await getSites();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].url).toBe("https://other.com");
  });

  it("does nothing if id not found", async () => {
    await addSite("https://example.com");
    await removeSite("nonexistent");
    expect(await getSites()).toHaveLength(1);
  });
});
