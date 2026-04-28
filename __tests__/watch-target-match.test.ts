import { matchTargetToFact, valueForKey } from "@/lib/watch-target-match";
import type { FactBag } from "@/lib/facts";

const APP_BAG: FactBag = {
  "MobileApplication.name": "Lingo by Abbott",
  "MobileApplication.aggregateRating.ratingValue": "4.5",
  "MobileApplication.aggregateRating.reviewCount": "1217",
};

const PRODUCT_BAG: FactBag = {
  "Product.name": "Widget",
  "Product.offers.price": "99",
  "Product.offers.priceCurrency": "USD",
  "Product.offers.availability": "https://schema.org/InStock",
};

describe("matchTargetToFact", () => {
  it("resolves 'app rating' to the MobileApplication ratingValue", () => {
    const m = matchTargetToFact("app rating", APP_BAG);
    expect(m).toEqual({
      key: "MobileApplication.aggregateRating.ratingValue",
      value: "4.5",
      displayName: "Rating",
    });
  });

  it("resolves short targets via synonyms", () => {
    expect(matchTargetToFact("rating", APP_BAG)?.value).toBe("4.5");
    expect(matchTargetToFact("stars", APP_BAG)?.value).toBe("4.5");
    expect(matchTargetToFact("score", APP_BAG)?.value).toBe("4.5");
    expect(matchTargetToFact("reviews", APP_BAG)?.value).toBe("1217");
    expect(matchTargetToFact("review count", APP_BAG)?.value).toBe("1217");
  });

  it("resolves 'price' to offers.price with a human display name", () => {
    const m = matchTargetToFact("price", PRODUCT_BAG);
    expect(m?.key).toBe("Product.offers.price");
    expect(m?.value).toBe("99");
    expect(m?.displayName).toBe("Price");
  });

  it("resolves 'availability' / 'stock' via synonyms", () => {
    expect(matchTargetToFact("availability", PRODUCT_BAG)?.key).toBe(
      "Product.offers.availability",
    );
    expect(matchTargetToFact("stock", PRODUCT_BAG)?.key).toBe(
      "Product.offers.availability",
    );
  });

  it("refuses to match when an unmatched non-trivial token would force a wrong answer", () => {
    // "CEO name" shouldn't quietly map to Product.name — "CEO" is meaningful
    // and has no fact-bag counterpart, so we'd rather return null.
    expect(matchTargetToFact("CEO name", PRODUCT_BAG)).toBeNull();
    // Same reasoning: "the monthly price of the Pro plan" has meaningful
    // tokens (monthly, Pro, plan) that offers.price doesn't expose, so the
    // match is rejected even though "price" alone would have resolved.
    expect(
      matchTargetToFact("the monthly price of the Pro plan", PRODUCT_BAG),
    ).toBeNull();
  });

  it("returns null when the target is empty or only soft-ignore words", () => {
    expect(matchTargetToFact("", APP_BAG)).toBeNull();
    expect(matchTargetToFact("   ", APP_BAG)).toBeNull();
    expect(matchTargetToFact("the latest value", APP_BAG)).toBeNull();
    expect(matchTargetToFact(null, APP_BAG)).toBeNull();
    expect(matchTargetToFact(undefined, APP_BAG)).toBeNull();
  });

  it("returns null when the fact bag is empty", () => {
    expect(matchTargetToFact("price", {})).toBeNull();
  });

  it("prefers more-specific matches when multiple keys match", () => {
    const bag: FactBag = {
      "Product.name": "Generic name",
      "Product.headline": "Generic headline",
    };
    // "headline" is more specific than "title" / "name" — it should win
    // via the synonym table.
    expect(matchTargetToFact("headline", bag)?.key).toBe("Product.headline");
  });

  it("derives sensible display names for meta keys", () => {
    const bag: FactBag = { "meta.og:title": "Hello" };
    expect(matchTargetToFact("title", bag)?.displayName).toBe("Title");
  });
});

describe("valueForKey", () => {
  it("pulls a value by exact key from a fact bag", () => {
    expect(
      valueForKey("MobileApplication.aggregateRating.ratingValue", APP_BAG),
    ).toBe("4.5");
  });
  it("returns undefined when the key is absent or the bag is null", () => {
    expect(valueForKey("missing.key", APP_BAG)).toBeUndefined();
    expect(valueForKey("whatever", null)).toBeUndefined();
    expect(valueForKey("whatever", undefined)).toBeUndefined();
  });
});
