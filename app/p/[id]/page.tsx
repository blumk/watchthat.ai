import { notFound } from "next/navigation";
import { createServiceClient } from "@/utils/supabase/service";
import type { SnapshotRow } from "@/lib/snapshot";
import SharedPageView from "./SharedPageView";

// Always re-read on visit — snapshots change as fast as the dedup window
// (5 min) and a stale share page is worse than the extra DB hit.
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Don't let public share pages get indexed — they expose URLs and change
// logs that the watcher may consider casual rather than searchable.
export const metadata = {
  robots: { index: false, follow: false },
  title: "WatchThat — shared change log",
};

export default async function SharedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const svc = createServiceClient();
  // Two-step fetch: required columns first, optional hidden_snapshot_ids
  // second. Keeps the route functional during a window where the column
  // hasn't been applied to the cloud DB yet, and surfaces real query
  // failures via logs instead of silently 404-ing.
  const { data: page, error: pageErr } = await svc
    .from("pages")
    .select("id, url, label, last_fetched_at, latest_snapshot_id")
    .eq("id", id)
    .maybeSingle();
  if (pageErr) {
    console.error("[shared-page] page lookup failed", { id, error: pageErr });
    notFound();
  }
  if (!page) notFound();

  let hiddenIds: string[] = [];
  const { data: hidRow, error: hidErr } = await svc
    .from("pages")
    .select("hidden_snapshot_ids")
    .eq("id", id)
    .maybeSingle();
  if (hidErr) {
    // Column missing or other Postgres error — log and carry on with an
    // empty hide list rather than 404-ing the share view.
    console.warn("[shared-page] hidden_snapshot_ids lookup failed", { id, error: hidErr });
  } else if (hidRow?.hidden_snapshot_ids) {
    hiddenIds = hidRow.hidden_snapshot_ids as string[];
  }

  const { data: snapshots, error: snapErr } = await svc
    .from("snapshots")
    .select("*")
    .eq("page_id", id)
    .order("fetched_at", { ascending: true });
  if (snapErr) {
    console.error("[shared-page] snapshots lookup failed", { id, error: snapErr });
  }

  // Honor the same page-level dismissal list a watcher's getSites would —
  // anyone hitting the share link sees the same trimmed history their card
  // shows.
  const hidden = new Set(hiddenIds);
  const visible = ((snapshots ?? []) as SnapshotRow[]).filter(
    (s) => !hidden.has(s.id),
  );

  return <SharedPageView page={page} snapshots={visible} />;
}
