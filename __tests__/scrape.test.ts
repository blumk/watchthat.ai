/**
 * @jest-environment node
 */
import FirecrawlApp from "@mendable/firecrawl-js";
import { makeFakeState, makeFakeClient, type FakeState } from "./helpers/supabase-mock";

jest.mock("@mendable/firecrawl-js");
jest.mock("@/lib/describe-change", () => ({
  describeChange: jest.fn(),
}));
jest.mock("@/utils/supabase/service", () => ({
  createServiceClient: jest.fn(),
}));

import { describeChange } from "@/lib/describe-change";
import { createServiceClient } from "@/utils/supabase/service";
import { POST } from "@/app/api/scrape/route";

const MockFirecrawlApp = FirecrawlApp as jest.MockedClass<typeof FirecrawlApp>;
const mockDescribeChange = describeChange as jest.MockedFunction<typeof describeChange>;
const mockCreateServiceClient = createServiceClient as jest.MockedFunction<
  typeof createServiceClient
>;

const FIRECRAWL_SHOT = "https://cdn.example.com/shot.png";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockFirecrawl(
  markdown: string,
  screenshot: string | null = FIRECRAWL_SHOT,
  rawHtml = "",
) {
  MockFirecrawlApp.mockImplementation(
    () =>
      ({
        scrape: jest.fn().mockResolvedValue({
          markdown,
          rawHtml,
          actions: screenshot ? { screenshots: [screenshot] } : undefined,
        }),
      }) as unknown as InstanceType<typeof FirecrawlApp>,
  );
}

let state: FakeState;
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  state = makeFakeState();
  mockCreateServiceClient.mockReturnValue(
    makeFakeClient(state) as unknown as ReturnType<typeof createServiceClient>,
  );
  mockDescribeChange.mockReset();
  mockDescribeChange.mockResolvedValue({
    description: "Pricing changed.",
    classification: "major",
    emoji: "💰",
  });
  // Screenshot download is fetched from Firecrawl's CDN — stub it.
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const u = typeof input === "string" ? input : input.toString();
    if (u.startsWith("http")) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
      } as unknown as Response;
    }
    throw new Error(`unmocked fetch: ${u}`);
  }) as unknown as typeof global.fetch;
  mockFirecrawl("# Hello world");
});

afterAll(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("POST /api/scrape", () => {
  it("returns 400 when url is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid URL", async () => {
    const res = await POST(makeRequest({ url: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-http protocol", async () => {
    const res = await POST(makeRequest({ url: "ftp://example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when Firecrawl throws", async () => {
    MockFirecrawlApp.mockImplementationOnce(
      () =>
        ({
          scrape: jest.fn().mockRejectedValue(new Error("scrape failed")),
        }) as unknown as InstanceType<typeof FirecrawlApp>,
    );
    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(500);
  });

  it("inserts a first snapshot with no change description and cached=false", async () => {
    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.snapshot).toMatchObject({
      markdown: "# Hello world",
      change_classification: "quiet",
      change_description: null,
    });
    expect(state.snapshots).toHaveLength(1);
    expect(state.pages).toHaveLength(1);
    expect(state.pages[0].latest_snapshot_id).toBe(body.snapshot.id);
    expect(mockDescribeChange).not.toHaveBeenCalled();
  });

  it("uploads screenshot to storage and exposes screenshot_url", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
    const res = await POST(makeRequest({ url: "https://example.com" }));
    const body = await res.json();
    expect(body.snapshot.screenshot_path).toBeTruthy();
    expect(body.snapshot.screenshot_url).toContain(
      "/storage/v1/object/public/screenshots/",
    );
    expect(state.storage).toHaveLength(1);
    expect(state.storage[0].bucket).toBe("screenshots");
  });

  it("returns cached snapshot without calling Firecrawl inside the dedup window", async () => {
    await POST(makeRequest({ url: "https://example.com" }));
    expect(state.snapshots).toHaveLength(1);
    const scrapeCalls = MockFirecrawlApp.mock.results.length;

    const res = await POST(makeRequest({ url: "https://example.com" }));
    const body = await res.json();
    expect(body.cached).toBe(true);
    // Firecrawl constructor should not have been instantiated again.
    expect(MockFirecrawlApp.mock.results.length).toBe(scrapeCalls);
    expect(state.snapshots).toHaveLength(1);
  });

  it("force=true bypasses the dedup window", async () => {
    await POST(makeRequest({ url: "https://example.com" }));
    expect(state.snapshots).toHaveLength(1);
    const before = MockFirecrawlApp.mock.results.length;

    const res = await POST(makeRequest({ url: "https://example.com", force: true }));
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(MockFirecrawlApp.mock.results.length).toBeGreaterThan(before);
  });

  it("hash-equal re-fetch still inserts a new snapshot (fresh screenshot) with quiet classification and no describeChange call", async () => {
    await POST(makeRequest({ url: "https://example.com" }));
    // Age past the 5-min dedup window.
    state.pages[0].last_fetched_at = new Date(Date.now() - 600_000).toISOString();
    const before = state.pages[0].last_fetched_at;

    const res = await POST(makeRequest({ url: "https://example.com" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.cached).toBe(false);
    expect(body.newChange).toBe(false);
    expect(state.snapshots).toHaveLength(2);
    expect(body.snapshot.change_classification).toBe("quiet");
    expect(body.snapshot.change_description).toBeNull();
    expect(body.snapshot.content_hash).toBe(state.snapshots[0].content_hash);
    // Hash-equal re-inserts store markdown=NULL to avoid byte-for-byte dupes.
    // The first snapshot still carries the actual text.
    expect(body.snapshot.markdown).toBeNull();
    expect(state.snapshots[0].markdown).toBe("# Hello world");
    expect(state.snapshots[1].markdown).toBeNull();
    expect(state.pages[0].last_fetched_at).not.toBe(before);
    expect(state.pages[0].latest_snapshot_id).toBe(body.snapshot.id);
    expect(mockDescribeChange).not.toHaveBeenCalled();
  });

  it("resolves prev.markdown from an earlier snapshot when the latest row has markdown=null", async () => {
    // First scrape: writes markdown.
    await POST(makeRequest({ url: "https://example.com" }));
    // Hash-equal re-fetch past dedup — writes markdown=null.
    state.pages[0].last_fetched_at = new Date(Date.now() - 600_000).toISOString();
    await POST(makeRequest({ url: "https://example.com" }));
    expect(state.snapshots[1].markdown).toBeNull();

    // Now the content actually changes. describeChange should receive the
    // resolved markdown from the original snapshot, not the null one.
    state.pages[0].last_fetched_at = new Date(Date.now() - 600_000).toISOString();
    mockFirecrawl("# Hello world — updated");
    await POST(makeRequest({ url: "https://example.com" }));

    expect(mockDescribeChange).toHaveBeenCalledTimes(1);
    expect(mockDescribeChange).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: "# Hello world",
        newValue: "# Hello world — updated",
      }),
    );
  });

  it("hash-different re-fetch inserts a new snapshot with change description", async () => {
    await POST(makeRequest({ url: "https://example.com" }));
    state.pages[0].last_fetched_at = new Date(Date.now() - 600_000).toISOString();
    mockFirecrawl("# Hello world — updated");

    const res = await POST(makeRequest({ url: "https://example.com" }));
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(state.snapshots).toHaveLength(2);
    expect(mockDescribeChange).toHaveBeenCalledTimes(1);
    expect(body.snapshot.change_description).toBe("Pricing changed.");
    expect(body.snapshot.change_classification).toBe("major");
    expect(body.snapshot.change_emoji).toBe("💰");
    expect(body.snapshot.prev_snapshot_id).toBe(state.snapshots[0].id);
    expect(state.pages[0].latest_snapshot_id).toBe(body.snapshot.id);
  });

  it("normalizes urls so different representations share a page row", async () => {
    await POST(makeRequest({ url: "https://example.com" }));
    await POST(makeRequest({ url: "HTTPS://EXAMPLE.COM/" }));
    expect(state.pages).toHaveLength(1);
  });

  it("flips the content hash on structured-data changes even when markdown is identical", async () => {
    const jsonLd = (rating: string, reviews: string) => `
      <script type="application/ld+json">
      {"@type":"MobileApplication","name":"Lingo","aggregateRating":{"ratingValue":"${rating}","reviewCount":"${reviews}"}}
      </script>`;
    // First scrape with rating 4.5 / 1217 reviews.
    mockFirecrawl("# Lingo — 1.2k ratings", FIRECRAWL_SHOT, jsonLd("4.5", "1217"));
    await POST(makeRequest({ url: "https://example.com" }));
    expect(state.snapshots[0].facts).toMatchObject({
      "MobileApplication.aggregateRating.ratingValue": "4.5",
      "MobileApplication.aggregateRating.reviewCount": "1217",
    });

    // Rating drops to 4.4, reviews grow — markdown still says "1.2k ratings".
    state.pages[0].last_fetched_at = new Date(Date.now() - 600_000).toISOString();
    mockFirecrawl("# Lingo — 1.2k ratings", FIRECRAWL_SHOT, jsonLd("4.4", "1243"));

    const res = await POST(makeRequest({ url: "https://example.com" }));
    const body = await res.json();
    expect(body.newChange).toBe(true);
    expect(body.snapshot.content_hash).not.toBe(state.snapshots[0].content_hash);
    expect(mockDescribeChange).toHaveBeenCalledTimes(1);
    // describeChange receives the structured diff so it can quote exact values.
    const arg = mockDescribeChange.mock.calls[0][0];
    expect(arg.factsDiff).toEqual(
      expect.arrayContaining([
        { key: "MobileApplication.aggregateRating.ratingValue", before: "4.5", after: "4.4" },
        { key: "MobileApplication.aggregateRating.reviewCount", before: "1217", after: "1243" },
      ]),
    );
  });

  it("falls back to a generic description if describeChange throws", async () => {
    mockDescribeChange.mockRejectedValueOnce(new Error("claude down"));
    await POST(makeRequest({ url: "https://example.com" }));
    state.pages[0].last_fetched_at = new Date(Date.now() - 600_000).toISOString();
    mockFirecrawl("# Updated");

    const res = await POST(makeRequest({ url: "https://example.com" }));
    const body = await res.json();
    expect(body.snapshot.change_description).toBe("Page content changed.");
    expect(body.snapshot.change_classification).toBe("minor");
  });
});
