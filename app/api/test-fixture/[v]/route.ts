import { NextResponse } from "next/server";

// Deterministic HTML pages e2e tests can point Watchdog at. Variants:
//   - initial         baseline
//   - price-change    same product, $42 → $48
//   - rating-change   same product, rating 4.5/1217 → 4.2/1243
//   - error           HTTP 500 (exercises the error history entry)
//   - prod-canary     byte-stable page used by the prod smoke test
//
// The same route ships in prod so the prod-canary smoke spec can scrape an
// app-owned URL without depending on any third-party host.

type Variant = "initial" | "price-change" | "rating-change" | "error" | "prod-canary";

const VARIANTS: Record<Exclude<Variant, "error">, { title: string; body: string }> = {
  initial: {
    title: "Sample Product",
    body: pageHtml({ name: "Sample Product", price: "42.00", rating: "4.5", reviews: "1217" }),
  },
  "price-change": {
    title: "Sample Product",
    body: pageHtml({ name: "Sample Product", price: "48.00", rating: "4.5", reviews: "1217" }),
  },
  "rating-change": {
    title: "Sample Product",
    body: pageHtml({ name: "Sample Product", price: "42.00", rating: "4.2", reviews: "1243" }),
  },
  "prod-canary": {
    title: "Watchthat Prod Canary",
    body:
      "<!doctype html><html><head><title>Watchthat Prod Canary</title>" +
      '<meta name="robots" content="noindex,nofollow"/>' +
      "</head><body><h1>Watchthat Prod Canary</h1>" +
      "<p>This page is byte-stable. Used by the prod smoke test.</p>" +
      "</body></html>",
  },
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ v: string }> },
): Promise<Response> {
  const { v } = await ctx.params;
  const variant = v as Variant;

  if (variant === "error") {
    return new Response("synthetic error fixture", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const page = VARIANTS[variant];
  if (!page) {
    return NextResponse.json(
      { error: `unknown fixture variant: ${variant}` },
      { status: 404 },
    );
  }
  return new Response(page.body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

interface PageInput {
  name: string;
  price: string;
  rating: string;
  reviews: string;
}

function pageHtml({ name, price, rating, reviews }: PageInput): string {
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    offers: { "@type": "Offer", price, priceCurrency: "USD" },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: rating,
      reviewCount: reviews,
    },
  });
  return (
    "<!doctype html><html><head>" +
    `<title>${name}</title>` +
    '<meta name="robots" content="noindex,nofollow"/>' +
    `<meta property="og:title" content="${name}"/>` +
    `<meta property="og:type" content="product"/>` +
    `<script type="application/ld+json">${jsonLd}</script>` +
    "</head><body>" +
    `<h1>${name}</h1>` +
    `<p>Price: $${Number(price).toFixed(0)}</p>` +
    `<p>Rating: ${rating} (${reviews} reviews)</p>` +
    "</body></html>"
  );
}
