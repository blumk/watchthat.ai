import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface ChangeEntry {
  id: string;
  timestamp: number;
  description: string;
  classification: "major" | "minor" | "quiet" | "error";
  emoji?: string;
  oldValue?: string;
  newValue?: string;
  screenshot?: string | null;
}

export interface WatchedSite {
  id: string;
  url: string;
  label: string;
  lastChecked: number | null;
  lastHash: string | null;
  lastContent: string | null;  // markdown
  lastHtml: string | null;
  lastRawHtml: string | null;
  lastScreenshot: string | null;
  changeDescription: string | null;
  changed: boolean;
  error: string | null;
  history: ChangeEntry[];
  watchTarget: string | null;
  refreshInterval: number | null; // seconds; stored for future auto-polling
}

interface WatchdogDB extends DBSchema {
  sites: { key: string; value: WatchedSite };
}

let dbPromise: Promise<IDBPDatabase<WatchdogDB>> | null = null;

function getDB(): Promise<IDBPDatabase<WatchdogDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WatchdogDB>("watchdog", 1, {
      upgrade(db) {
        db.createObjectStore("sites", { keyPath: "id" });
      },
    }).then(async (db) => {
      // One-time migration from localStorage
      const LEGACY_KEY = "watchdog-sites-v1";
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LEGACY_KEY) : null;
      if (raw) {
        try {
          const sites = JSON.parse(raw) as WatchedSite[];
          const tx = db.transaction("sites", "readwrite");
          await Promise.all([...sites.map((s) => tx.store.put(s)), tx.done]);
          localStorage.removeItem(LEGACY_KEY);
        } catch {
          // malformed legacy data — skip migration
        }
      }
      return db;
    });
  }
  return dbPromise;
}

export async function getSites(): Promise<WatchedSite[]> {
  const db = await getDB();
  return db.getAll("sites");
}

// Structural/locale path segments to skip when extracting a human-readable label
const SKIP_SEGMENTS = new Set([
  "app", "apps", "store", "product", "products", "item", "items",
  "detail", "details", "page", "pages", "view", "show", "get",
  "us", "uk", "en", "fr", "de", "es", "it", "jp", "au", "ca",
  "www", "web", "m",
]);

function extractLabel(url: string): string {
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  const segments = new URL(url).pathname.split("/").filter(Boolean);

  // Score each segment: prefer longer slugs with hyphens/underscores (multi-word)
  let best = "";
  let bestScore = -1;
  for (const seg of segments) {
    // Skip pure numbers, id\d+ patterns, locale/structural words, and very short segments
    if (/^\d+$/.test(seg)) continue;
    if (/^id\d+$/i.test(seg)) continue;
    if (seg.length < 3) continue;
    const lower = seg.toLowerCase();
    if (SKIP_SEGMENTS.has(lower)) continue;

    const wordCount = (seg.match(/[-_]/g) ?? []).length + 1;
    const score = seg.length + wordCount * 3;
    if (score > bestScore) {
      bestScore = score;
      best = seg;
    }
  }

  if (!best) return hostname;

  // Convert slug to title case, keeping common prepositions/articles lowercase (unless first)
  const LOWERCASE_WORDS = new Set(["a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "by", "with"]);
  const words = best.replace(/[-_]/g, " ").split(" ");
  if (words.length < 2) return hostname; // single-word path — not meaningful enough

  const titled = words.map((w, i) =>
    i === 0 || !LOWERCASE_WORDS.has(w.toLowerCase())
      ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      : w.toLowerCase()
  ).join(" ");

  return titled;
}

export async function addSite(
  rawUrl: string,
  opts?: { watchTarget?: string | null; refreshInterval?: number | null }
): Promise<WatchedSite> {
  const url = rawUrl.match(/^https?:\/\//) ? rawUrl : `https://${rawUrl}`;
  const existing = (await getSites()).find((s) => s.url === url);
  if (existing) return existing;
  const label = extractLabel(url);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const site: WatchedSite = {
    id,
    url,
    label,
    lastChecked: null,
    lastHash: null,
    lastContent: null,
    lastHtml: null,
    lastRawHtml: null,
    lastScreenshot: null,
    changeDescription: null,
    changed: false,
    error: null,
    history: [],
    watchTarget: opts?.watchTarget ?? null,
    refreshInterval: opts?.refreshInterval ?? null,
  };
  const db = await getDB();
  await db.put("sites", site);
  return site;
}

export async function updateSite(id: string, patch: Partial<WatchedSite>): Promise<void> {
  const db = await getDB();
  const site = await db.get("sites", id);
  if (!site) return;
  // Strip unused HTML fields before persisting
  const { lastHtml: _h, lastRawHtml: _r, ...persistable } = patch;
  await db.put("sites", { ...site, ...persistable });
}

export async function removeSite(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("sites", id);
}

/** For use in tests only — clears all records from the store */
export async function _clearAll(): Promise<void> {
  const db = await getDB();
  await db.clear("sites");
}
