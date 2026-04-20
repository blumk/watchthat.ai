// Shared types + helpers for working with snapshot rows on the client and in
// API routes. Keeps the wire shape stable between /api/scrape and lib/db.

import type { Database } from "@/utils/supabase/database.types";

const SCREENSHOTS_BUCKET = "screenshots";

export type SnapshotRow = Database["public"]["Tables"]["snapshots"]["Row"];

// What /api/scrape returns in the snapshot field. We decorate the DB row with
// a resolved public URL so the client doesn't need to know about the bucket.
export type ClientSnapshot = SnapshotRow & { screenshot_url: string | null };

export interface ScrapeResponse {
  snapshot: ClientSnapshot;
  cached: boolean;
  newChange: boolean;
}

export function snapshotPublicUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${SCREENSHOTS_BUCKET}/${path}`;
}

export function decorateSnapshot(snap: SnapshotRow): ClientSnapshot {
  return { ...snap, screenshot_url: snapshotPublicUrl(snap.screenshot_path) };
}
