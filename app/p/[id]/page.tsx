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
  const { data: page } = await svc
    .from("pages")
    .select("id, url, label, last_fetched_at, latest_snapshot_id, hidden_snapshot_ids")
    .eq("id", id)
    .maybeSingle();
  if (!page) notFound();

  const { data: snapshots } = await svc
    .from("snapshots")
    .select("*")
    .eq("page_id", id)
    .order("fetched_at", { ascending: true });

  // Honor the same page-level dismissal list a watcher's getSites would —
  // anyone hitting the share link sees the same trimmed history their card
  // shows.
  const hidden = new Set((page.hidden_snapshot_ids ?? []) as string[]);
  const visible = ((snapshots ?? []) as SnapshotRow[]).filter(
    (s) => !hidden.has(s.id),
  );

  return <SharedPageView page={page} snapshots={visible} />;
}
