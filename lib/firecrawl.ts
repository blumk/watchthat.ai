import FirecrawlApp from "@mendable/firecrawl-js";
import * as Sentry from "@sentry/nextjs";

export interface FirecrawlResult {
  markdown: string;
  rawHtml: string;
  screenshot: string | null;
}

const SCRAPE_TIMEOUT_MS = 300_000;

// Single seam between the app and Firecrawl. Lives here (not inlined in the
// API route) so e2e tests can branch on E2E_MOCK=1 and return deterministic
// fixtures without paying for real scrape calls — see e2e/fixtures.
//
// Safety: prod must NEVER set E2E_MOCK. We surface that as a Sentry warning
// rather than silently returning fixture data on prod.
export async function runFirecrawl(url: string): Promise<FirecrawlResult> {
  if (process.env.E2E_MOCK === "1") {
    if (process.env.VERCEL_ENV === "production") {
      Sentry.captureMessage(
        "E2E_MOCK=1 observed in production — refusing to mock Firecrawl",
        "error",
      );
    } else {
      return mockFirecrawl(url);
    }
  }

  const firecrawl = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY ?? "",
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), SCRAPE_TIMEOUT_MS);
    id.unref();
  });
  const result = await Promise.race([
    // `rawHtml` preserves <script type="application/ld+json"> blocks (cleaned
    // `html` sometimes strips them); extractFacts needs them.
    firecrawl.scrape(url, {
      formats: ["markdown", "rawHtml"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: [{ type: "screenshot" as const, fullPage: true }] as any,
    }),
    timeoutPromise,
  ]);
  const actions = result.actions as { screenshots?: string[] } | undefined;
  const r = result as { markdown?: string; rawHtml?: string };
  return {
    markdown: r.markdown ?? "",
    rawHtml: r.rawHtml ?? "",
    screenshot: actions?.screenshots?.[0] ?? null,
  };
}

export const FIRECRAWL_TIMEOUT_MS = SCRAPE_TIMEOUT_MS;

// Deterministic fixture data for E2E_MOCK=1. The variant is encoded in the URL
// — most preview tests scrape `/api/test-fixture/<variant>`, so we read the
// last path segment. Falls back to an "initial" baseline.
function mockFirecrawl(url: string): FirecrawlResult {
  const variant = extractVariant(url);
  const fixture = FIXTURES[variant] ?? FIXTURES.initial;
  return fixture;
}

function extractVariant(url: string): string {
  try {
    const parsed = new URL(url);
    const match = /\/api\/test-fixture\/([^/?#]+)/.exec(parsed.pathname);
    if (match) return match[1];
  } catch {
    // fallthrough
  }
  return "initial";
}

const SAMPLE_SCREENSHOT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const FIXTURES: Record<string, FirecrawlResult> = {
  initial: {
    markdown: "# Sample Product\n\nPrice: $42\n\nRating: 4.5 (1217 reviews)",
    rawHtml:
      '<!doctype html><html><head><title>Sample Product</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Sample Product","offers":{"@type":"Offer","price":"42.00"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.5","reviewCount":"1217"}}</script></head><body><h1>Sample Product</h1><p>Price: $42</p><p>Rating: 4.5 (1217 reviews)</p></body></html>',
    screenshot: SAMPLE_SCREENSHOT_PNG,
  },
  "price-change": {
    markdown: "# Sample Product\n\nPrice: $48\n\nRating: 4.5 (1217 reviews)",
    rawHtml:
      '<!doctype html><html><head><title>Sample Product</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Sample Product","offers":{"@type":"Offer","price":"48.00"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.5","reviewCount":"1217"}}</script></head><body><h1>Sample Product</h1><p>Price: $48</p><p>Rating: 4.5 (1217 reviews)</p></body></html>',
    screenshot: SAMPLE_SCREENSHOT_PNG,
  },
  "rating-change": {
    markdown: "# Sample Product\n\nPrice: $42\n\nRating: 4.2 (1243 reviews)",
    rawHtml:
      '<!doctype html><html><head><title>Sample Product</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Sample Product","offers":{"@type":"Offer","price":"42.00"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.2","reviewCount":"1243"}}</script></head><body><h1>Sample Product</h1><p>Price: $42</p><p>Rating: 4.2 (1243 reviews)</p></body></html>',
    screenshot: SAMPLE_SCREENSHOT_PNG,
  },
  "prod-canary": {
    markdown: "# Watchthat Prod Canary\n\nThis page is byte-stable for prod smoke tests.",
    rawHtml:
      "<!doctype html><html><head><title>Prod Canary</title></head><body><h1>Watchthat Prod Canary</h1><p>This page is byte-stable for prod smoke tests.</p></body></html>",
    screenshot: SAMPLE_SCREENSHOT_PNG,
  },
};
