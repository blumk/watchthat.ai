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
import { snapshotPublicUrl, type SnapshotRow } from "@/lib/snapshot";
import type { FactBag } from "@/lib/facts";
import { matchTargetToFact, type TargetMatch } from "@/lib/watch-target-match";

export interface ChangeEntry {
  id: string;
  timestamp: number;
  description: string;
  classification: "major" | "minor" | "quiet" | "error";
  emoji?: string;
  oldValue?: string;
  newValue?: string;
  screenshot?: string | null;
  // Set when the user's watch target resolves to a fact-bag key AND the
  // value at this snapshot differs from the previously-recorded value for
  // the same key. Rendered as a prefix like "★ 4.5 → 4.4" in the log.
  trackedDelta?: {
    displayName: string;
    before?: string;
    after: string;
  };
}

export interface WatchedSite {
  id: string;
  // The shared page row this watch points at. Distinct from `id` (the watch
  // row id, per-user) — needed to build public share URLs like /p/<pageId>.
  pageId: string;
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
  // Free-form user notes refining what to track ("the GA price labeled
  // '### General Admission' in the listings table; ignore JSON-LD floor
  // prices"). Surfaced to describeChange on every scrape so the model
  // gets per-page user guidance that survives across runs.
  targetNotes: string | null;
  refreshInterval: number | null;
  // When the background cron is next due to scrape this page (epoch ms).
  // Maintained server-side by triggers; surfaced here so cards can render
  // "Next check in X". Null when the page has no active watchers (cron
  // skipped) or for sites that have never been scraped.
  nextDueAt: number | null;
  // Current resolved watch-target value pulled from the latest snapshot's
  // fact bag. Null when the watch target is unset, doesn't match any fact
  // key, or the latest snapshot has no facts.
  trackedFact: TargetMatch | null;
}

type Client = SupabaseClient<Database>;

function emptySite(overrides: Partial<WatchedSite>): WatchedSite {
  return {
    id: "",
    pageId: "",
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
    targetNotes: null,
    refreshInterval: null,
    nextDueAt: null,
    trackedFact: null,
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
  target_notes: string | null;
  refresh_interval_seconds: number;
  hidden_snapshot_ids: string[] | null;
  pages: {
    id: string;
    url: string;
    label: string;
    latest_snapshot_id: string | null;
    last_fetched_at: string | null;
    next_due_at: string | null;
  } | null;
};

function rowToSite(row: WatchRow): WatchedSite | null {
  if (!row.pages) return null;
  return emptySite({
    id: row.id,
    pageId: row.pages.id,
    url: row.pages.url,
    label: row.pages.label,
    watchTarget: row.watch_target,
    targetNotes: row.target_notes,
    refreshInterval: row.refresh_interval_seconds,
    nextDueAt: row.pages.next_due_at
      ? new Date(row.pages.next_due_at).getTime()
      : null,
  });
}

function applySnapshot(
  site: WatchedSite,
  snap: SnapshotRow,
  pageLastFetchedAt: string | null,
  resolvedMarkdown: string | null,
): WatchedSite {
  const changed =
    snap.change_classification !== null && snap.change_classification !== "quiet";
  // lastChecked is "when the page was last fetched" — uses pages.last_fetched_at
  // which bumps on every /api/scrape hit (including hash-equal short-circuits).
  // snap.fetched_at would freeze at the moment the content was first captured.
  const checkedAt = pageLastFetchedAt
    ? new Date(pageLastFetchedAt).getTime()
    : new Date(snap.fetched_at).getTime();
  return {
    ...site,
    lastContent: resolvedMarkdown,
    lastHash: snap.content_hash,
    lastScreenshot: snapshotPublicUrl(snap.screenshot_path),
    lastChecked: checkedAt,
    changeDescription: snap.change_description,
    changed,
  };
}

function snapshotToEntry(snap: SnapshotRow): ChangeEntry | null {
  if (!snap.change_description) return null;
  const cls = snap.change_classification;
  if (cls !== "major" && cls !== "minor") return null;
  const entry: ChangeEntry = {
    id: snap.id,
    timestamp: new Date(snap.fetched_at).getTime(),
    description: snap.change_description,
    classification: cls,
    screenshot: snapshotPublicUrl(snap.screenshot_path),
  };
  if (snap.change_emoji) entry.emoji = snap.change_emoji;
  return entry;
}

export async function getSites(): Promise<WatchedSite[]> {
  const { client, user } = await ensureSession();
  const { data, error } = await client
    .from("watches")
    .select(
      "id, watch_target, target_notes, refresh_interval_seconds, hidden_snapshot_ids, pages(id, url, label, latest_snapshot_id, last_fetched_at, next_due_at)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as WatchRow[];
  const watches = rows
    .map(rowToSite)
    .filter((s): s is WatchedSite => s !== null);
  if (watches.length === 0) return watches;

  const pageIds = rows
    .map((r) => r.pages?.id ?? null)
    .filter((id): id is string => id !== null);

  // Pull latest snapshot per page + full history of changed snapshots in a
  // single query. RLS scopes rows to pages the user watches.
  const { data: snaps } = await client
    .from("snapshots")
    .select("*")
    .in("page_id", pageIds)
    .order("fetched_at", { ascending: true });
  const byId = new Map<string, SnapshotRow>();
  // (page_id|content_hash) → markdown of the earliest snapshot carrying the
  // actual text. Hash-equal re-inserts write markdown=null, so we backfill
  // lastContent from the original snapshot of that hash.
  const markdownByHash = new Map<string, string>();
  const historyByPage = new Map<string, ChangeEntry[]>();
  const firstSeen = new Set<string>();
  for (const s of (snaps ?? []) as SnapshotRow[]) {
    byId.set(s.id, s);
    if (s.markdown !== null) {
      const key = `${s.page_id}|${s.content_hash}`;
      if (!markdownByHash.has(key)) markdownByHash.set(key, s.markdown);
    }
    const arr = historyByPage.get(s.page_id) ?? [];
    if (!firstSeen.has(s.page_id)) {
      firstSeen.add(s.page_id);
      // Earliest snapshot per page — render as an "Initial snapshot taken."
      // quiet entry so the original screenshot stays accessible in the log.
      arr.push({
        id: s.id,
        timestamp: new Date(s.fetched_at).getTime(),
        description: "Initial snapshot taken.",
        classification: "quiet",
        screenshot: snapshotPublicUrl(s.screenshot_path),
      });
    } else {
      const entry = snapshotToEntry(s);
      if (entry) arr.push(entry);
    }
    historyByPage.set(s.page_id, arr);
  }

  return watches.map((site, i) => {
    const row = rows[i];
    const pageId = row.pages?.id ?? null;
    const pageSnapId = row.pages?.latest_snapshot_id;
    const snap = pageSnapId ? byId.get(pageSnapId) : null;
    const pageHistory = pageId ? historyByPage.get(pageId) ?? [] : [];
    // Filter out snapshots this watcher has explicitly dismissed. Page-
    // level history is shared, so other watchers still see them.
    const hiddenIds = new Set(row.hidden_snapshot_ids ?? []);
    const baseHistory =
      hiddenIds.size > 0
        ? pageHistory.filter((e) => !hiddenIds.has(e.id))
        : pageHistory;
    const resolvedMarkdown = snap
      ? snap.markdown ?? markdownByHash.get(`${snap.page_id}|${snap.content_hash}`) ?? null
      : null;

    // Resolve the user's watch target against the latest snapshot's fact
    // bag. When a match lands, annotate each history entry with the before
    // → after delta for that key.
    const latestFacts = (snap?.facts as FactBag | null) ?? {};
    const trackedFact = matchTargetToFact(site.watchTarget, latestFacts);
    const history = trackedFact
      ? annotateHistoryWithDelta(baseHistory, byId, trackedFact)
      : baseHistory;

    const hydrated = snap
      ? applySnapshot(site, snap, row.pages?.last_fetched_at ?? null, resolvedMarkdown)
      : site;
    return { ...hydrated, history, trackedFact };
  });
}

// Walk history (already chronological from getSites) and attach a
// trackedDelta to each entry whose snapshot carries a different value for
// the tracked key than the last entry we saw one on. Pure annotation — the
// shared historyByPage entries are preserved by cloning.
function annotateHistoryWithDelta(
  entries: ChangeEntry[],
  byId: Map<string, SnapshotRow>,
  match: TargetMatch,
): ChangeEntry[] {
  let lastValue: string | undefined;
  return entries.map((entry) => {
    const snap = byId.get(entry.id);
    const snapFacts = (snap?.facts as FactBag | null) ?? {};
    const current = snapFacts[match.key];
    if (current === undefined) return entry;
    if (current === lastValue) return entry;
    const annotated: ChangeEntry = {
      ...entry,
      trackedDelta: {
        displayName: match.displayName,
        before: lastValue,
        after: current,
      },
    };
    // For the very first observed value of a tracked target, fold the
    // value directly into the initial-snapshot description so users see
    // "Initial snapshot taken with rating 4.5." instead of the trackedDelta
    // prefix on a generic "Initial snapshot taken." line.
    if (lastValue === undefined && entry.description === "Initial snapshot taken.") {
      annotated.description = `Initial snapshot taken with ${match.displayName.toLowerCase()} ${current}.`;
      // Suppress the prefix render — the value is already in the description.
      delete annotated.trackedDelta;
    }
    lastValue = current;
    return annotated;
  });
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
    pageId: json.page.id,
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
  // Only watch-scoped columns persist. Everything else lives in React state.
  const dbPatch: Database["public"]["Tables"]["watches"]["Update"] = {};
  if ("watchTarget" in patch) dbPatch.watch_target = patch.watchTarget ?? null;
  if ("targetNotes" in patch) {
    const trimmed = patch.targetNotes?.trim();
    dbPatch.target_notes = trimmed ? trimmed : null;
  }
  if (
    "refreshInterval" in patch &&
    typeof patch.refreshInterval === "number" &&
    patch.refreshInterval >= 3600
  ) {
    // The DB has a 1h floor; round trip would otherwise reject. WatchSetup
    // never offers anything below 3600 so this is just a defence-in-depth.
    dbPatch.refresh_interval_seconds = patch.refreshInterval;
  }
  if (Object.keys(dbPatch).length === 0) return;

  const { client, user } = await ensureSession();
  const { error } = await client
    .from("watches")
    .update(dbPatch)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

// Mark a snapshot id as hidden from this user's change log. Idempotent —
// we de-dup before writing. RLS scopes the update to the caller's own
// watch row. Read-modify-write is intentionally not atomic; double-tap
// races just produce the same final state.
export async function hideHistoryEntry(
  siteId: string,
  snapshotId: string,
): Promise<void> {
  const { client, user } = await ensureSession();
  const { data: existing } = await client
    .from("watches")
    .select("hidden_snapshot_ids")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();
  const current = (existing?.hidden_snapshot_ids ?? []) as string[];
  if (current.includes(snapshotId)) return;
  const next = Array.from(new Set([...current, snapshotId]));
  const { error } = await client
    .from("watches")
    .update({ hidden_snapshot_ids: next })
    .eq("id", siteId)
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
