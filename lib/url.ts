// URL normalization + label extraction. Shared by lib/db.ts (client) and
// /api/watches (server), so callers agree on what "same URL" means.

const SKIP_SEGMENTS = new Set([
  "app", "apps", "store", "product", "products", "item", "items",
  "detail", "details", "page", "pages", "view", "show", "get",
  "us", "uk", "en", "fr", "de", "es", "it", "jp", "au", "ca",
  "www", "web", "m",
]);

const LOWERCASE_WORDS = new Set([
  "a", "an", "the", "and", "or", "but",
  "in", "on", "at", "to", "for", "of", "by", "with",
]);

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withProto);
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname !== "/" && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}

export function extractLabel(url: string): string {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/^www\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);

  let best = "";
  let bestScore = -1;
  for (const seg of segments) {
    if (/^\d+$/.test(seg)) continue;
    if (/^id\d+$/i.test(seg)) continue;
    if (seg.length < 3) continue;
    if (SKIP_SEGMENTS.has(seg.toLowerCase())) continue;
    const wordCount = (seg.match(/[-_]/g) ?? []).length + 1;
    const score = seg.length + wordCount * 3;
    if (score > bestScore) {
      bestScore = score;
      best = seg;
    }
  }
  if (!best) return hostname;

  const words = best.replace(/[-_]/g, " ").split(" ");
  if (words.length < 2) return hostname;

  return words
    .map((w, i) =>
      i === 0 || !LOWERCASE_WORDS.has(w.toLowerCase())
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w.toLowerCase(),
    )
    .join(" ");
}
