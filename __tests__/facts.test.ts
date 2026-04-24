import { extractFacts, diffFacts, factsBlob } from "@/lib/facts";

describe("extractFacts — JSON-LD", () => {
  it("pulls name + aggregateRating from a MobileApplication entity (the Apple App Store shape)", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "MobileApplication",
        "name": "Lingo by Abbott",
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.5",
          "reviewCount": "1217"
        }
      }
      </script>
      </head></html>
    `;
    const facts = extractFacts(html);
    expect(facts["MobileApplication.name"]).toBe("Lingo by Abbott");
    expect(facts["MobileApplication.aggregateRating.ratingValue"]).toBe("4.5");
    expect(facts["MobileApplication.aggregateRating.reviewCount"]).toBe("1217");
  });

  it("unwraps @graph arrays and keys each entity by its @type", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Product", "name": "Widget", "offers": { "price": "9.99", "priceCurrency": "USD" } },
          { "@type": "Organization", "name": "Acme" }
        ]
      }
      </script>
    `;
    const facts = extractFacts(html);
    expect(facts["Product.name"]).toBe("Widget");
    expect(facts["Product.offers.price"]).toBe("9.99");
    expect(facts["Organization.name"]).toBe("Acme");
  });

  it("handles top-level arrays of JSON-LD objects", () => {
    const html = `
      <script type="application/ld+json">
      [
        { "@type": "Article", "headline": "Big news", "datePublished": "2026-04-22" },
        { "@type": "Person", "name": "Ignored because name is safelisted" }
      ]
      </script>
    `;
    const facts = extractFacts(html);
    expect(facts["Article.headline"]).toBe("Big news");
    expect(facts["Article.datePublished"]).toBe("2026-04-22");
    expect(facts["Person.name"]).toBe("Ignored because name is safelisted");
  });

  it("picks the first entry when offers is an array", () => {
    const html = `
      <script type="application/ld+json">
      { "@type": "Product", "offers": [
        { "price": "99", "priceCurrency": "USD" },
        { "price": "89", "priceCurrency": "EUR" }
      ] }
      </script>
    `;
    expect(extractFacts(html)["Product.offers.price"]).toBe("99");
  });

  it("ignores paths not on the safelist (prevents timestamp/nonce pollution)", () => {
    const html = `
      <script type="application/ld+json">
      { "@type": "Product", "name": "X", "sku": "abc", "mpn": "mpn-1", "nonce": "random-123" }
      </script>
    `;
    const facts = extractFacts(html);
    expect(facts["Product.name"]).toBe("X");
    expect(facts["Product.sku"]).toBeUndefined();
    expect(facts["Product.mpn"]).toBeUndefined();
    expect(facts["Product.nonce"]).toBeUndefined();
  });

  it("doesn't throw on malformed JSON-LD", () => {
    const html = `
      <script type="application/ld+json">{ this isn't valid json </script>
      <script type="application/ld+json">{ "@type": "Thing", "name": "Valid" }</script>
    `;
    const facts = extractFacts(html);
    expect(facts["Thing.name"]).toBe("Valid");
  });

  it("normalizes numbers and strings identically (so 4.5 hashes the same as \"4.5\")", () => {
    const num = extractFacts(
      '<script type="application/ld+json">{"@type":"Product","aggregateRating":{"ratingValue":4.5}}</script>',
    );
    const str = extractFacts(
      '<script type="application/ld+json">{"@type":"Product","aggregateRating":{"ratingValue":"4.5"}}</script>',
    );
    expect(num["Product.aggregateRating.ratingValue"]).toBe("4.5");
    expect(str["Product.aggregateRating.ratingValue"]).toBe("4.5");
  });

  it("resolves @type arrays to the first string type", () => {
    const html = `
      <script type="application/ld+json">
      { "@type": ["Product", "Offer"], "name": "Composite" }
      </script>
    `;
    expect(extractFacts(html)["Product.name"]).toBe("Composite");
  });
});

describe("extractFacts — meta tags", () => {
  it("reads safelisted og:* and twitter:* properties regardless of attribute order", () => {
    const html = `
      <meta property="og:title" content="Hello world">
      <meta content="A description here" name="twitter:description">
      <meta property="og:price:amount" content="19.99">
    `;
    const facts = extractFacts(html);
    expect(facts["meta.og:title"]).toBe("Hello world");
    expect(facts["meta.twitter:description"]).toBe("A description here");
    expect(facts["meta.og:price:amount"]).toBe("19.99");
  });

  it("decodes common HTML entities in meta content", () => {
    const html = `<meta property="og:title" content="Tom &amp; Jerry &#39;the movie&#39;">`;
    expect(extractFacts(html)["meta.og:title"]).toBe("Tom & Jerry 'the movie'");
  });

  it("ignores meta properties not on the safelist", () => {
    const html = `<meta name="viewport" content="width=device-width">`;
    expect(extractFacts(html)["meta.viewport"]).toBeUndefined();
  });
});

describe("diffFacts + factsBlob", () => {
  it("returns nothing for identical fact bags", () => {
    expect(diffFacts({ a: "1" }, { a: "1" })).toEqual([]);
  });

  it("captures added, removed, and changed keys in sorted order", () => {
    const before = { "Product.aggregateRating.ratingValue": "4.5", removed: "x" };
    const after = { "Product.aggregateRating.ratingValue": "4.4", added: "y" };
    expect(diffFacts(before, after)).toEqual([
      { key: "Product.aggregateRating.ratingValue", before: "4.5", after: "4.4" },
      { key: "added", after: "y" },
      { key: "removed", before: "x" },
    ]);
  });

  it("factsBlob is stable under insertion order so the hash is deterministic", () => {
    const a = factsBlob({ b: "2", a: "1" });
    const b = factsBlob({ a: "1", b: "2" });
    expect(a).toBe(b);
    expect(a).toBe("a=1\nb=2");
  });
});
