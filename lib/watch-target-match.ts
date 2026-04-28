// Best-effort resolver from a user's free-text watch target ("app rating",
// "price", "review count") to a concrete key in a fact bag extracted from
// structured data (see lib/facts).
//
// The fact bag keys look like:
//   MobileApplication.aggregateRating.ratingValue = "4.5"
//   MobileApplication.aggregateRating.reviewCount = "1217"
//   Product.offers.price                          = "99"
//   meta.og:title                                 = "…"
//
// The matcher tokenizes both sides (splitting on dots, camelCase, and
// non-alphanumeric chars), applies a small synonym table + soft-ignore of
// filler words, and requires *every non-trivial target token* to map
// somewhere on the key side. That's stricter than a plain score — it
// prevents "CEO name" from matching a generic "Product.name".
//
// When nothing matches, return null and the caller falls back to its
// existing behaviour (no badge, no delta annotation).

import type { FactBag } from "@/lib/facts";

export interface TargetMatch {
  key: string;
  value: string;
  displayName: string;
}

export function matchTargetToFact(
  target: string | null | undefined,
  facts: FactBag,
): TargetMatch | null {
  if (!target) return null;
  const targetTokens = tokens(target);
  if (targetTokens.length === 0) return null;
  // Drop soft-ignore words entirely — they carry no signal and shouldn't
  // count against matches either way.
  const meaningful = targetTokens.filter((t) => !SOFT_IGNORE.has(t));
  if (meaningful.length === 0) return null;

  let best: { key: string; score: number } | null = null;
  for (const key of Object.keys(facts)) {
    const score = scoreKey(meaningful, key);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { key, score };
  }
  if (!best) return null;
  return {
    key: best.key,
    value: facts[best.key],
    displayName: displayNameFor(best.key),
  };
}

// Resolve the same fact key against a different facts bag — used to pull
// historical values for delta annotations ("4.5 → 4.4"). Exact lookup; if
// the key isn't present in `facts`, returns undefined.
export function valueForKey(key: string, facts: FactBag | null | undefined): string | undefined {
  if (!facts) return undefined;
  return facts[key];
}

// ── internals ────────────────────────────────────────────────────────────

const SOFT_IGNORE = new Set([
  "the",
  "a",
  "an",
  "of",
  "on",
  "for",
  "in",
  "by",
  "with",
  "at",
  "to",
  "this",
  "that",
  "my",
  "our",
  "current",
  "latest",
  "value",
]);

// One-directional synonym table: if the user said <left>, any of <right>
// counts as a match on the key side. Keep entries short; expand as real
// sites prove which words matter.
const SYNONYMS: Record<string, string[]> = {
  rating: ["ratingvalue", "rating", "ratings", "stars", "score"],
  ratings: ["rating", "ratingvalue"],
  score: ["rating", "ratingvalue"],
  stars: ["rating", "ratingvalue"],
  review: ["reviews", "reviewcount", "ratingcount"],
  reviews: ["review", "reviewcount", "ratingcount"],
  price: ["price", "offers", "amount", "cost"],
  cost: ["price"],
  amount: ["price"],
  app: ["mobileapplication", "application", "softwareapplication"],
  availability: ["availability", "instock", "outofstock", "available"],
  stock: ["availability"],
  title: ["name", "title", "headline"],
  headline: ["headline", "title", "name"],
  description: ["description"],
  author: ["author"],
  publisher: ["publisher"],
  published: ["datepublished"],
  date: ["datepublished"],
};

const EXACT_BONUS = 2;
const SYNONYM_BONUS = 1.5;

function tokens(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → spaces
    .toLowerCase()
    .split(/[^a-z0-9]+/) // split on non-alphanumerics (dots, colons, dashes…)
    .filter(Boolean);
}

function scoreKey(meaningfulTargetTokens: string[], key: string): number {
  const keyTokens = tokens(key);
  let score = 0;
  for (const t of meaningfulTargetTokens) {
    if (keyTokens.includes(t)) {
      score += EXACT_BONUS;
      continue;
    }
    const syns = SYNONYMS[t];
    if (syns && syns.some((s) => keyTokens.includes(s))) {
      score += SYNONYM_BONUS;
      continue;
    }
    // An unmatched non-trivial target token is a veto — we'd rather return
    // no match than a wrong one. "CEO name" should NOT resolve to Product.name.
    return 0;
  }
  return score;
}

// Prettify a fact-bag key into a short human label. Strips the `@type` /
// `meta.` prefix and applies a small suffix → label map for the handful of
// fields users actually watch. Unknown suffixes get a best-effort title-case.
const SUFFIX_LABELS: Array<[string, string]> = [
  ["aggregateRating.ratingValue", "Rating"],
  ["aggregateRating.reviewCount", "Reviews"],
  ["aggregateRating.ratingCount", "Ratings"],
  ["aggregateRating.bestRating", "Best rating"],
  ["aggregateRating.worstRating", "Worst rating"],
  ["offers.price", "Price"],
  ["offers.priceCurrency", "Currency"],
  ["offers.availability", "Availability"],
  ["offers.lowPrice", "Low price"],
  ["offers.highPrice", "High price"],
  ["interactionStatistic.userInteractionCount", "Interactions"],
  ["datePublished", "Published"],
  ["headline", "Headline"],
  ["name", "Name"],
  ["description", "Description"],
  ["image", "Image"],
];

function displayNameFor(key: string): string {
  // Strip a single leading type segment (e.g. "MobileApplication." or "meta.").
  const stripped = key.replace(/^[A-Za-z0-9_]+\./, "");
  for (const [suffix, label] of SUFFIX_LABELS) {
    if (stripped === suffix) return label;
  }
  // Meta keys: "meta.og:title" → "og:title" → "Title"
  if (/^og:|twitter:|product:/.test(stripped)) {
    const tail = stripped.split(":").pop() ?? stripped;
    return capitalize(tail);
  }
  // Fallback: last path segment, title-cased.
  const tail = stripped.split(".").pop() ?? stripped;
  return capitalize(tail.replace(/([a-z])([A-Z])/g, "$1 $2"));
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
