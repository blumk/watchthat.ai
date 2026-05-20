import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/utils/supabase/service";
import { snapshotPublicUrl, type SnapshotRow } from "@/lib/snapshot";
import SharedPageView from "./SharedPageView";

// Always re-read on visit — snapshots change as fast as the dedup window
// (5 min) and a stale share page is worse than the extra DB hit.
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public base URL for canonical og:url values. Falls back to the prod
// hostname if the env var isn't configured (dev / preview deploys).
const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://watchthat.ai";

// Default metadata used for 404 / malformed-id paths. Keeps share links
// out of search engines regardless of whether they resolve.
const DEFAULT_METADATA: Metadata = {
  robots: { index: false, follow: false },
  title: "WatchThat — shared change log",
};

// Build dynamic OpenGraph / Twitter Card metadata so WhatsApp, iMessage,
// Slack, Twitter et al. render a real preview (page label, latest change
// description, latest screenshot) instead of a generic title. The screenshot
// already lives at a public Supabase Storage URL, so unfurlers can fetch it
// without auth.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return DEFAULT_METADATA;

  const svc = createServiceClient();
  const { data: page } = await svc
    .from("pages")
    .select("id, url, label, hidden_snapshot_ids")
    .eq("id", id)
    .maybeSingle();
  if (!page) return DEFAULT_METADATA;

  const hidden = new Set(((page.hidden_snapshot_ids ?? []) as string[]) || []);

  // Pull all non-hidden snapshots newest-first. The newest visible snapshot
  // supplies og:image; the newest visible snapshot with a meaningful
  // change_description supplies og:description (a quiet "Initial snapshot
  // taken." entry isn't a useful unfurl preview).
  const { data: snapshots } = await svc
    .from("snapshots")
    .select("id, screenshot_path, change_description, change_classification")
    .eq("page_id", id)
    .order("fetched_at", { ascending: false });
  const visible = (snapshots ?? []).filter((s) => !hidden.has(s.id));

  const newestWithScreenshot = visible.find((s) => s.screenshot_path);
  const latestChange = visible.find(
    (s) =>
      s.change_description &&
      (s.change_classification === "major" || s.change_classification === "minor"),
  );

  const title = `${page.label} — WatchThat`;
  let host = page.url;
  try {
    host = new URL(page.url).hostname.replace(/^www\./, "");
  } catch {
    // page.url should always be valid, but fall back gracefully
  }
  const description =
    latestChange?.change_description ?? `Tracking changes on ${host}.`;
  const ogImage = newestWithScreenshot?.screenshot_path
    ? snapshotPublicUrl(newestWithScreenshot.screenshot_path)
    : null;
  const canonicalUrl = `${PUBLIC_BASE_URL.replace(/\/+$/, "")}/p/${id}`;

  return {
    robots: { index: false, follow: false },
    title,
    description,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "website",
      siteName: "WatchThat",
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

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
