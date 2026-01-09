/**
 * @jest-environment node
 */
import { POST } from "@/app/api/scrape/route";
import FirecrawlApp from "@mendable/firecrawl-js";

jest.mock("@mendable/firecrawl-js");

const MockFirecrawlApp = FirecrawlApp as jest.MockedClass<typeof FirecrawlApp>;

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const MOCK_RESULT = {
  markdown: "# Hello\n\nSome page content.",
  html: "<h1>Hello</h1>",
  rawHtml: "<!DOCTYPE html><h1>Hello</h1>",
  screenshot: "https://cdn.example.com/shot.png",
};

beforeEach(() => {
  MockFirecrawlApp.mockImplementation(
    () =>
      ({
        scrape: jest.fn().mockResolvedValue(MOCK_RESULT),
      }) as unknown as InstanceType<typeof FirecrawlApp>
  );
});

describe("POST /api/scrape", () => {
  it("returns all formats for a valid URL", async () => {
    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.markdown).toBe(MOCK_RESULT.markdown);
    expect(body.html).toBe(MOCK_RESULT.html);
    expect(body.rawHtml).toBe(MOCK_RESULT.rawHtml);
    expect(body.screenshot).toBe(MOCK_RESULT.screenshot);
  });

  it("returns 400 when url is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid URL", async () => {
    const res = await POST(makeRequest({ url: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when Firecrawl throws", async () => {
    MockFirecrawlApp.mockImplementationOnce(
      () =>
        ({
          scrape: jest.fn().mockRejectedValue(new Error("scrape failed")),
        }) as unknown as InstanceType<typeof FirecrawlApp>
    );
    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(500);
  });
});
