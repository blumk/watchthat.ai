import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface ChangeEntry {
  id: string;
  timestamp: number;
  description: string;
  classification: "major" | "minor" | "quiet" | "error";
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

export async function addSite(rawUrl: string): Promise<WatchedSite> {
  const url = rawUrl.match(/^https?:\/\//) ? rawUrl : `https://${rawUrl}`;
  const existing = (await getSites()).find((s) => s.url === url);
  if (existing) return existing;
  const label = new URL(url).hostname;
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
