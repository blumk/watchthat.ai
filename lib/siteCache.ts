// Stale-while-revalidate cache for the watch list. Reads localStorage on
// first paint so the user sees their previous list instantly; the real
// getSites() call replaces it once Supabase auth + the query resolve.

import type { WatchedSite } from "@/lib/db";

const KEY = "watchthat:sites:v1";

export function readCachedSites(): WatchedSite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WatchedSite[];
  } catch {
    return [];
  }
}

export function writeCachedSites(sites: WatchedSite[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sites));
  } catch {
    // localStorage full or disabled — cache is best-effort.
  }
}

export function clearCachedSites(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
