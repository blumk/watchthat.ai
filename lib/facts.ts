// Extracts a "fact bag" of structured data from raw HTML — a deterministic
// projection of JSON-LD (schema.org) + OpenGraph/Twitter meta that we treat
// as the stable signal for change detection.
//
// Rendered markdown frequently rounds ("1.2k ratings"), abbreviates, or
// omits the precise numbers users actually care about. JSON-LD on the same
// page typically carries the exact values. Folding a canonical projection
// of those values into the content hash lets us catch 4.5 → 4.4 or
// 1217 → 1243 changes that never touch the markdown.
//
// Extraction rules:
// - JSON-LD: all `<script type="application/ld+json">` blocks. Unwrap
//   `@graph` arrays. For each entity, walk keys and emit dot-path values
//   that match the structured-data safelist. Key is `${@type}.${path}` so
//   "MobileApplication.aggregateRating.ratingValue" doesn't collide with
//   "Product.aggregateRating.ratingValue" on the same page.
// - Meta: only safelisted og:*/twitter:* properties.
//
// The safelist is the load-bearing piece — without it, sites with fresh
// timestamps / randomized IDs in their structured data would produce
// spurious hash changes. Expand the safelist as real sites demand it.

export type FactBag = Record<string, string>;

// Schema.org paths we treat as meaningful + stable. Relative to each JSON-LD
// entity (after stripping @type / @context / @id wrappers).
const STRUCTURED_SAFELIST = new Set<string>([
  "name",
  "headline",
  "description",
  "image",
  "author.name",
  "publisher.name",
  "datePublished",
  "aggregateRating.ratingValue",
  "aggregateRating.reviewCount",
  "aggregateRating.ratingCount",
  "aggregateRating.bestRating",
  "aggregateRating.worstRating",
  "offers.price",
  "offers.priceCurrency",
  "offers.availability",
  "offers.lowPrice",
  "offers.highPrice",
  "offers.priceValidUntil",
  "interactionStatistic.userInteractionCount",
]);

const META_SAFELIST = new Set<string>([
  "og:title",
  "og:description",
  "og:image",
  "og:price:amount",
  "og:price:currency",
  "og:availability",
  "product:price:amount",
  "product:price:currency",
  "product:availability",
  "twitter:title",
  "twitter:description",
]);

export function extractFacts(html: string): FactBag {
  if (!html) return {};
  const bag: FactBag = {};
  collectJsonLd(html, bag);
  collectMeta(html, bag);
  return canonicalize(bag);
}

// Diff two fact bags into an ordered list of (key, before, after) tuples.
// Keys are the union, sorted; absent-on-one-side values render as
// `undefined`. Stable ordering matters — it feeds the describeChange prompt.
export interface FactChange {
  key: string;
  before?: string;
  after?: string;
}
export function diffFacts(before: FactBag, after: FactBag): FactChange[] {
  const changes: FactChange[] = [];
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  for (const k of Array.from(keys).sort()) {
    if (before[k] === after[k]) continue;
    const change: FactChange = { key: k };
    if (before[k] !== undefined) change.before = before[k];
    if (after[k] !== undefined) change.after = after[k];
    changes.push(change);
  }
  return changes;
}

// Stable string representation — plugs into the sha256 over
// `markdown + "\n--\n" + factsBlob(facts)`.
export function factsBlob(facts: FactBag): string {
  return Object.keys(facts)
    .sort()
    .map((k) => `${k}=${facts[k]}`)
    .join("\n");
}

// ── internals ────────────────────────────────────────────────────────────

function canonicalize(bag: FactBag): FactBag {
  const out: FactBag = {};
  for (const key of Object.keys(bag).sort()) {
    const raw = bag[key];
    if (raw === undefined || raw === null) continue;
    const normalized = String(raw).trim().replace(/\s+/g, " ");
    if (normalized === "") continue;
    out[key] = normalized;
  }
  return out;
}

function collectJsonLd(html: string, bag: FactBag) {
  // Capture content of every <script type="application/ld+json">...</script>.
  // Tolerant of attribute order and single / double quotes.
  const re = /<script\b([^>]*?)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1];
    const body = match[2];
    if (!/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) continue;
    const trimmed = body.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Malformed block — ignore, keep going.
      continue;
    }
    for (const item of unwrapGraph(parsed)) {
      foldJsonLdItem(item, bag);
    }
  }
}

function unwrapGraph(node: unknown): unknown[] {
  if (Array.isArray(node)) return node.flatMap(unwrapGraph);
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) {
      return obj["@graph"].flatMap(unwrapGraph);
    }
    return [node];
  }
  return [];
}

function foldJsonLdItem(item: unknown, bag: FactBag) {
  if (!item || typeof item !== "object") return;
  const obj = item as Record<string, unknown>;
  const type = typeOf(obj);
  walk(obj, "", type, bag);
}

function typeOf(obj: Record<string, unknown>): string | null {
  const t = obj["@type"];
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    const first = t.find((x) => typeof x === "string");
    if (typeof first === "string") return first;
  }
  return null;
}

function walk(node: unknown, path: string, type: string | null, bag: FactBag) {
  if (node === null || node === undefined) return;
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    if (STRUCTURED_SAFELIST.has(path)) {
      const key = type ? `${type}.${path}` : path;
      // Don't clobber a prior non-empty fact with an empty/whitespace value.
      const normalized = String(node).trim();
      if (normalized !== "") bag[key] = normalized;
    }
    return;
  }
  if (Array.isArray(node)) {
    // Arrays in JSON-LD commonly mean multiple offers / images / ratings.
    // For our needs (stable, precise signal), the first entry is representative.
    if (node.length > 0) walk(node[0], path, type, bag);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    // Descend into the object's own @type if it has one (e.g. nested Offer
    // with its own @type="Offer"), but only for the purposes of reading
    // `offers.price` etc. We keep the outer type as the key prefix so the
    // bag stays keyed by the parent entity.
    for (const k of Object.keys(obj)) {
      if (k.startsWith("@")) continue;
      const sub = path ? `${path}.${k}` : k;
      walk(obj[k], sub, type, bag);
    }
  }
}

function collectMeta(html: string, bag: FactBag) {
  const tagRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[0];
    const keyMatch = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag);
    const valMatch = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!keyMatch || !valMatch) continue;
    const key = keyMatch[1];
    if (!META_SAFELIST.has(key)) continue;
    const val = decodeHtmlEntities(valMatch[1]);
    if (val.trim() === "") continue;
    bag[`meta.${key}`] = val;
  }
}

function decodeHtmlEntities(s: string): string {
  // Small, targeted decoder — covers the entities that show up in meta
  // content attributes in the wild. Full HTML entity coverage would need a
  // real parser; this is good enough for fact-bag comparison.
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}
