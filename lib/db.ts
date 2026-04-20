// Supabase-backed watch store. Replaces the IndexedDB-based lib/storage.ts.
//
// Persistence model (Phase 2): watches and pages only.
//   - addSite       → POST /api/watches (server upserts page + inserts watch;
//                     page inserts require service role, so they go through
//                     the API rather than direct supabase-js).
//   - getSites      → direct supabase-js read via RLS (own watches + shared pages).
//   - updateSite    → direct supabase-js update of watches columns.
//   - removeSite    → direct supabase-js delete (RLS scopes to owner).
//
// Snapshot-derived fields (lastContent/lastHash/lastScreenshot/history/…) are
// not persisted yet; Phase 3 wires them to the snapshots table.

import { createClient } from "@/utils/supabase/client";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/utils/supabase/database.types";
import { normalizeUrl } from "@/lib/url";

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
  lastContent: string | null;
  lastHtml: string | null;
  lastRawHtml: string | null;
  lastScreenshot: string | null;
  changeDescription: string | null;
  changed: boolean;
  error: string | null;
  history: ChangeEntry[];
  watchTarget: string | null;
  refreshInterval: number | null;
}

type Client = SupabaseClient<Database>;

function emptySite(overrides: Partial<WatchedSite>): WatchedSite {
  return {
    id: "",
    url: "",
    label: "",
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
    watchTarget: null,
    refreshInterval: null,
    ...overrides,
  };
}

// Cache the signed-in session across calls so we don't re-auth on every read.
let sessionPromise: Promise<{ client: Client; user: User }> | null = null;

async function ensureSession(): Promise<{ client: Client; user: User }> {
  if (!sessionPromise) sessionPromise = bootstrapSession();
  try {
    return await sessionPromise;
  } catch (err) {
    sessionPromise = null; // let the next call retry
    throw err;
  }
}

async function bootstrapSession(): Promise<{ client: Client; user: User }> {
  const client = createClient();
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session) {
    return { client, user: sessionData.session.user };
  }
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) {
    throw error ?? new Error("anonymous sign-in failed");
  }
  return { client, user: data.session.user };
}

/** Tests replace this with a mocked client + user. */
export function _setSessionForTests(
  override: { client: Client; user: User } | null,
): void {
  sessionPromise = override ? Promise.resolve(override) : null;
}

type WatchRow = {
  id: string;
  watch_target: string | null;
  pages: { id: string; url: string; label: string } | null;
};

function rowToSite(row: WatchRow): WatchedSite | null {
  if (!row.pages) return null;
  return emptySite({
    id: row.id,
    url: row.pages.url,
    label: row.pages.label,
    watchTarget: row.watch_target,
  });
}

export async function getSites(): Promise<WatchedSite[]> {
  const { client, user } = await ensureSession();
  const { data, error } = await client
    .from("watches")
    .select("id, watch_target, pages(id, url, label)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as WatchRow[])
    .map(rowToSite)
    .filter((s): s is WatchedSite => s !== null);
}

export async function addSite(
  rawUrl: string,
  opts?: { watchTarget?: string | null; refreshInterval?: number | null },
): Promise<WatchedSite> {
  const url = normalizeUrl(rawUrl);
  const { client } = await ensureSession();
  const {
    data: { session },
  } = await client.auth.getSession();
  const token = session?.access_token;
  const res = await fetch("/api/watches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url, watchTarget: opts?.watchTarget ?? null }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`addSite failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as {
    watch: { id: string; watch_target: string | null };
    page: { id: string; url: string; label: string };
  };
  return emptySite({
    id: json.watch.id,
    url: json.page.url,
    label: json.page.label,
    watchTarget: json.watch.watch_target,
    refreshInterval: opts?.refreshInterval ?? null,
  });
}

export async function updateSite(
  id: string,
  patch: Partial<WatchedSite>,
): Promise<void> {
  // Only watch-scoped columns persist in Phase 2. Everything else lives in
  // React state until snapshots land.
  const dbPatch: Database["public"]["Tables"]["watches"]["Update"] = {};
  if ("watchTarget" in patch) dbPatch.watch_target = patch.watchTarget ?? null;
  if (Object.keys(dbPatch).length === 0) return;

  const { client, user } = await ensureSession();
  const { error } = await client
    .from("watches")
    .update(dbPatch)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function removeSite(id: string): Promise<void> {
  const { client, user } = await ensureSession();
  const { error } = await client
    .from("watches")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

/** Tests only — clears the current user's watches. */
export async function _clearAll(): Promise<void> {
  const { client, user } = await ensureSession();
  await client.from("watches").delete().eq("user_id", user.id);
}
